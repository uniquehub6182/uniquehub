-- Real gamification scores table
CREATE TABLE IF NOT EXISTS public.client_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  action text NOT NULL,
  points numeric(5,1) NOT NULL DEFAULT 0,
  pillar text CHECK (pillar IN ('execucao','estrategia','educacao','ecossistema','crescimento')),
  description text,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_client_scores_client ON public.client_scores(client_id);
CREATE INDEX IF NOT EXISTS idx_client_scores_created ON public.client_scores(created_at);

-- Enable RLS
ALTER TABLE public.client_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_scores_anon" ON public.client_scores FOR ALL USING (true) WITH CHECK (true);
