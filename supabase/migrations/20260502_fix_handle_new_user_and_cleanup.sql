BEGIN;

-- ============================================================
-- PASSO 1: Refatorar trigger handle_new_user
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  pending_invite_id UUID;
  user_role TEXT;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'member');

  -- Insert into profiles (sempre, pra todos os users)
  INSERT INTO public.profiles (id, email, name, nick, phone, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'nick', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Clientes (portal do cliente) NAO viram agency_members.
  -- agency_members eh exclusivo para colaboradores da agencia.
  IF user_role = 'cliente' THEN
    RETURN NEW;
  END IF;

  -- Verifica se ha um convite pendente para este email (fluxo de invite-first)
  SELECT id INTO pending_invite_id
  FROM public.agency_members
  WHERE email = NEW.email AND status = 'pendente' AND user_id IS NULL
  LIMIT 1;

  IF pending_invite_id IS NOT NULL THEN
    -- Linka usuario a convite existente. Status passa de pendente -> ativo
    -- (foi convidado, agora confirmou cadastro = ativo).
    UPDATE public.agency_members
    SET user_id = NEW.id, status = 'ativo'
    WHERE id = pending_invite_id;
  ELSE
    -- Cadastro espontaneo (sem convite). Cria como pendente,
    -- aguarda aprovacao do admin da agencia.
    INSERT INTO public.agency_members (user_id, name, email, role, job_title, status)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      NEW.email,
      user_role,
      COALESCE(NEW.raw_user_meta_data->>'job_title', ''),
      'pendente'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================
-- PASSO 2: Cleanup dos 26 agency_members com role='cliente'
-- ============================================================
DELETE FROM public.agency_members WHERE role = 'cliente';

-- ============================================================
-- PASSO 3: Verificacoes
-- ============================================================
-- Confirma que sobrou ZERO row com role='cliente' em agency_members
DO $$
DECLARE
  cli_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO cli_count FROM public.agency_members WHERE role = 'cliente';
  SELECT COUNT(*) INTO total_count FROM public.agency_members;
  IF cli_count > 0 THEN
    RAISE EXCEPTION 'CLEANUP FALHOU: ainda ha % rows com role=cliente em agency_members', cli_count;
  END IF;
  RAISE NOTICE 'OK: 0 rows com role=cliente em agency_members. Total agora: %', total_count;
END $$;

COMMIT;
