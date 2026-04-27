-- Fix v2: portal do cliente após cleanup das policies permissivas
--
-- Causa: clientes autenticados não estão em `agency_members`, então
-- `get_my_org_id()` retorna NULL pra eles e as policies org-scoped travam
-- todo o portal do cliente (demands, clients, scheduled_posts, scores).
--
-- Solução: função `get_my_client_id()` SECURITY DEFINER que resolve qual
-- cliente pertence ao auth.uid() (mesma lógica do front: 1) extras.linked_client_id,
-- 2) contact_email match) + policies adicionais permissive (OR) para self-access.
--
-- v2: função retorna TEXT pra evitar mismatch UUID/TEXT em policies onde
-- algumas colunas (ex: client_id em certas tabelas) podem não ser UUID.

CREATE OR REPLACE FUNCTION public.get_my_client_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_extras_value TEXT;
  v_linked TEXT;
  v_client_id UUID;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  BEGIN
    SELECT value INTO v_extras_value
    FROM public.app_settings
    WHERE key = 'client_extras_' || v_uid::text
    LIMIT 1;

    IF v_extras_value IS NOT NULL AND v_extras_value <> '' THEN
      v_linked := (v_extras_value::jsonb)->>'linked_client_id';
      IF v_linked IS NOT NULL AND v_linked <> '' THEN
        BEGIN
          v_client_id := v_linked::uuid;
          PERFORM 1 FROM public.clients WHERE id = v_client_id;
          IF FOUND THEN RETURN v_client_id::text; END IF;
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NOT NULL AND v_email <> '' THEN
    SELECT id INTO v_client_id
    FROM public.clients
    WHERE LOWER(TRIM(contact_email)) = LOWER(TRIM(v_email))
    LIMIT 1;
    IF v_client_id IS NOT NULL THEN RETURN v_client_id::text; END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_client_id() TO authenticated;

-- Policies adicionais (permissive) com casts defensivos pra TEXT
DROP POLICY IF EXISTS "client_self_select_clients" ON public.clients;
CREATE POLICY "client_self_select_clients" ON public.clients
FOR SELECT TO authenticated USING (id::text = public.get_my_client_id());

DROP POLICY IF EXISTS "client_self_select_demands" ON public.demands;
CREATE POLICY "client_self_select_demands" ON public.demands
FOR SELECT TO authenticated USING (client_id::text = public.get_my_client_id());

DROP POLICY IF EXISTS "client_self_update_demands" ON public.demands;
CREATE POLICY "client_self_update_demands" ON public.demands
FOR UPDATE TO authenticated
USING (client_id::text = public.get_my_client_id())
WITH CHECK (client_id::text = public.get_my_client_id());

DROP POLICY IF EXISTS "client_self_select_scheduled_posts" ON public.scheduled_posts;
CREATE POLICY "client_self_select_scheduled_posts" ON public.scheduled_posts
FOR SELECT TO authenticated
USING (demand_id::text IN (SELECT id::text FROM public.demands WHERE client_id::text = public.get_my_client_id()));

DROP POLICY IF EXISTS "client_self_select_scores" ON public.client_scores;
CREATE POLICY "client_self_select_scores" ON public.client_scores
FOR SELECT TO authenticated USING (client_id::text = public.get_my_client_id());

DROP POLICY IF EXISTS "client_self_insert_scores" ON public.client_scores;
CREATE POLICY "client_self_insert_scores" ON public.client_scores
FOR INSERT TO authenticated WITH CHECK (client_id::text = public.get_my_client_id());

DROP POLICY IF EXISTS "client_self_select_extras" ON public.app_settings;
CREATE POLICY "client_self_select_extras" ON public.app_settings
FOR SELECT TO authenticated USING (key = 'client_extras_' || auth.uid()::text);

DROP POLICY IF EXISTS "client_self_insert_extras" ON public.app_settings;
CREATE POLICY "client_self_insert_extras" ON public.app_settings
FOR INSERT TO authenticated WITH CHECK (key = 'client_extras_' || auth.uid()::text);

DROP POLICY IF EXISTS "client_self_update_extras" ON public.app_settings;
CREATE POLICY "client_self_update_extras" ON public.app_settings
FOR UPDATE TO authenticated
USING (key = 'client_extras_' || auth.uid()::text)
WITH CHECK (key = 'client_extras_' || auth.uid()::text);
