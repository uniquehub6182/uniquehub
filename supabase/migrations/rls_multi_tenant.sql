-- ============================================================
-- UniqueHub RLS Migration - Isolamento Multi-Tenant
-- Executar no SQL Editor do Supabase (Dashboard)
-- ============================================================

-- 1. Função helper: retorna o org_id do usuário autenticado
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- 2. Função helper: verifica se o usuário é super admin (Unique Marketing)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE user_id = auth.uid()
      AND org_id = 'a0000000-0000-0000-0000-000000000001'
      AND role IN ('owner', 'admin')
  );
$$;

-- ============================================================
-- 3. ENABLE RLS + POLICIES para cada tabela com org_id
-- ============================================================

-- ---- CLIENTS ----
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_select" ON public.clients FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "clients_insert" ON public.clients FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "clients_update" ON public.clients FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "clients_delete" ON public.clients FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- DEMANDS ----
ALTER TABLE public.demands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demands_select" ON public.demands FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "demands_insert" ON public.demands FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "demands_update" ON public.demands FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "demands_delete" ON public.demands FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- EVENTS ----
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_select" ON public.events FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "events_insert" ON public.events FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "events_update" ON public.events FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "events_delete" ON public.events FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- IDEAS ----
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ideas_select" ON public.ideas FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "ideas_insert" ON public.ideas FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "ideas_update" ON public.ideas FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "ideas_delete" ON public.ideas FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- NEWS ----
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_select" ON public.news FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "news_insert" ON public.news FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "news_update" ON public.news FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "news_delete" ON public.news FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- NOTIFICATIONS ----
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "notifications_delete" ON public.notifications FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- CHECKINS ----
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checkins_select" ON public.checkins FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "checkins_insert" ON public.checkins FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "checkins_update" ON public.checkins FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "checkins_delete" ON public.checkins FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- CLIENT_SCORES ----
ALTER TABLE public.client_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_scores_select" ON public.client_scores FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "client_scores_insert" ON public.client_scores FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "client_scores_update" ON public.client_scores FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "client_scores_delete" ON public.client_scores FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- CONVERSATIONS ----
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversations_select" ON public.conversations FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "conversations_update" ON public.conversations FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "conversations_delete" ON public.conversations FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- MESSAGES ----
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "messages_select" ON public.messages FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "messages_insert" ON public.messages FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "messages_update" ON public.messages FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "messages_delete" ON public.messages FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- SOCIAL_TOKENS ----
ALTER TABLE public.social_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "social_tokens_select" ON public.social_tokens FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "social_tokens_insert" ON public.social_tokens FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "social_tokens_update" ON public.social_tokens FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "social_tokens_delete" ON public.social_tokens FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- XP_EVENTS ----
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "xp_events_select" ON public.xp_events FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "xp_events_insert" ON public.xp_events FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "xp_events_update" ON public.xp_events FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "xp_events_delete" ON public.xp_events FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- MATCH4BIZ_MATCHES ----
ALTER TABLE public.match4biz_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match4biz_matches_select" ON public.match4biz_matches FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "match4biz_matches_insert" ON public.match4biz_matches FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "match4biz_matches_update" ON public.match4biz_matches FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "match4biz_matches_delete" ON public.match4biz_matches FOR DELETE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- PROFILES ----
-- Profiles é especial: usuário pode ver seu próprio perfil + perfis da mesma org
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (org_id = get_my_org_id() OR id = auth.uid() OR is_super_admin());
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid() OR is_super_admin());
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (org_id = get_my_org_id() OR id = auth.uid() OR is_super_admin());

-- ---- ORG_MEMBERS ----
-- Membros podem ver membros da mesma org
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_select" ON public.org_members FOR SELECT
  USING (org_id = get_my_org_id() OR user_id = auth.uid() OR is_super_admin());
CREATE POLICY "org_members_insert" ON public.org_members FOR INSERT
  WITH CHECK (user_id = auth.uid() OR is_super_admin());  -- signup: user cria seu próprio membership
CREATE POLICY "org_members_update" ON public.org_members FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "org_members_delete" ON public.org_members FOR DELETE
  USING (is_super_admin());

-- ---- APP_SETTINGS ----
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_select" ON public.app_settings FOR SELECT
  USING (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "app_settings_insert" ON public.app_settings FOR INSERT
  WITH CHECK (org_id = get_my_org_id() OR is_super_admin());
CREATE POLICY "app_settings_update" ON public.app_settings FOR UPDATE
  USING (org_id = get_my_org_id() OR is_super_admin());

-- ---- ORGANIZATIONS ----
-- Tabela de orgs: cada usuário vê só sua org, super admin vê todas
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizations_select" ON public.organizations FOR SELECT
  USING (id = get_my_org_id() OR is_super_admin());
CREATE POLICY "organizations_update" ON public.organizations FOR UPDATE
  USING (is_super_admin());
CREATE POLICY "organizations_insert" ON public.organizations FOR INSERT
  WITH CHECK (true);  -- signup precisa criar org antes de ter org_member
CREATE POLICY "organizations_delete" ON public.organizations FOR DELETE
  USING (is_super_admin());

-- ============================================================
-- 4. GRANT para funções helpers
-- ============================================================
GRANT EXECUTE ON FUNCTION public.get_my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- ============================================================
-- 5. Tabelas SEM org_id que precisam receber a coluna
--    (executar ANTES de habilitar RLS nelas)
-- ============================================================
-- ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
-- ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
-- ALTER TABLE public.presentations ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
-- ALTER TABLE public.scheduled_posts ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
-- Depois de adicionar, popular com org_id correto e criar policies iguais às acima.
