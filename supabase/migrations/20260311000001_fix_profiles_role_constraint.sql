-- Drop the existing check constraint that doesn't allow 'cliente'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Recreate with 'cliente' added
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('admin', 'member', 'cliente'));

-- Delete ghost auth users that were created from failed signups (contato@uniquehub.com.br)
DELETE FROM auth.users WHERE email = 'contato@uniquehub.com.br';
