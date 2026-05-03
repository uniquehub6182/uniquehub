-- ============================================================
-- Stripe Billing — colunas e índices necessários
-- ============================================================

-- 1. Customer ID Stripe na organização
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_orgs_stripe_customer ON public.organizations(stripe_customer_id);

-- 2. Garantir colunas usadas no fluxo trial/suspended (já existem mas sem default seguro)
ALTER TABLE public.organizations
  ALTER COLUMN suspended SET DEFAULT FALSE;

-- 3. Ampliar subscriptions com colunas Stripe (provider já é genérico)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS price_id TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_subs_org ON public.subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_subs_provider_sub ON public.subscriptions(provider, provider_sub_id);
CREATE INDEX IF NOT EXISTS idx_subs_status ON public.subscriptions(status);

-- 4. Helper: org_id atual a partir do user logado (já pode existir, idempotente)
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE v UUID;
BEGIN
  -- Tenta agency_members (colaborador)
  SELECT org_id INTO v FROM public.agency_members
  WHERE user_id = auth.uid() AND status IN ('ativo','offline')
  LIMIT 1;
  IF v IS NOT NULL THEN RETURN v; END IF;
  -- Tenta organizations.owner_id
  SELECT id INTO v FROM public.organizations WHERE owner_id = auth.uid() LIMIT 1;
  RETURN v;
END $$;

-- 5. Eventos Stripe processados (idempotência de webhook)
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id TEXT PRIMARY KEY,                     -- evt_xxx do Stripe
  type TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON public.stripe_events(type, processed_at DESC);

-- 6. View: situação de billing por org (consulta fácil)
CREATE OR REPLACE VIEW public.org_billing_status AS
SELECT
  o.id AS org_id,
  o.name AS org_name,
  o.owner_id,
  o.stripe_customer_id,
  o.plan,
  o.suspended,
  o.suspended_reason,
  o.trial_ends_at,
  s.id AS subscription_id,
  s.provider,
  s.provider_sub_id,
  s.status AS sub_status,
  s.trial_end AS sub_trial_end,
  s.current_period_end,
  s.cancel_at_period_end,
  s.price_id,
  CASE
    WHEN o.suspended THEN 'suspended'
    WHEN s.status IS NULL AND o.trial_ends_at IS NOT NULL AND o.trial_ends_at > now() THEN 'trial'
    WHEN s.status = 'trialing' THEN 'trial'
    WHEN s.status = 'active' THEN 'active'
    WHEN s.status IN ('past_due','unpaid') THEN 'past_due'
    WHEN s.status = 'canceled' THEN 'canceled'
    WHEN o.trial_ends_at IS NOT NULL AND o.trial_ends_at < now() THEN 'trial_expired'
    ELSE 'unknown'
  END AS billing_state
FROM public.organizations o
LEFT JOIN LATERAL (
  SELECT * FROM public.subscriptions WHERE org_id = o.id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1
) s ON TRUE;

GRANT SELECT ON public.org_billing_status TO authenticated;
