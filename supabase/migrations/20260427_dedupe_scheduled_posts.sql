-- ============================================================
-- DEDUPE scheduled_posts + prevenir duplicação física
-- Criado: 2026-04-27
-- Contexto: bug do dia 25/04 onde a Balli teve 1 post publicado
--           4x em cada plataforma (8 publicações para 2). Causa
--           raiz: 5 caminhos de INSERT no frontend sem
--           idempotência + RLS recém-corrigida sem unique constraint.
-- ============================================================

-- ─── 1) CLEANUP: marcar duplicados existentes ─────────────────
-- Para cada (demand_id, platform), mantém apenas a linha mais antiga
-- com status ativo. As outras viram "duplicate" no error e
-- são deslocadas pra status "skipped_duplicate" se ainda não tiver
-- publicado, ou marcadas com flag se já publicaram (pra rastreio).

DO $$
DECLARE
  dup_count INT;
BEGIN
  -- Contar duplicados antes
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT demand_id, platform, COUNT(*) c
    FROM scheduled_posts
    WHERE demand_id IS NOT NULL
      AND status IN ('pending','publishing','processing','published')
    GROUP BY demand_id, platform
    HAVING COUNT(*) > 1
  ) sub;

  RAISE NOTICE 'Duplicate clusters encontrados: %', dup_count;

  -- Marcar duplicados publicados com flag (não pode desfazer no IG/FB)
  UPDATE scheduled_posts sp
  SET error = COALESCE(error,'') || ' [DUP_CLEANUP_2026-04-27]'
  WHERE sp.id IN (
    SELECT sp2.id
    FROM scheduled_posts sp2
    INNER JOIN (
      SELECT demand_id, platform, MIN(created_at) AS first_at
      FROM scheduled_posts
      WHERE demand_id IS NOT NULL
        AND status = 'published'
      GROUP BY demand_id, platform
      HAVING COUNT(*) > 1
    ) firsts ON firsts.demand_id = sp2.demand_id
            AND firsts.platform = sp2.platform
    WHERE sp2.status = 'published'
      AND sp2.created_at > firsts.first_at
  );

  -- Marcar pending/processing duplicados como skipped (não publicar)
  UPDATE scheduled_posts sp
  SET status = 'skipped_duplicate',
      error = 'Duplicado detectado no cleanup 2026-04-27',
      updated_at = NOW()
  WHERE sp.id IN (
    SELECT sp2.id
    FROM scheduled_posts sp2
    INNER JOIN (
      SELECT demand_id, platform, MIN(created_at) AS first_at
      FROM scheduled_posts
      WHERE demand_id IS NOT NULL
        AND status IN ('pending','publishing','processing')
      GROUP BY demand_id, platform
      HAVING COUNT(*) > 1
    ) firsts ON firsts.demand_id = sp2.demand_id
            AND firsts.platform = sp2.platform
    WHERE sp2.status IN ('pending','publishing','processing')
      AND sp2.created_at > firsts.first_at
  );
END $$;

-- ─── 2) PROTEÇÃO FÍSICA: UNIQUE INDEX parcial ─────────────────
-- Impede que duas linhas com mesmo (demand_id, platform) coexistam
-- com status "vivo" (pending/publishing/processing/published).
-- Linhas em failed/skipped_duplicate/cancelled não contam, então
-- retry e cleanup continuam funcionando.

DROP INDEX IF EXISTS scheduled_posts_demand_platform_active_uniq;
CREATE UNIQUE INDEX scheduled_posts_demand_platform_active_uniq
  ON scheduled_posts (demand_id, platform)
  WHERE demand_id IS NOT NULL
    AND status IN ('pending','publishing','processing','published');

-- ─── 3) ÍNDICE de performance pra idempotency check ───────────
-- O frontend agora vai checar "já existe row ativa pra esse demand+platform?"
-- antes de inserir. Esse índice acelera essa busca.
CREATE INDEX IF NOT EXISTS scheduled_posts_demand_status_idx
  ON scheduled_posts (demand_id, status)
  WHERE demand_id IS NOT NULL;

-- ─── 4) Comentários ───────────────────────────────────────────
COMMENT ON INDEX scheduled_posts_demand_platform_active_uniq IS
  'Impede duplicação física: ao mesmo demand+platform, só uma linha viva (pending/publishing/processing/published). Migration 2026-04-27.';
