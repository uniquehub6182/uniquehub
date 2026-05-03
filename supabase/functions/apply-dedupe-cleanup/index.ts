import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, null, 2), { headers: { ...H, "Content-Type": "application/json" }, status: s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const { data: all } = await sb.from("scheduled_posts")
      .select("id, demand_id, platform, status, created_at, error, published_at")
      .not("demand_id", "is", null)
      .in("status", ["pending","publishing","processing","published"]);

    // Agrupa por (demand_id, platform)
    const groups: Record<string, any[]> = {};
    (all || []).forEach((r: any) => {
      const k = `${r.demand_id}|${r.platform}`;
      if (!groups[k]) groups[k] = [];
      groups[k].push(r);
    });

    // Filtra duplicados, ordena por created_at, primeiro fica
    const dupClusters = Object.entries(groups).filter(([_, arr]) => arr.length > 1);

    const stats = {
      clusters_found: dupClusters.length,
      pending_processing_marked_skipped: 0,
      published_marked_with_flag: 0,
      details: [] as any[]
    };

    for (const [key, arr] of dupClusters) {
      arr.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const winner = arr[0];
      const losers = arr.slice(1);
      const [demand_id, platform] = key.split("|");

      const detail: any = { demand_id, platform, total: arr.length, winner_id: winner.id, actions: [] };

      for (const loser of losers) {
        if (["pending","publishing","processing"].includes(loser.status)) {
          // Marcar como skipped pra impedir re-publicacao
          const { error } = await sb.from("scheduled_posts")
            .update({
              status: "skipped_duplicate",
              error: "Duplicado detectado no cleanup 2026-04-27",
              updated_at: new Date().toISOString()
            })
            .eq("id", loser.id);
          if (!error) {
            stats.pending_processing_marked_skipped++;
            detail.actions.push({ id: loser.id, action: "skipped" });
          } else {
            detail.actions.push({ id: loser.id, action: "error", error: error.message });
          }
        } else if (loser.status === "published") {
          // Adicionar flag no error pra rastreio (nao da pra desfazer no IG/FB)
          const newError = ((loser.error || "") + " [DUP_CLEANUP_2026-04-27]").trim();
          const { error } = await sb.from("scheduled_posts")
            .update({ error: newError })
            .eq("id", loser.id);
          if (!error) {
            stats.published_marked_with_flag++;
            detail.actions.push({ id: loser.id, action: "flagged_published" });
          } else {
            detail.actions.push({ id: loser.id, action: "error", error: error.message });
          }
        }
      }

      stats.details.push(detail);
    }

    return json({ success: true, stats });
  } catch (e) {
    return json({ error: (e as Error).message, stack: (e as Error).stack }, 500);
  }
});
