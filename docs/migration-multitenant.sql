-- ═══════════════════════════════════════════════════════════════
-- UniqueHub Multi-Tenant Migration — Fase 1
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id),
  
  -- Plan
  plan TEXT DEFAULT 'free',
  max_clients INT DEFAULT 1,
  max_users INT DEFAULT 1,
  
  -- White-label
  logo_url TEXT,
  brand_color TEXT DEFAULT '#BBF246',
  custom_domain TEXT,
  app_name TEXT,
  favicon_url TEXT,
  
  -- Features
  features JSONB DEFAULT '{
    "crm": false,
    "whatsapp": false,
    "scheduling": true,
    "ai_assistant": true,
    "gamification": true,
    "reports": true
  }'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ORG MEMBERS TABLE
CREATE TABLE IF NOT EXISTS org_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(org_id, user_id)
);

-- 3. SUBSCRIPTIONS TABLE
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT,
  provider_sub_id TEXT,
  plan TEXT,
  status TEXT DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- 4. ADD org_id TO ALL EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════

-- Core tables
ALTER TABLE clients ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE demands ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE events ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE news ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE social_tokens ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE client_scores ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE match4biz_matches ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE xp_events ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE credits ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- ═══════════════════════════════════════════════════════════════
-- 5. CREATE UNIQUE MARKETING ORG & MIGRATE EXISTING DATA
-- ═══════════════════════════════════════════════════════════════

-- Create the Unique Marketing organization
INSERT INTO organizations (id, name, slug, plan, max_clients, max_users, brand_color, app_name, features)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Unique Marketing',
  'unique-marketing',
  'enterprise',
  999,
  999,
  '#BBF246',
  'UniqueHub',
  '{"crm":true,"whatsapp":true,"scheduling":true,"ai_assistant":true,"gamification":true,"reports":true,"match4biz":true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Assign ALL existing data to Unique Marketing
UPDATE clients SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE demands SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE profiles SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE notifications SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE events SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE news SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE ideas SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE app_settings SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE social_tokens SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE client_scores SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE match4biz_matches SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE checkins SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE messages SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE conversations SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE conversation_members SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE xp_events SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE transactions SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE credits SET org_id = 'a0000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- Add existing users as org members
INSERT INTO org_members (org_id, user_id, role, accepted_at)
SELECT 'a0000000-0000-0000-0000-000000000001', p.id, 
  CASE WHEN p.role = 'admin' THEN 'owner' ELSE 'member' END,
  now()
FROM profiles p
WHERE p.org_id = 'a0000000-0000-0000-0000-000000000001'
ON CONFLICT (org_id, user_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 6. INDEXES FOR PERFORMANCE
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_clients_org ON clients(org_id);
CREATE INDEX IF NOT EXISTS idx_demands_org ON demands(org_id);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(org_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);
CREATE INDEX IF NOT EXISTS idx_news_org ON news(org_id);
CREATE INDEX IF NOT EXISTS idx_ideas_org ON ideas(org_id);
CREATE INDEX IF NOT EXISTS idx_social_tokens_org ON social_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_client_scores_org ON client_scores(org_id);
CREATE INDEX IF NOT EXISTS idx_messages_org ON messages(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

-- ═══════════════════════════════════════════════════════════════
-- 7. HELPER FUNCTION: Get user's org_id
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM org_members 
  WHERE user_id = auth.uid() 
  LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 8. VERIFICATION (run after migration to check)
-- ═══════════════════════════════════════════════════════════════

-- Check org was created
-- SELECT * FROM organizations;

-- Check all tables have org_id populated
-- SELECT 'clients' as tbl, count(*) as total, count(org_id) as with_org FROM clients
-- UNION ALL SELECT 'demands', count(*), count(org_id) FROM demands
-- UNION ALL SELECT 'events', count(*), count(org_id) FROM events
-- UNION ALL SELECT 'news', count(*), count(org_id) FROM news
-- UNION ALL SELECT 'notifications', count(*), count(org_id) FROM notifications;

-- Check org members
-- SELECT om.role, p.email, p.name FROM org_members om JOIN profiles p ON p.id = om.user_id;

-- ═══════════════════════════════════════════════════════════════
-- NOTE: RLS policies will be added in Phase 2 once the app
-- code is updated to pass org_id in queries. Adding RLS now
-- would break the existing app.
-- ═══════════════════════════════════════════════════════════════
