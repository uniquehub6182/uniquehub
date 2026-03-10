-- Add created_by_name to events so we know who created each event
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS created_by_name text;
-- Update existing events
UPDATE public.events SET created_by_name = 'Matheus' WHERE created_by_name IS NULL;
