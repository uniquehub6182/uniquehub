-- ═══ MATCH4BIZ PROFILES ═══
CREATE TABLE IF NOT EXISTS match4biz_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  logo_url TEXT,
  tagline TEXT,
  description TEXT,
  segment TEXT,
  city TEXT,
  offers JSONB DEFAULT '[]',
  seeks JSONB DEFAULT '[]',
  photos JSONB DEFAULT '[]',
  website TEXT,
  instagram TEXT,
  linkedin TEXT,
  visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ MATCH4BIZ SWIPES ═══
CREATE TABLE IF NOT EXISTS match4biz_swipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_client_id UUID NOT NULL,
  to_client_id UUID NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('right','left','super')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(from_client_id, to_client_id)
);

-- ═══ MATCH4BIZ MATCHES ═══
CREATE TABLE IF NOT EXISTS match4biz_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_a_id UUID NOT NULL,
  client_b_id UUID NOT NULL,
  client_a_name TEXT,
  client_b_name TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','archived','deal_closed')),
  is_super BOOLEAN DEFAULT false,
  matched_at TIMESTAMPTZ DEFAULT now(),
  deal_closed_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(client_a_id, client_b_id)
);

-- ═══ MATCH4BIZ MESSAGES ═══
CREATE TABLE IF NOT EXISTS match4biz_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES match4biz_matches(id) ON DELETE CASCADE,
  sender_client_id UUID NOT NULL,
  sender_name TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ MATCH4BIZ CREDITS ═══
CREATE TABLE IF NOT EXISTS match4biz_credits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('initial','purchase','reward','spend','admin')),
  description TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ Enable RLS ═══
ALTER TABLE match4biz_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE match4biz_swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE match4biz_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match4biz_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE match4biz_credits ENABLE ROW LEVEL SECURITY;

-- ═══ Open policies (app handles auth) ═══
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'm4b_profiles_all') THEN
    CREATE POLICY m4b_profiles_all ON match4biz_profiles FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'm4b_swipes_all') THEN
    CREATE POLICY m4b_swipes_all ON match4biz_swipes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'm4b_matches_all') THEN
    CREATE POLICY m4b_matches_all ON match4biz_matches FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'm4b_messages_all') THEN
    CREATE POLICY m4b_messages_all ON match4biz_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'm4b_credits_all') THEN
    CREATE POLICY m4b_credits_all ON match4biz_credits FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══ Indexes ═══
CREATE INDEX IF NOT EXISTS idx_m4b_swipes_from ON match4biz_swipes(from_client_id);
CREATE INDEX IF NOT EXISTS idx_m4b_swipes_to ON match4biz_swipes(to_client_id);
CREATE INDEX IF NOT EXISTS idx_m4b_matches_a ON match4biz_matches(client_a_id);
CREATE INDEX IF NOT EXISTS idx_m4b_matches_b ON match4biz_matches(client_b_id);
CREATE INDEX IF NOT EXISTS idx_m4b_messages_match ON match4biz_messages(match_id);
CREATE INDEX IF NOT EXISTS idx_m4b_credits_client ON match4biz_credits(client_id);
CREATE INDEX IF NOT EXISTS idx_m4b_profiles_client ON match4biz_profiles(client_id);
