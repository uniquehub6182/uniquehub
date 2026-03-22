import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const H = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (d: unknown, s=200) => new Response(JSON.stringify(d), { headers:{...H,"Content-Type":"application/json"}, status:s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const { client_id, since, until } = await req.json();
    if (!client_id) throw new Error("Missing client_id");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let metaToken: any = null;
    try { const { data } = await sb.from("app_settings").select("value").eq("key", `meta_token_${client_id}`).single(); if (data?.value) metaToken = JSON.parse(data.value); } catch {}
    let igToken: any = null;
    try { const { data } = await sb.from("app_settings").select("value").eq("key", `ig_token_${client_id}`).single(); if (data?.value) igToken = JSON.parse(data.value); } catch {}
    if (!metaToken && !igToken) return json({ error: "Nenhum token social encontrado" });
    const safeFetch = async (url: string) => { try { const r = await fetch(url); const d = await r.json(); if (d.error) { console.log("API err:", url.split("?")[0], d.error.message?.substring(0,80)); return null; } return d; } catch { return null; } };
    const V = "v21.0";
    const result: any = { fbPage: null, fbPosts: null, fb: null, fbPrev: null, igProfile: null, igMedia: null, ig: null, igPrev: null, igTotals: null, needsPermission: [] };
    const now = new Date();
    const sinceStr = since || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
    const untilStr = until || now.toISOString().split("T")[0];
    const sinceDate = new Date(sinceStr); const untilDate = new Date(untilStr);
    const daysDiff = Math.max(1, Math.ceil((untilDate.getTime() - sinceDate.getTime()) / (1000*60*60*24)));
    const prevEnd = new Date(sinceDate); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStartD = new Date(prevEnd); prevStartD.setDate(prevStartD.getDate() - daysDiff);
    const prevStart = prevStartD.toISOString().split("T")[0];
    const prevEndStr = prevEnd.toISOString().split("T")[0];

    /* ═══ FACEBOOK ═══ */
    if (metaToken?.page_id && metaToken?.page_token) {
      const at = metaToken.page_token, pid = metaToken.page_id;
      const fbMetrics = "page_views_total,page_post_engagements,page_posts_impressions,page_video_views,page_actions_post_reactions_total,page_daily_follows,page_daily_unfollows";
      const [page, posts, d1, d2, igCheck] = await Promise.all([
        safeFetch(`https://graph.facebook.com/${V}/${pid}?fields=name,fan_count,followers_count,talking_about_count,picture{url},link,category&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}/published_posts?fields=id,message,created_time,full_picture,permalink_url,shares,reactions.summary(true),comments.summary(true)&limit=25&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}/insights?metric=${fbMetrics}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}/insights?metric=${fbMetrics}&period=day&since=${prevStart}&until=${prevEndStr}&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}?fields=instagram_business_account{id,username,followers_count,follows_count,media_count,profile_picture_url,biography}&access_token=${at}`),
      ]);
      if (page) result.fbPage = page;
      if (posts?.data) result.fbPosts = posts.data.map((p: any) => ({ ...p, likes_count: p.reactions?.summary?.total_count || 0, comments_count: p.comments?.summary?.total_count || 0, shares_count: p.shares?.count || 0 }));
      if (d1?.data) result.fb = d1.data; else if (page) result.needsPermission.push("read_insights");
      if (d2?.data) result.fbPrev = d2.data;

      /* ═══ INSTAGRAM via Facebook Business Account ═══ */
      const igBiz = igCheck?.instagram_business_account;
      if (igBiz?.id) {
        if (!metaToken.ig_user_id) {
          metaToken.ig_user_id = igBiz.id; metaToken.ig_username = igBiz.username;
          await sb.from("app_settings").upsert({ key: `meta_token_${client_id}`, value: JSON.stringify(metaToken), updated_at: new Date().toISOString() }, { onConflict: "key" });
        }
        result.igProfile = igBiz;
        /* v21: daily metrics (reach, follower_count) */
        const [igMedia, igDaily, igDailyPrev, igTotals, igTotalsPrev] = await Promise.all([
          safeFetch(`https://graph.facebook.com/${V}/${igBiz.id}/media?fields=id,caption,media_type,media_product_type,timestamp,like_count,comments_count,thumbnail_url,media_url,permalink&limit=25&access_token=${at}`),
          safeFetch(`https://graph.facebook.com/${V}/${igBiz.id}/insights?metric=reach,follower_count&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`),
          safeFetch(`https://graph.facebook.com/${V}/${igBiz.id}/insights?metric=reach,follower_count&period=day&since=${prevStart}&until=${prevEndStr}&access_token=${at}`),
          safeFetch(`https://graph.facebook.com/${V}/${igBiz.id}/insights?metric=profile_views,accounts_engaged,total_interactions,likes,comments,shares,saves&metric_type=total_value&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`),
          safeFetch(`https://graph.facebook.com/${V}/${igBiz.id}/insights?metric=profile_views,accounts_engaged,total_interactions,likes,comments,shares,saves&metric_type=total_value&period=day&since=${prevStart}&until=${prevEndStr}&access_token=${at}`),
        ]);
        if (igDaily?.data) result.ig = igDaily.data;
        if (igDailyPrev?.data) result.igPrev = igDailyPrev.data;
        /* Extract total_value metrics into a clean object */
        if (igTotals?.data) {
          const t: any = {};
          igTotals.data.forEach((m: any) => { t[m.name] = m.total_value?.value || 0; });
          result.igTotals = t;
        }
        if (igTotalsPrev?.data) {
          const tp: any = {};
          igTotalsPrev.data.forEach((m: any) => { tp[m.name] = m.total_value?.value || 0; });
          result.igTotalsPrev = tp;
        }
        /* IG media with per-post insights */
        if (igMedia?.data) {
          const mediaWithInsights = await Promise.all(igMedia.data.slice(0, 15).map(async (m: any) => {
            const metrics = "reach,saved,shares,total_interactions";
            const ins = await safeFetch(`https://graph.facebook.com/${V}/${m.id}/insights?metric=${metrics}&access_token=${at}`);
            const insMap: any = {};
            if (ins?.data) ins.data.forEach((i: any) => { insMap[i.name] = i.values?.[0]?.value || 0; });
            return { ...m, insights: insMap };
          }));
          result.igMedia = mediaWithInsights;
        }
      }
    }

    /* ═══ INSTAGRAM Platform API (direct login fallback) ═══ */
    if (igToken?.ig_user_id && igToken?.access_token && !result.igProfile) {
      const at2 = igToken.access_token, uid2 = igToken.ig_user_id;
      const [prof, media] = await Promise.all([
        safeFetch(`https://graph.instagram.com/${V}/${uid2}?fields=name,username,followers_count,follows_count,media_count,profile_picture_url,biography&access_token=${at2}`),
        safeFetch(`https://graph.instagram.com/${V}/${uid2}/media?fields=id,caption,media_type,media_product_type,timestamp,like_count,comments_count,thumbnail_url,media_url,permalink&limit=25&access_token=${at2}`),
      ]);
      if (prof) result.igProfile = prof;
      if (media?.data) result.igMedia = media.data;
    }

    return json(result);
  } catch (err) { console.error("social-insights:", err); return json({ error: err.message }, 200); }
});
