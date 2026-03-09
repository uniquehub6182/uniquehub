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

    const result: any = { fb: null, ig: null, igMedia: null, fbPrev: null, igPrev: null, fbPage: null, igProfile: null, fbDaily: null };

    /* Helper: fetch with error handling */
    const safeFetch = async (url: string) => {
      try {
        const r = await fetch(url);
        const d = await r.json();
        if (d.error) { console.warn("Graph API error:", d.error.message); return null; }
        return d;
      } catch (e) { console.warn("Fetch error:", e); return null; }
    };

    /* ── Facebook Page Insights (via Meta token) ── */
    if (metaToken?.page_id && metaToken?.page_token) {
      const at = metaToken.page_token;
      const pid = metaToken.page_id;

      /* Use v19.0 for broader metric compatibility */
      const apiVer = "v19.0";

      /* Metrics that work across all page sizes */
      const coreMetrics = "page_views_total,page_post_engagements,page_actions_post_reactions_total";
      /* Metrics that require pages_read_engagement and may need 100+ fans */
      const engagementMetrics = "page_impressions,page_impressions_organic_v2,page_impressions_paid,page_engaged_users,page_fan_adds";

      /* Try engagement metrics first, fallback to core only */
      let fbMetrics = `${engagementMetrics},${coreMetrics}`;
      let d1 = await safeFetch(`https://graph.facebook.com/${apiVer}/${pid}/insights?metric=${fbMetrics}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`);
      if (!d1?.data) {
        /* Fallback: try core metrics only */
        d1 = await safeFetch(`https://graph.facebook.com/${apiVer}/${pid}/insights?metric=${coreMetrics}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`);
      }
      if (d1?.data) result.fb = d1.data;

      /* Previous period */
      let d2 = await safeFetch(`https://graph.facebook.com/${apiVer}/${pid}/insights?metric=${fbMetrics}&period=day&since=${prevSinceStr}&until=${prevUntilStr}&access_token=${at}`);
      if (!d2?.data) {
        d2 = await safeFetch(`https://graph.facebook.com/${apiVer}/${pid}/insights?metric=${coreMetrics}&period=day&since=${prevSinceStr}&until=${prevUntilStr}&access_token=${at}`);
      }
      if (d2?.data) result.fbPrev = d2.data;

      /* Page info */
      const pageInfo = await safeFetch(`https://graph.facebook.com/${apiVer}/${pid}?fields=name,fan_count,followers_count&access_token=${at}`);
      if (pageInfo) result.fbPage = pageInfo;

      /* Daily breakdown for charts */
      const dailyMetrics = "page_impressions,page_engaged_users";
      const dailyData = await safeFetch(`https://graph.facebook.com/${apiVer}/${pid}/insights?metric=${dailyMetrics}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`);
      if (dailyData?.data) result.fbDaily = dailyData.data;

      /* Instagram via Facebook Page (business account) */
      const igCheck = await safeFetch(`https://graph.facebook.com/${apiVer}/${pid}?fields=instagram_business_account{id,username}&access_token=${at}`);
      const igBizId = igCheck?.instagram_business_account?.id;
      if (igBizId) {
        /* Auto-save ig_user_id if not stored */
        if (!metaToken.ig_user_id) {
          metaToken.ig_user_id = igBizId;
          metaToken.ig_username = igCheck.instagram_business_account.username || null;
          await sb.from("app_settings").upsert({ key: `meta_token_${client_id}`, value: JSON.stringify(metaToken), updated_at: new Date().toISOString() }, { onConflict: "key" });
        }
        const igUid = igBizId;
        const igAt = at;

        /* IG insights via FB business account */
        const igM = "impressions,reach,profile_views,accounts_engaged,follower_count";
        const igd1 = await safeFetch(`https://graph.facebook.com/${apiVer}/${igUid}/insights?metric=${igM}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${igAt}`);
        if (!igd1?.data) {
          /* Fallback: try fewer metrics */
          const igFallback = "impressions,reach,follower_count";
          const igf = await safeFetch(`https://graph.facebook.com/${apiVer}/${igUid}/insights?metric=${igFallback}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${igAt}`);
          if (igf?.data) result.ig = igf.data;
        } else { result.ig = igd1.data; }

        /* IG previous period */
        const igd2 = await safeFetch(`https://graph.facebook.com/${apiVer}/${igUid}/insights?metric=${igM}&period=day&since=${prevSinceStr}&until=${prevUntilStr}&access_token=${igAt}`);
        if (igd2?.data) result.igPrev = igd2.data;

        /* IG media (recent posts) */
        const igMedia = await safeFetch(`https://graph.facebook.com/${apiVer}/${igUid}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url,insights.metric(impressions,reach,engagement,saved)&limit=30&access_token=${igAt}`);
        if (igMedia?.data) result.igMedia = igMedia.data;

        /* IG profile */
        const igProf = await safeFetch(`https://graph.facebook.com/${apiVer}/${igUid}?fields=name,username,followers_count,follows_count,media_count,profile_picture_url&access_token=${igAt}`);
        if (igProf) result.igProfile = igProf;
      }
    }

    /* ── Instagram Platform API (direct IG login) ── */
    if (igToken?.ig_user_id && igToken?.access_token && !result.ig) {
      const at = igToken.access_token;
      const uid = igToken.ig_user_id;
      const igProf = await safeFetch(`https://graph.instagram.com/v21.0/${uid}?fields=name,username,followers_count,follows_count,media_count,profile_picture_url&access_token=${at}`);
      if (igProf) result.igProfile = igProf;
      const igMedia = await safeFetch(`https://graph.instagram.com/v21.0/${uid}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url&limit=30&access_token=${at}`);
      if (igMedia?.data) result.igMedia = igMedia.data;
    }

    return json(result);
  } catch (err) {
    console.error("social-insights error:", err);
    return json({ error: err.message }, 200);
  }
});
