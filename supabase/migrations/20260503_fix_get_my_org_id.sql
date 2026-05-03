BEGIN;

-- get_my_org_id estava tentando ler agency_members.org_id, mas essa coluna
-- nao existe. A tabela correta com org_id eh public.org_members.
-- Sem esse fix, RLS bloqueia leitura de organizations e quebra app inteiro.
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE v UUID;
BEGIN
  -- Tenta org_members primeiro (multi-tenant: source of truth)
  SELECT org_id INTO v FROM public.org_members
  WHERE user_id = auth.uid()
  LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;

  -- Fallback: organizations.owner_id (caso o user seja owner direto)
  SELECT id INTO v FROM public.organizations WHERE owner_id = auth.uid() LIMIT 1;
  RETURN v;
END $function$;

-- Validacao imediata
DO $$
DECLARE result UUID;
BEGIN
  -- testa que a funcao roda sem erro (vai retornar NULL pq nao tem auth.uid no contexto)
  result := public.get_my_org_id();
  RAISE NOTICE 'get_my_org_id() executou sem erro. Retorno: %', result;
END $$;

COMMIT;
