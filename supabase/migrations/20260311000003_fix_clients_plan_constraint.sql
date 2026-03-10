-- Allow 'free' plan for clients who sign up via the app
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_plan_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_plan_check 
  CHECK (plan IN ('free', 'starter', 'traction', 'growth360', 'partner', 'enterprise'));
