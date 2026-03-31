import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { headers: { ...H, "Content-Type": "application/json" }, status: s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const results: { client: string; status: string; action: string; username?: string }[] = [];
  let fixed = 0, failed = 0, ok = 0;

  try {
    /* Get all social tokens */
    const { data: tokens } = await sb.from("social_tokens").select("client_id, access_token, page_id, ig_user_id").eq("platform", "meta");
    if (!tokens?.length) return json({ message: "No social tokens found", results: [] });

    /* Get client names */
    const clientIds = tokens.map((t: any) => t.client_id);
    const { data: clients } = await sb.from("clients").select("id, name").in("id", clientIds);
    const nameMap: Record<string, string> = {};
    (clients || []).forEach((c: any) => { nameMap[c.id] = c.name; });

    for (const tok of tokens) {
      const name = nameMap[tok.client_id] || tok.client_id;
      try {
        /* 1. Check ig_token in app_settings */
        const { data: igTok } = await sb.from("app_settings").select("value").eq("key", `ig_token_${tok.client_id}`).single();
        let tokenWorks = false;

        if (igTok?.value) {
          const tk = JSON.parse(igTok.value);
          if (tk.ig_user_id && tk.access_token) {
            const r = await fetch(`https://graph.facebook.com/v21.0/${tk.ig_user_id}?fields=username&access_token=${tk.access_token}`);
            const d = await r.json();
            if (!d.error) { tokenWorks = true; ok++; results.push({ client: name, status: "ok", action: "none", username: d.username }); continue; }
          }
        }

        /* 2. Token invalid/missing — try to fix from social_tokens */
        if (!tokenWorks && tok.page_id && tok.access_token) {
          const pRes = await fetch(`https://graph.facebook.com/v21.0/${tok.page_id}?fields=access_token,instagram_business_account&access_token=${tok.access_token}`);
          const pData = await pRes.json();
          if (pData.access_token && pData.instagram_business_account?.id) {
            const newUid = pData.instagram_business_account.id;
            const newAt = pData.access_token;
            /* Verify the derived token works */
            const vRes = await fetch(`https://graph.facebook.com/v21.0/${newUid}?fields=username&access_token=${newAt}`);
            const vData = await vRes.json();
            if (!vData.error) {
              /* Auto-fix: update ig_token cache */
              await sb.from("app_settings").upsert(
                { key: `ig_token_${tok.client_id}`, value: JSON.stringify({ ig_user_id: newUid, access_token: newAt, page_id: tok.page_id }) },
                { onConflict: "key" }
              );
              fixed++; results.push({ client: name, status: "fixed", action: "auto_renewed", username: vData.username });
              continue;
            }
          }
          /* social_tokens page token also failed */
          failed++; results.push({ client: name, status: "failed", action: "needs_reconnect" });
        } else {
          failed++; results.push({ client: name, status: "failed", action: "no_page_token" });
        }
      } catch (e) {
        failed++; results.push({ client: name, status: "error", action: (e as Error).message });
      }
    }

    /* Check upcoming scheduled posts for clients with broken tokens */
    const failedClientIds = results.filter(r => r.status === "failed").map(r => {
      const entry = (clients || []).find((c: any) => c.name === r.client);
      return entry?.id;
    }).filter(Boolean);

    let atRiskPosts: any[] = [];
    if (failedClientIds.length > 0) {
      const { data: scheduled } = await sb.from("demands").select("id, title, client_id, schedule_date, scheduling")
        .eq("stage", "scheduled").in("client_id", failedClientIds);
      atRiskPosts = (scheduled || []).map((d: any) => {
        const sched = typeof d.scheduling === "object" ? d.scheduling : {};
        return { title: d.title, client: nameMap[d.client_id], date: sched.date || d.schedule_date };
      });
    }

    /* Create notification for admin if there are problems */
    if (failed > 0 || fixed > 0) {
      const failedNames = results.filter(r => r.status === "failed").map(r => r.client).join(", ");
      const fixedNames = results.filter(r => r.status === "fixed").map(r => r.client).join(", ");
      let body = "";
      if (failed > 0) body += `❌ ${failed} token(s) com problema: ${failedNames}. Reconecte nas configurações.`;
      if (fixed > 0) body += `${body ? " | " : ""}🔄 ${fixed} token(s) renovado(s) automaticamente: ${fixedNames}.`;
      if (atRiskPosts.length > 0) body += ` ⚠️ ${atRiskPosts.length} post(s) agendado(s) em risco!`;

      /* Get all admin/team users to notify */
      const { data: teamUsers } = await sb.from("profiles").select("id, role").in("role", ["admin", "owner", "manager"]);
      for (const u of (teamUsers || [])) {
        await sb.from("notifications").insert({
          user_id: u.id,
          type: "token_health",
          title: failed > 0 ? "⚠️ Tokens de rede social com problema" : "🔄 Tokens renovados automaticamente",
          body,
          read: false,
        });
      }
    }

    const summary = { total: tokens.length, ok, fixed, failed, atRiskPosts: atRiskPosts.length };
    console.log("[TokenHealthCheck]", JSON.stringify(summary));
    return json({ summary, results, atRiskPosts });
  } catch (e) {
    console.error("[TokenHealthCheck] Error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
