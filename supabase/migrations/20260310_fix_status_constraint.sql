-- Drop the restrictive check constraint and allow our status values
ALTER TABLE public.agency_members DROP CONSTRAINT IF EXISTS agency_members_status_check;
ALTER TABLE public.agency_members ADD CONSTRAINT agency_members_status_check CHECK (status IN ('pendente', 'ativo', 'offline', 'online', 'bloqueado', 'inativo'));
