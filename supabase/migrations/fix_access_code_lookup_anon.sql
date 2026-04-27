-- Fix: Permitir lookup de access_code durante cadastro de cliente (usuário anon)
-- 
-- Contexto: Após o cleanup das policies permissivas (drop dos `qual = true` /
-- `auth.uid() IS NOT NULL`), o anon ficou sem SELECT na tabela `clients`.
-- O fluxo de cadastro do cliente precisa validar o access_code ANTES do
-- usuário ter conta (auth.uid() é null), o que estava bloqueando.
--
-- Solução: RPC SECURITY DEFINER que faz lookup controlado.
-- - Não expõe SELECT em `clients` para anon
-- - Aceita só o código, retorna só {id, name, org_id}
-- - Match case-insensitive + trim defensivo

CREATE OR REPLACE FUNCTION public.lookup_client_by_access_code(p_code TEXT)
RETURNS TABLE(id UUID, name TEXT, org_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_code IS NULL OR LENGTH(TRIM(p_code)) < 4 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.org_id
  FROM public.clients c
  WHERE UPPER(TRIM(c.access_code)) = UPPER(TRIM(p_code))
  LIMIT 1;
END;
$$;

-- Conceder execução para anon (cadastro) e authenticated (re-validação)
REVOKE ALL ON FUNCTION public.lookup_client_by_access_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_client_by_access_code(TEXT) TO anon, authenticated;

-- Verificação
SELECT 'Função criada. Teste com: SELECT * FROM lookup_client_by_access_code(''2ZJPF0'');' AS status;
