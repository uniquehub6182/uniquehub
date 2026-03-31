import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { headers: { ...H, "Content-Type": "application/json" }, status: s });

async function waitReady(id: string, token: string, isVideo = false) {
  const maxAttempts = isVideo ? 60 : 15;
  const baseDelay = isVideo ? 2000 : 300;
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=status_code&access_token=${token}`);
    const d = await r.json();
    if (d.status_code === "FINISHED") return;
    if (d.status_code === "ERROR") throw new Error("Instagram processing error: " + (d.status || "unknown"));
    await new Promise(r => setTimeout(r, i < 3 ? baseDelay : (isVideo ? 3000 : 500)));
  }
  throw new Error("Instagram processing timeout — video may still be processing");
}

async function publishInstagram(sb: any, clientId: string, urls: string[], caption: string, mediaType: string) {
  /* Try ig_token first, then fallback to social_tokens table */
  let uid = "", at = "";
  const { data: s } = await sb.from("app_settings").select("value").eq("key", `ig_token_${clientId}`).single();
  if (s?.value) {
    try { const tk = JSON.parse(s.value); if (tk.ig_user_id && tk.access_token) { uid = tk.ig_user_id; at = tk.access_token; } } catch {}
  }
  if (!uid || !at) {
    const { data: st } = await sb.from("social_tokens").select("access_token,ig_user_id,page_id").eq("client_id", clientId).eq("platform", "meta").single();
    if (st?.access_token && st?.page_id) {
      const pRes = await fetch(`https://graph.facebook.com/v21.0/${st.page_id}?fields=access_token,instagram_business_account&access_token=${st.access_token}`);
      const pData = await pRes.json();
      if (pData.access_token && pData.instagram_business_account?.id) {
        uid = pData.instagram_business_account.id; at = pData.access_token;
        await sb.from("app_settings").upsert({ key: `ig_token_${clientId}`, value: JSON.stringify({ ig_user_id: uid, access_token: at, page_id: st.page_id }) }, { onConflict: "key" });
        console.log(`[IG] Updated ig_token cache for ${clientId} from social_tokens`);
      }
    }
  }
  if (!uid || !at) throw new Error("Instagram não conectado — reconecte nas configurações");
  const type = (mediaType || "FEED").toUpperCase();
  const carousel = urls.length > 1 && type !== "STORIES" && type !== "REELS";

  let cid: string;
  if (type === "REELS") {
    /* ── REELS: video upload via Instagram Content Publishing API ── */
    const p = new URLSearchParams({ access_token: at, video_url: urls[0], media_type: "REELS" });
    if (caption) p.append("caption", caption);
    /* If there's a second URL, use it as cover image */
    if (urls.length > 1 && urls[1]) p.append("cover_url", urls[1]);
    console.log(`[IG Reels] Creating container with video: ${urls[0].substring(0, 80)}`);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    console.log(`[IG Reels] Container response:`, JSON.stringify(d).substring(0, 200));
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  } else if (carousel) {
    const kids = await Promise.all(urls.map(async (url: string) => {
      const p = new URLSearchParams({ access_token: at, image_url: url, is_carousel_item: "true" });
      const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      return d.id as string;
    }));
    await Promise.all(kids.map(id => waitReady(id, at)));
    const p = new URLSearchParams({ access_token: at, media_type: "CAROUSEL", children: kids.join(",") });
    if (caption) p.append("caption", caption);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  } else {
    const p = new URLSearchParams({ access_token: at, image_url: urls[0] });
    if (type === "STORIES") p.append("media_type", "STORIES");
    if (caption && type !== "STORIES") p.append("caption", caption);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  }

  await waitReady(cid, at, type === "REELS");
  const pp = new URLSearchParams({ access_token: at, creation_id: cid });
  const pr = await fetch(`https://graph.facebook.com/v21.0/${uid}/media_publish`, { method: "POST", body: pp });
  const pd = await pr.json();
  if (pd.error) throw new Error(pd.error.message);
  return { success: true, media_id: pd.id, media_type: carousel ? "CAROUSEL" : type };
}

async function publishFacebook(sb: any, clientId: string, imageUrls: string[], caption: string, mediaType?: string) {
  /* Try client_socials first, then fall back to meta_token */
  let pageToken: string | null = null;
  let pageId: string | null = null;

  const { data: s1 } = await sb.from("app_settings").select("value").eq("key", `client_socials_${clientId}`).single();
  if (s1?.value) {
    try {
      const socials = JSON.parse(s1.value);
      const fb = socials.facebook;
      if (fb?.oauth?.page_token && fb?.oauth?.page_id) {
        pageToken = fb.oauth.page_token;
        pageId = fb.oauth.page_id;
      }
    } catch { /* ignore parse errors */ }
  }

  /* Fallback: try meta_token_${clientId} */
  if (!pageToken || !pageId) {
    const { data: s2 } = await sb.from("app_settings").select("value").eq("key", `meta_token_${clientId}`).single();
    if (s2?.value) {
      try {
        const tk = JSON.parse(s2.value);
        if (tk.page_token && tk.page_id) {
          pageToken = tk.page_token;
          pageId = tk.page_id;
        }
      } catch { /* ignore */ }
    }
  }

  if (!pageToken || !pageId) throw new Error("Token Facebook não encontrado");

  const type = (mediaType || "FEED").toUpperCase();
  console.log(`[publishFacebook v3] type=${type} urls=${imageUrls.length} url0=${(imageUrls[0]||"").substring(0,60)}`);

  if (type === "REELS") {
    /* ── REELS: 3-step upload with STREAMING (no memory buffering) ── */
    const videoUrl = imageUrls[0];
    if (!videoUrl) throw new Error("No video URL for Reels");

    /* Step 1: Init */
    const initParams = new URLSearchParams({ upload_phase: "start", access_token: pageToken });
    const initRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: initParams });
    const initData = await initRes.json();
    if (initData.error) throw new Error(initData.error.message);
    const videoId = initData.video_id;
    const uploadUrl = initData.upload_url;

    /* Step 2: Stream video directly (pipe download→upload, zero buffering) */
    console.log(`[FB Reels Sched] Streaming video...`);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
    const fileSize = videoRes.headers.get("content-length") || "0";
    await fetch(uploadUrl, {
      method: "POST",
      headers: { "Authorization": `OAuth ${pageToken}`, "offset": "0", "file_size": fileSize, "Content-Type": "application/octet-stream" },
      body: videoRes.body, /* Stream — no memory buffering */
    });

    /* Step 3: Finish */
    const finishParams = new URLSearchParams({ upload_phase: "finish", access_token: pageToken, video_id: videoId });
    if (caption) finishParams.append("description", caption);
    if (imageUrls.length > 1 && imageUrls[1]) finishParams.append("thumb", imageUrls[1]);
    const finishRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: finishParams });
    const finishData = await finishRes.json();
    if (finishData.error) throw new Error(finishData.error.message);

    /* Explicitly publish — video_state in finish step is unreliable */
    await fetch(`https://graph.facebook.com/v21.0/${videoId}`, {
      method: "POST", body: new URLSearchParams({ access_token: pageToken, published: "true" })
    });

    return { success: true, media_id: videoId };
  }

  /* ── FEED/default: photo post ── */
  const params = new URLSearchParams({ access_token: pageToken, message: caption || "", url: imageUrls[0] || "" });
  const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, { method: "POST", body: params });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return { success: true, media_id: d.id || d.post_id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    // Find posts that are due (scheduled_at <= now AND status = pending)
    const now = new Date().toISOString();
    const { data: posts, error } = await sb
      .from("scheduled_posts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (error) throw new Error(`DB error: ${error.message}`);
    if (!posts || posts.length === 0) return json({ message: "No posts due", count: 0 });

    console.log(`[Scheduler] Found ${posts.length} posts to publish`);
    const results = [];

    for (const post of posts) {
      // Atomically mark as publishing — only if still pending (prevents duplicates from concurrent calls)
      const { data: updated, error: upErr } = await sb
        .from("scheduled_posts")
        .update({ status: "publishing" })
        .eq("id", post.id)
        .eq("status", "pending")
        .select("id")
        .single();
      
      if (upErr || !updated) {
        console.log(`[Scheduler] Post ${post.id} already picked up by another call, skipping`);
        continue;
      }
      
      try {
        const urls = (post.image_urls || []) as string[];
        let result;

        if (post.platform === "instagram") {
          result = await publishInstagram(sb, post.client_id, urls, post.caption || "", post.media_type);
        } else {
          result = await publishFacebook(sb, post.client_id, urls, post.caption || "", post.media_type);
        }

        // Mark as published
        await sb.from("scheduled_posts").update({
          status: "published",
          result: result,
          published_at: new Date().toISOString(),
        }).eq("id", post.id);

        // Move demand from "scheduled" to "published" if demand_id exists
        if (post.demand_id) {
          await sb.from("demands").update({ stage: "published" }).eq("id", post.demand_id);
          console.log(`[Scheduler] Moved demand ${post.demand_id} to published`);
        }

        console.log(`[Scheduler] Published post ${post.id} on ${post.platform}`);
        results.push({ id: post.id, status: "published" });
      } catch (e: any) {
        console.error(`[Scheduler] Failed post ${post.id}:`, e.message);
        await sb.from("scheduled_posts").update({
          status: "failed",
          error: e.message,
        }).eq("id", post.id);
        results.push({ id: post.id, status: "failed", error: e.message });

        /* ── Notify admins about the failure ── */
        try {
          let clientName = post.client_id;
          let demandTitle = post.caption?.substring(0, 40) || "Post agendado";
          /* Fetch client name */
          const { data: cl } = await sb.from("clients").select("name").eq("id", post.client_id).single();
          if (cl?.name) clientName = cl.name;
          /* Fetch demand title if available */
          if (post.demand_id) {
            const { data: dm } = await sb.from("demands").select("title").eq("id", post.demand_id).single();
            if (dm?.title) demandTitle = dm.title;
          }
          const platform = post.platform === "instagram" ? "Instagram" : "Facebook";
          const errorMsg = (e.message || "Erro desconhecido").substring(0, 120);
          const { data: teamUsers } = await sb.from("profiles").select("id, role").in("role", ["admin", "owner", "manager"]);
          for (const u of (teamUsers || [])) {
            await sb.from("notifications").insert({
              user_id: u.id,
              type: "publish_failed",
              title: `❌ Falha na publicação — ${clientName}`,
              body: `Post "${demandTitle}" falhou no ${platform}. Erro: ${errorMsg}`,
              read: false,
            });
          }
          console.log(`[Scheduler] Sent failure notifications to ${(teamUsers||[]).length} admins`);
        } catch (notifErr) { console.error("[Scheduler] Failed to send failure notification:", notifErr); }
      }
    }

    return json({ message: `Processed ${results.length} posts`, results });
  } catch (e: any) {
    console.error("[Scheduler] Error:", e.message);
    return json({ error: e.message }, 500);
  }
});
