-- Disable RLS on app_settings (app-wide config, not user-specific)
ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;
