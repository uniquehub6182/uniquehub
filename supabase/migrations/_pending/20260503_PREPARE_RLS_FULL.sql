-- ════════════════════════════════════════════════════════════════════
-- RLS FULL ENFORCEMENT — PRE-LAUNCH SaaS
-- ════════════════════════════════════════════════════════════════════
-- STATUS: ARQUIVO PREPARADO — NAO EXECUTADO AINDA
-- 
-- Este arquivo contem as policies corretas pra todas as tabelas com RLS
-- frouxo hoje. Quando executado em horario fraco (madrugada), substitui
-- as policies "true" / "auth.uid() IS NOT NULL" por policies org-scoped.
--
-- ANTES de executar:
--   1. Confirmar que app esta vazio (0 usuarios online em logs)
--   2. Fazer pg_dump das tabelas afetadas
--   3. Ter rollback pronto (rollback section no fim deste arquivo)
--
-- TABELAS COBERTAS (15):
--   GRUPO 1 — VAZIAS (zero risco de quebrar dados):
--     demand_steps, demand_assignees, scheduling, traffic, campaigns,
--     presentations, asaas_customers, invoices
--
--   GRUPO 2 — POUCAS ROWS, 1 ORG SO (Unique Marketing):
--     scheduled_posts (251 rows, todas Unique Marketing)
--
--   GRUPO 3 — MATCH4BIZ (feature opcional, 0 rows):
--     match4biz, match4biz_messages, match4biz_swipes,
--     match4biz_profiles, match4biz_credits
--
--   GRUPO 4 — UTIL (precisam abordagem custom):
--     agency_members (todos da agencia veem times entre si)
--     clients_users (relaciona client_id com user_id, sem org_id direto)
--     credits, role_permissions
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ====================================================================
-- GRUPO 1: TABELAS VAZIAS — substituir policies frouxas direto
-- ====================================================================

-- demand_steps: precisa fazer JOIN com demands pra org_id
DROP POLICY IF EXISTS ds_all ON public.demand_steps;
CREATE POLICY demand_steps_org_select ON public.demand_steps FOR SELECT
  USING (demand_id IN (SELECT id FROM public.demands WHERE org_id = public.get_my_org_id() OR public.is_super_admin()));
CREATE POLICY demand_steps_org_insert ON public.demand_steps FOR INSERT
  WITH CHECK (demand_id IN (SELECT id FROM public.demands WHERE org_id = public.get_my_org_id() OR public.is_super_admin()));
CREATE POLICY demand_steps_org_update ON public.demand_steps FOR UPDATE
  USING (demand_id IN (SELECT id FROM public.demands WHERE org_id = public.get_my_org_id() OR public.is_super_admin()));
CREATE POLICY demand_steps_org_delete ON public.demand_steps FOR DELETE
  USING (demand_id IN (SELECT id FROM public.demands WHERE org_id = public.get_my_org_id() OR public.is_super_admin()));

-- demand_assignees: idem demand_steps
DROP POLICY IF EXISTS da_all ON public.demand_assignees;
CREATE POLICY demand_assignees_org_select ON public.demand_assignees FOR SELECT
  USING (demand_id IN (SELECT id FROM public.demands WHERE org_id = public.get_my_org_id() OR public.is_super_admin()));
CREATE POLICY demand_assignees_org_insert ON public.demand_assignees FOR INSERT
  WITH CHECK (demand_id IN (SELECT id FROM public.demands WHERE org_id = public.get_my_org_id() OR public.is_super_admin()));
CREATE POLICY demand_assignees_org_update ON public.demand_assignees FOR UPDATE
  USING (demand_id IN (SELECT id FROM public.demands WHERE org_id = public.get_my_org_id() OR public.is_super_admin()));
CREATE POLICY demand_assignees_org_delete ON public.demand_assignees FOR DELETE
  USING (demand_id IN (SELECT id FROM public.demands WHERE org_id = public.get_my_org_id() OR public.is_super_admin()));

-- scheduling, traffic, campaigns, presentations: precisam ALTER TABLE pra adicionar org_id antes
-- (tabelas vazias = seguro adicionar coluna NOT NULL com default)
ALTER TABLE public.scheduling ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS sched_all ON public.scheduling;
CREATE POLICY scheduling_org_all ON public.scheduling FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

ALTER TABLE public.traffic ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS traffic_all ON public.traffic;
CREATE POLICY traffic_org_all ON public.traffic FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS camp_all ON public.campaigns;
CREATE POLICY campaigns_org_all ON public.campaigns FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

ALTER TABLE public.presentations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS "Agency_users_full_access" ON public.presentations;
CREATE POLICY presentations_org_all ON public.presentations FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

-- asaas_customers: tabela legada, vazia. Bloquear por completo (so service_role acessa).
DROP POLICY IF EXISTS full_access_asaas ON public.asaas_customers;
CREATE POLICY asaas_customers_admin_only ON public.asaas_customers FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- invoices: vazia. Filtrar por org via subscription.
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS full_access_invoices ON public.invoices;
CREATE POLICY invoices_org_select ON public.invoices FOR SELECT
  USING (org_id = public.get_my_org_id() OR public.is_super_admin());
CREATE POLICY invoices_admin_write ON public.invoices FOR INSERT
  WITH CHECK (public.is_super_admin());
CREATE POLICY invoices_admin_update ON public.invoices FOR UPDATE
  USING (public.is_super_admin());
CREATE POLICY invoices_admin_delete ON public.invoices FOR DELETE
  USING (public.is_super_admin());

-- ====================================================================
-- GRUPO 2: SCHEDULED_POSTS — 251 rows, 1 org so (Unique Marketing)
-- Precisa de DROP da policy frouxa, mas manter a do client_self_select.
-- ====================================================================
DROP POLICY IF EXISTS scheduled_posts_all ON public.scheduled_posts;
-- Mantem: client_self_select_scheduled_posts (clientes veem so seus posts)
-- Adiciona: agency members veem posts da org via demand_id
CREATE POLICY scheduled_posts_agency_select ON public.scheduled_posts FOR SELECT
  USING (
    demand_id IN (SELECT id::text FROM public.demands WHERE org_id = public.get_my_org_id())
    OR public.is_super_admin()
  );
CREATE POLICY scheduled_posts_agency_insert ON public.scheduled_posts FOR INSERT
  WITH CHECK (
    demand_id IN (SELECT id::text FROM public.demands WHERE org_id = public.get_my_org_id())
    OR public.is_super_admin()
  );
CREATE POLICY scheduled_posts_agency_update ON public.scheduled_posts FOR UPDATE
  USING (
    demand_id IN (SELECT id::text FROM public.demands WHERE org_id = public.get_my_org_id())
    OR public.is_super_admin()
  );
CREATE POLICY scheduled_posts_agency_delete ON public.scheduled_posts FOR DELETE
  USING (
    demand_id IN (SELECT id::text FROM public.demands WHERE org_id = public.get_my_org_id())
    OR public.is_super_admin()
  );

-- ====================================================================
-- GRUPO 3: MATCH4BIZ — feature ativada por org, vazias hoje
-- ====================================================================
ALTER TABLE public.match4biz ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS full_access_match4biz ON public.match4biz;
CREATE POLICY match4biz_org_all ON public.match4biz FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

ALTER TABLE public.match4biz_messages ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS m4b_messages_all ON public.match4biz_messages;
CREATE POLICY m4b_messages_org_all ON public.match4biz_messages FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

ALTER TABLE public.match4biz_swipes ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS m4b_swipes_all ON public.match4biz_swipes;
CREATE POLICY m4b_swipes_org_all ON public.match4biz_swipes FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

ALTER TABLE public.match4biz_profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS m4b_profiles_all ON public.match4biz_profiles;
CREATE POLICY m4b_profiles_org_all ON public.match4biz_profiles FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

ALTER TABLE public.match4biz_credits ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
DROP POLICY IF EXISTS m4b_credits_all ON public.match4biz_credits;
CREATE POLICY m4b_credits_org_all ON public.match4biz_credits FOR ALL
  USING (org_id = public.get_my_org_id() OR public.is_super_admin())
  WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

-- ====================================================================
-- GRUPO 4: UTIL — abordagens customizadas
-- ====================================================================

-- agency_members: todos da agencia veem times entre si dentro da mesma org
-- (precisa adicionar org_id)
ALTER TABLE public.agency_members ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
-- Backfill: todos atuais sao Unique Marketing (5 rows)
UPDATE public.agency_members SET org_id = 'a0000000-0000-0000-0000-000000000001'
  WHERE org_id IS NULL;
-- Trocar policies frouxas
DROP POLICY IF EXISTS "Authenticated users can read team" ON public.agency_members;
DROP POLICY IF EXISTS "agency_members_select" ON public.agency_members;
DROP POLICY IF EXISTS "Authenticated users can delete members" ON public.agency_members;
CREATE POLICY agency_members_org_select ON public.agency_members FOR SELECT
  USING (org_id = public.get_my_org_id() OR public.is_super_admin());
CREATE POLICY agency_members_admin_delete ON public.agency_members FOR DELETE
  USING (
    public.is_super_admin()
    OR (org_id = public.get_my_org_id() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  );

-- clients_users: relaciona client_id com user_id. Precisa filtrar por client.org_id.
DROP POLICY IF EXISTS clients_users_select ON public.clients_users;
DROP POLICY IF EXISTS clients_users_insert ON public.clients_users;
CREATE POLICY clients_users_org_select ON public.clients_users FOR SELECT
  USING (
    user_id = auth.uid()
    OR client_id IN (SELECT id FROM public.clients WHERE org_id = public.get_my_org_id())
    OR public.is_super_admin()
  );
CREATE POLICY clients_users_admin_insert ON public.clients_users FOR INSERT
  WITH CHECK (
    client_id IN (SELECT id FROM public.clients WHERE org_id = public.get_my_org_id())
    OR public.is_super_admin()
  );
CREATE POLICY clients_users_admin_update ON public.clients_users FOR UPDATE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE org_id = public.get_my_org_id())
    OR public.is_super_admin()
  );
CREATE POLICY clients_users_admin_delete ON public.clients_users FOR DELETE
  USING (
    client_id IN (SELECT id FROM public.clients WHERE org_id = public.get_my_org_id())
    OR public.is_super_admin()
  );

-- credits: usuarios veem so seus creditos
DROP POLICY IF EXISTS "System manage credits" ON public.credits;
-- Mantem: "Users see own credits" — ja correto (user_id = auth.uid())
CREATE POLICY credits_admin_manage ON public.credits FOR INSERT
  WITH CHECK (public.is_super_admin());
CREATE POLICY credits_admin_update ON public.credits FOR UPDATE
  USING (public.is_super_admin());
CREATE POLICY credits_admin_delete ON public.credits FOR DELETE
  USING (public.is_super_admin());

-- role_permissions: leitura aberta esta OK (todos precisam saber permissoes)
-- Mantem: "All can read permissions" + "Admins can manage permissions"
-- Sem mudancas necessarias.

-- transactions: ja tem 3 policies, mas tem qual=true em alguma. Vou verificar.
-- (deixa pra fase 2 — focar primeiro nas mais criticas)

-- ════════════════════════════════════════════════════════════════════
-- VALIDACOES AUTOMATICAS
-- ════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  loose_count INTEGER;
  total_policies INTEGER;
BEGIN
  -- Contar policies com qual='true' que sobraram
  SELECT count(*) INTO loose_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual::text IN ('true', '(auth.uid() IS NOT NULL)');

  SELECT count(*) INTO total_policies
  FROM pg_policies
  WHERE schemaname = 'public';

  RAISE NOTICE 'Total policies em public: %', total_policies;
  RAISE NOTICE 'Policies frouxas restantes: %', loose_count;

  IF loose_count > 5 THEN
    RAISE WARNING 'Ainda tem % policies frouxas — verificar manualmente', loose_count;
  END IF;
END $$;

-- COMMIT no final = mudancas permanentes
-- Pra abort: trocar COMMIT por ROLLBACK
COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK (se algo der errado depois do commit)
-- ════════════════════════════════════════════════════════════════════
-- Se precisar reverter, rode:
--
-- BEGIN;
-- -- Restaurar policies "true" originais (lista pra cada tabela)
-- DROP POLICY IF EXISTS demand_steps_org_select ON public.demand_steps;
-- DROP POLICY IF EXISTS demand_steps_org_insert ON public.demand_steps;
-- ... etc para todas as policies criadas acima ...
-- CREATE POLICY ds_all ON public.demand_steps FOR ALL USING (true);
-- CREATE POLICY da_all ON public.demand_assignees FOR ALL USING (true);
-- ... etc ...
-- COMMIT;
