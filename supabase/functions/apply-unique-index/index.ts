import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, null, 2), { headers: { ...H, "Content-Type": "application/json" }, status: s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, idle_timeout: 5 });
  const log: any[] = [];
  try {
    // 1) Estender constraint de status para aceitar 'skipped_duplicate'
    log.push("1. Atualizando constraint de status...");
    await sql.unsafe(`ALTER TABLE scheduled_posts DROP CONSTRAINT IF EXISTS scheduled_posts_status_check`);
    await sql.unsafe(`
      ALTER TABLE scheduled_posts ADD CONSTRAINT scheduled_posts_status_check
        CHECK (status IN ('pending','publishing','processing','published','failed','expired','skipped_duplicate','cancelled'))
    `);
    log.push("   OK constraint atualizada");

    // 2) Mover duplicates flagged (status=published, flag no error) pra skipped_duplicate
    log.push("2. Movendo duplicates flagged para skipped_duplicate...");
    const moved = await sql`
      UPDATE scheduled_posts
      SET status = 'skipped_duplicate', updated_at = NOW()
      WHERE status = 'published'
        AND error LIKE '%[DUP_CLEANUP_2026-04-27]%'
      RETURNING id
    `;
    log.push(`   OK ${moved.length} registros movidos`);

    // 3) Drop e recreate UNIQUE INDEX (agora deve funcionar)
    log.push("3. Criando UNIQUE INDEX parcial...");
    await sql.unsafe(`DROP INDEX IF EXISTS scheduled_posts_demand_platform_active_uniq`);
    await sql.unsafe(`
      CREATE UNIQUE INDEX scheduled_posts_demand_platform_active_uniq
        ON scheduled_posts (demand_id, platform)
        WHERE demand_id IS NOT NULL
          AND status IN ('pending','publishing','processing','published')
    `);
    log.push("   OK INDEX criado");

    // 4) Index de performance
    log.push("4. Criando INDEX de performance...");
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS scheduled_posts_demand_status_idx
        ON scheduled_posts (demand_id, status)
        WHERE demand_id IS NOT NULL
    `);
    log.push("   OK");

    // 5) Verificar
    const indexes = await sql`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'scheduled_posts'
        AND indexname IN ('scheduled_posts_demand_platform_active_uniq','scheduled_posts_demand_status_idx')
    `;

    const finalCounts = await sql`
      SELECT status, COUNT(*) as count FROM scheduled_posts GROUP BY status ORDER BY status
    `;

    return json({ success: true, log, indexes, status_counts: finalCounts });
  } catch (e) {
    log.push(`ERRO: ${(e as Error).message}`);
    return json({ error: (e as Error).message, log }, 500);
  } finally {
    await sql.end();
  }
});
