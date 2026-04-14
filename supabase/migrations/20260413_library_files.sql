-- ============================================================
-- UniqueHub Library Files - Google Drive Style
-- ============================================================

-- Create library_files table
CREATE TABLE IF NOT EXISTS public.library_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  parent_id UUID REFERENCES public.library_files(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_folder BOOLEAN DEFAULT false,
  size_bytes BIGINT DEFAULT 0,
  url TEXT,
  storage_path TEXT,
  mime_type TEXT,
  category TEXT DEFAULT 'Outros',
  client_id TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_library_files_org ON public.library_files(org_id);
CREATE INDEX IF NOT EXISTS idx_library_files_parent ON public.library_files(parent_id);
CREATE INDEX IF NOT EXISTS idx_library_files_org_parent ON public.library_files(org_id, parent_id);

-- Enable RLS
ALTER TABLE public.library_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies using get_my_org_id()
CREATE POLICY library_files_select ON public.library_files
  FOR SELECT USING (org_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY library_files_insert ON public.library_files
  FOR INSERT WITH CHECK (org_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY library_files_update ON public.library_files
  FOR UPDATE USING (org_id = public.get_my_org_id() OR public.is_super_admin());

CREATE POLICY library_files_delete ON public.library_files
  FOR DELETE USING (org_id = public.get_my_org_id() OR public.is_super_admin());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.library_files;
