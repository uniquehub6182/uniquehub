BEGIN;
-- Reset apenas dark, theme e prefs pro default UniqueHub. Preserva dash + nav.
UPDATE public.app_settings
SET value = jsonb_build_object(
  'dark', false,
  'theme', 'default',
  'prefs', jsonb_build_object(
    'fontSize', 'normal',
    'fontFamily', 'system',
    'boldTitles', true,
    'cardRadius', 'round',
    'cardStyle', 'elevated',
    'density', 'normal',
    'bgTemplate', 'solid',
    'navSize', 'md',
    'navStyle', 'pill',
    'navPosition', 'float',
    'navWidth', 320,
    'navBlur', true,
    'navLabels', true,
    'iconWeight', 'normal',
    'iconSize', 22,
    'iconFill', 'outlined'
  ),
  'dash', COALESCE((value::jsonb)->'dash', 'null'::jsonb),
  'nav', COALESCE((value::jsonb)->'nav', 'null'::jsonb)
)::text
WHERE key LIKE 'visual_prefs_%';

-- Verificar quantos foram resetados
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM public.app_settings WHERE key LIKE 'visual_prefs_%';
  RAISE NOTICE 'Total de visual_prefs resetadas: %', n;
END $$;

COMMIT;
