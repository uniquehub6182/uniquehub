import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const H = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (d: unknown, s=200) => new Response(JSON.stringify(d), { headers:{...H,"Content-Type":"application/json"}, status:s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const { client_id } = await req.json();
    if (!client_id) throw new Error("Missing client_id");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    /* Read Facebook/Meta token */
    let metaToken: any = null;
    try {
      const { data: ms } = await sb.from("app_settings").select("value").eq("key", `meta_token_${client_id}`).single();
      if (ms?.value) metaToken = JSON.parse(ms.value);
    } catch {}

    /* Read Instagram Platform API token */
    let igToken: any = null;
    try {
      const { data: is } = await sb.from("app_settings").select("value").eq("key", `ig_token_${client_id}`).single();
      if (is?.value) igToken = JSON.parse(is.value);
    } catch {}

    if (!metaToken && !igToken) return json({ error: "Nenhum token social encontrado para este cliente" });

    const now = new Date();
    const since = new Date(now.getFullYear(), now.getMonth(), 1);
    const sinceStr = since.toISOString().split("T")[0];
    const untilStr = now.toISOString().split("T")[0];
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const prevSinceStr = prevStart.toISOString().split("T")[0];
    const prevUntilStr = prevEnd.toISOString().split("T")[0];

    const result: any = { fb: null, ig: null, igMedia: null, fbPrev: null, igPrev: null, fbPage: null, igProfile: null };

    /* ── Facebook Page Insights (via Meta token) ── */
    if (metaToken?.page_id && metaToken?.page_token) {
      const at = metaToken.page_token;
      const pid = metaToken.page_id;
      const fbM = "page_impressions,page_impressions_organic_v2,page_impressions_paid,page_engaged_users,page_post_engagements,page_fan_adds,page_views_total";
      try {
        const r1 = await fetch(`https://graph.facebook.com/v21.0/${pid}/insights?metric=${fbM}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`);
        const d1 = await r1.json(); if (d1.data) result.fb = d1.data;
        const r2 = await fetch(`https://graph.facebook.com/v21.0/${pid}/insights?metric=${fbM}&period=day&since=${prevSinceStr}&until=${prevUntilStr}&access_token=${at}`);
        const d2 = await r2.json(); if (d2.data) result.fbPrev = d2.data;
      } catch (e) { console.warn("FB insights:", e); }
      try {
        const r = await fetch(`https://graph.facebook.com/v21.0/${pid}?fields=name,fan_count,followers_count&access_token=${at}`);
        result.fbPage = await r.json();
      } catch {}

      /* Instagram via Facebook Page (business account) */
      if (metaToken.ig_user_id) {
        const igAt = at;
        const igUid = metaToken.ig_user_id;
        const igM = "impressions,reach,profile_views,accounts_engaged,follower_count";
        try {
          const r1 = await fetch(`https://graph.facebook.com/v21.0/${igUid}/insights?metric=${igM}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${igAt}`);
          const d1 = await r1.json(); if (d1.data) result.ig = d1.data;
          const r2 = await fetch(`https://graph.facebook.com/v21.0/${igUid}/insights?metric=${igM}&period=day&since=${prevSinceStr}&until=${prevUntilStr}&access_token=${igAt}`);
          const d2 = await r2.json(); if (d2.data) result.igPrev = d2.data;
        } catch (e) { console.warn("IG insights:", e); }
        try {
          const r = await fetch(`https://graph.facebook.com/v21.0/${igUid}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url,insights.metric(impressions,reach,engagement,saved)&limit=30&access_token=${igAt}`);
          const d = await r.json(); if (d.data) result.igMedia = d.data;
        } catch (e) { console.warn("IG media:", e); }
        try {
          const r = await fetch(`https://graph.facebook.com/v21.0/${igUid}?fields=name,username,followers_count,follows_count,media_count,profile_picture_url&access_token=${igAt}`);
          result.igProfile = await r.json();
        } catch {}
      }
    }

    /* ── Instagram Platform API (direct IG login) ── */
    if (igToken?.ig_user_id && igToken?.access_token && !result.ig) {
      const at = igToken.access_token;
      const uid = igToken.ig_user_id;
      try {
        const r = await fetch(`https://graph.instagram.com/v21.0/${uid}?fields=name,username,followers_count,follows_count,media_count,profile_picture_url&access_token=${at}`);
        result.igProfile = await r.json();
      } catch {}
      try {
        const r = await fetch(`https://graph.instagram.com/v21.0/${uid}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url&limit=30&access_token=${at}`);
        const d = await r.json(); if (d.data) result.igMedia = d.data;
      } catch {}
    }

    return json(result);
  } catch (err) {
    console.error("social-insights error:", err);
    return json({ error: err.message }, 200);
  }
});
