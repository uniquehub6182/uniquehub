-- Disable RLS on agency_members (same fix as app_settings)
ALTER TABLE public.agency_members DISABLE ROW LEVEL SECURITY;
-- Also fix other tables that might have same issue
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions DISABLE ROW LEVEL SECURITY;
