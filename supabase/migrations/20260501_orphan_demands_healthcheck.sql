-- =====================================================================
-- Health check: detecta demands órfãs (stage=scheduled sem scheduled_post)
-- Roda 1x por hora via pg_cron. Notifica admin (anti-spam: 4h).
-- Loga todo run em app_settings com prefixo audit_orphan_check_*
-- =====================================================================

CREATE OR REPLACE FUNCTION public.check_orphan_demands()
RETURNS TABLE(
  orphan_count INTEGER,
  notified BOOLEAN,
  details JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_orphans JSONB;
  v_count INTEGER;
  v_admin_id UUID;
  v_org_id UUID;
  v_org_count INTEGER;
  v_already_notified BOOLEAN;
  v_notif_title TEXT;
  v_notif_body TEXT;
  v_audit_key TEXT;
BEGIN
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(jsonb_agg(jsonb_build_object(
      'demand_id', d.id::text,
      'title', d.title,
      'client_id', d.client_id::text,
      'client_name', c.name,
      'stage', d.stage,
      'schedule_date', d.scheduling->>'date',
      'schedule_time', d.scheduling->>'time',
      'created_at', d.created_at,
      'org_id', d.org_id::text
    )), '[]'::jsonb)
  INTO v_count, v_orphans
  FROM public.demands d
  LEFT JOIN public.clients c ON c.id = d.client_id
  WHERE d.stage = 'scheduled'
    AND NOT EXISTS (
      SELECT 1 FROM public.scheduled_posts sp
      WHERE sp.demand_id = d.id::text
        AND sp.status IN ('pending','publishing','processing','published')
    )
    AND d.created_at > now() - interval '30 days'
    AND d.title NOT LIKE '[TEST ORPHAN]%';

  v_audit_key := 'audit_orphan_check_' || extract(epoch from now())::text;
  INSERT INTO public.app_settings (key, value, org_id)
  VALUES (v_audit_key, jsonb_build_object('timestamp', now(), 'orphan_count', v_count, 'orphans', v_orphans), NULL)
  ON CONFLICT (key) DO NOTHING;

  IF v_count = 0 THEN
    RETURN QUERY SELECT 0::INTEGER, FALSE, '[]'::jsonb;
    RETURN;
  END IF;

  FOR v_org_id IN
    SELECT DISTINCT (orphan->>'org_id')::uuid
    FROM jsonb_array_elements(v_orphans) AS orphan
    WHERE orphan->>'org_id' IS NOT NULL
  LOOP
    SELECT u.id INTO v_admin_id
    FROM auth.users u
    WHERE u.raw_user_meta_data->>'role' = 'admin'
      AND (u.raw_user_meta_data->>'org_id')::uuid IS NOT DISTINCT FROM v_org_id
    LIMIT 1;
    IF v_admin_id IS NULL THEN
      SELECT u.id INTO v_admin_id FROM auth.users u
      WHERE u.raw_user_meta_data->>'role' = 'admin' LIMIT 1;
    END IF;
    IF v_admin_id IS NULL THEN CONTINUE; END IF;

    SELECT EXISTS (SELECT 1 FROM public.notifications WHERE user_id = v_admin_id AND type = 'orphan_demands_alert' AND created_at > now() - interval '4 hours')
    INTO v_already_notified;
    IF v_already_notified THEN CONTINUE; END IF;

    SELECT COUNT(*) INTO v_org_count FROM jsonb_array_elements(v_orphans) AS orphan WHERE (orphan->>'org_id')::uuid = v_org_id;

    v_notif_title := '⚠️ ' || v_org_count || ' demand' || CASE WHEN v_org_count > 1 THEN 's' ELSE '' END || ' órfã' || CASE WHEN v_org_count > 1 THEN 's' ELSE '' END || ' detectada' || CASE WHEN v_org_count > 1 THEN 's' ELSE '' END;
    v_notif_body := 'Stage=scheduled mas sem scheduled_post ativo. Verifique no Kanban — pode ser bug ou erro de mídia.';

    INSERT INTO public.notifications (user_id, title, body, type, read, org_id, created_at)
    VALUES (v_admin_id, v_notif_title, v_notif_body, 'orphan_demands_alert', FALSE, v_org_id, now());
  END LOOP;

  RETURN QUERY SELECT v_count::INTEGER, TRUE, v_orphans;
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN PERFORM cron.unschedule('orphan-demands-healthcheck'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('orphan-demands-healthcheck', '0 * * * *', $cron$ SELECT public.check_orphan_demands(); $cron$);

COMMENT ON FUNCTION public.check_orphan_demands() IS 'Detecta demands stage=scheduled sem scheduled_post ativo. Notifica admin (anti-spam: 4h). Loga em app_settings.';
