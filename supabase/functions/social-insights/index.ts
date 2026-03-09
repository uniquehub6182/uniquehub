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
    const safeFetch = async (url: string) => { try { const r = await fetch(url); const d = await r.json(); if (d.error) return null; return d; } catch { return null; } };
    const V = "v19.0";
    const result: any = { fbPage: null, fbPosts: null, fb: null, fbPrev: null, igProfile: null, igMedia: null, ig: null, igPrev: null, needsPermission: [] };
    if (metaToken?.page_id && metaToken?.page_token) {
      const at = metaToken.page_token, pid = metaToken.page_id;
      const now = new Date();
      /* Use custom dates if provided, otherwise default to current month */
      const sinceStr = since || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const untilStr = until || now.toISOString().split("T")[0];
      /* Calculate previous period (same length, immediately before) */
      const sinceDate = new Date(sinceStr); const untilDate = new Date(untilStr);
      const daysDiff = Math.ceil((untilDate.getTime() - sinceDate.getTime()) / (1000*60*60*24));
      const prevEnd = new Date(sinceDate); prevEnd.setDate(prevEnd.getDate() - 1);
      const prevStartD = new Date(prevEnd); prevStartD.setDate(prevStartD.getDate() - daysDiff);
      const prevStart = prevStartD.toISOString().split("T")[0];
      const prevEndStr = prevEnd.toISOString().split("T")[0];
      const core = "page_views_total,page_post_engagements,page_posts_impressions,page_video_views";

      /* Run ALL requests in parallel — no sequential waiting */
      const [page, posts, d1, d2, adv, igCheck] = await Promise.all([
        safeFetch(`https://graph.facebook.com/${V}/${pid}?fields=name,fan_count,followers_count,talking_about_count,picture{url},link&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}/published_posts?fields=id,message,created_time,full_picture,permalink_url&limit=20&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}/insights?metric=${core}&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}/insights?metric=${core}&period=day&since=${prevStart}&until=${prevEndStr}&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}/insights?metric=page_impressions,page_engaged_users,page_fan_adds&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`),
        safeFetch(`https://graph.facebook.com/${V}/${pid}?fields=instagram_business_account{id,username,followers_count,follows_count,media_count,profile_picture_url}&access_token=${at}`),
      ]);

      if (page) result.fbPage = page;
      if (posts?.data) {
        result.fbPosts = posts.data.map(p => ({ ...p, likes_count: 0, comments_count: 0, shares_count: 0 }));
        if ((page?.fan_count || 0) > 100) result.needsPermission.push("pages_read_engagement");
      }
      if (d1?.data) result.fb = d1.data;
      if (d2?.data) result.fbPrev = d2.data;
      if (adv?.data && result.fb) result.fb = [...result.fb, ...adv.data];

      /* Instagram via FB Business Account */
      const igBiz = igCheck?.instagram_business_account;
      if (igBiz?.id) {
        if (!metaToken.ig_user_id) {
          metaToken.ig_user_id = igBiz.id; metaToken.ig_username = igBiz.username;
          sb.from("app_settings").upsert({ key: `meta_token_${client_id}`, value: JSON.stringify(metaToken), updated_at: new Date().toISOString() }, { onConflict: "key" });
        }
        result.igProfile = igBiz;
        /* IG media + insights in parallel */
        const [igMedia, igIns1] = await Promise.all([
          safeFetch(`https://graph.facebook.com/${V}/${igBiz.id}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url,permalink&limit=20&access_token=${at}`),
          safeFetch(`https://graph.facebook.com/${V}/${igBiz.id}/insights?metric=impressions,reach,follower_count,profile_views&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`),
        ]);
        if (igMedia?.data) result.igMedia = igMedia.data;
        if (igIns1?.data) result.ig = igIns1.data;
        else {
          const igIns2 = await safeFetch(`https://graph.facebook.com/${V}/${igBiz.id}/insights?metric=follower_count&period=day&since=${sinceStr}&until=${untilStr}&access_token=${at}`);
          if (igIns2?.data) result.ig = igIns2.data;
        }
      } else if ((page?.fan_count || 0) > 0) {
        result.needsPermission.push("instagram_business_link");
      }
    }
    /* Instagram Platform API (direct login) */
    if (igToken?.ig_user_id && igToken?.access_token && !result.igProfile) {
      const at2 = igToken.access_token, uid2 = igToken.ig_user_id;
      const [prof, media] = await Promise.all([
        safeFetch(`https://graph.instagram.com/v21.0/${uid2}?fields=name,username,followers_count,follows_count,media_count,profile_picture_url&access_token=${at2}`),
        safeFetch(`https://graph.instagram.com/v21.0/${uid2}/media?fields=id,caption,media_type,timestamp,like_count,comments_count,thumbnail_url,media_url,permalink&limit=20&access_token=${at2}`),
      ]);
      if (prof) result.igProfile = prof;
      if (media?.data) result.igMedia = media.data;
    }
    return json(result);
  } catch (err) { console.error("social-insights:", err); return json({ error: err.message }, 200); }
});
