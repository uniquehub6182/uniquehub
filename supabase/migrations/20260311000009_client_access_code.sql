-- Add access code column to clients
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS access_code text;
-- Generate unique 6-char codes for all existing clients
UPDATE public.clients SET access_code = upper(substr(md5(id::text || now()::text), 1, 6)) WHERE access_code IS NULL;
