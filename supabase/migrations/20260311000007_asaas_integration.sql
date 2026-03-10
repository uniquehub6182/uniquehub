-- Add Asaas customer ID to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS asaas_customer_id text;
CREATE INDEX IF NOT EXISTS idx_clients_asaas ON public.clients(asaas_customer_id);
