import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: s });

/* ── Resolve Facebook Page token from multiple storage locations ── */
async function resolvePageToken(sb: any, clientId: string) {
  let pageToken: string | null = null;
  let pageId: string | null = null;

  /* Source 1: client_socials_{clientId} */
  const { data: s1 } = await sb.from("app_settings").select("value").eq("key", `client_socials_${clientId}`).single();
  if (s1?.value) {
    try {
      const socials = JSON.parse(s1.value);
      const fb = socials.facebook;
      if (fb?.oauth?.page_token && fb?.oauth?.page_id) {
        pageToken = fb.oauth.page_token;
        pageId = fb.oauth.page_id;
        console.log(`[FB Token] Found in client_socials_${clientId}`);
      }
    } catch { /* ignore */ }
  }

  /* Source 2: meta_token_{clientId} */
  if (!pageToken || !pageId) {
    const { data: s2 } = await sb.from("app_settings").select("value").eq("key", `meta_token_${clientId}`).single();
    if (s2?.value) {
      try {
        const tk = JSON.parse(s2.value);
        if (tk.page_token && tk.page_id) {
          pageToken = tk.page_token;
          pageId = tk.page_id;
          console.log(`[FB Token] Found in meta_token_${clientId}`);
        }
      } catch { /* ignore */ }
    }
  }

  if (!pageToken || !pageId) throw new Error("Token Facebook não encontrado — reconecte a página");
  return { pageToken, pageId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { client_id, caption, media_type } = body;
    const urls: string[] = body.image_urls
      ? (Array.isArray(body.image_urls) ? body.image_urls : [body.image_urls])
      : body.image_url ? [body.image_url] : [];
    if (!client_id) throw new Error("Missing client_id");
    if (urls.length === 0) throw new Error("Missing image_url or image_urls");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { pageToken, pageId } = await resolvePageToken(sb, client_id);

    const type = (media_type || "FEED").toUpperCase();
    console.log(`[FB Publish] page: ${pageId}, type: ${type}, urls: ${urls.length}, url[0]: ${(urls[0]||"").substring(0, 80)}`);

    if (type === "REELS") {
      /* ── REELS: 3-step upload with STREAMING (no memory buffering) ── */
      const videoUrl = urls[0];
      if (!videoUrl) throw new Error("No video URL for Reels");

      /* Step 1: Initialize */
      console.log(`[FB Reels] Step 1: Init upload`);
      const initParams = new URLSearchParams({ upload_phase: "start", access_token: pageToken });
      const initRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: initParams });
      const initData = await initRes.json();
      if (initData.error) throw new Error(`Init: ${initData.error.message}`);
      const videoId = initData.video_id;
      const uploadUrl = initData.upload_url;
      if (!videoId || !uploadUrl) throw new Error("Missing video_id/upload_url");
      console.log(`[FB Reels] Got video_id=${videoId}`);

      /* Step 2: Stream video directly (download→upload pipe, zero buffering) */
      console.log(`[FB Reels] Step 2: Streaming from ${videoUrl.substring(0, 60)}...`);
      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
      const fileSize = videoRes.headers.get("content-length") || "0";

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `OAuth ${pageToken}`,
          "offset": "0",
          "file_size": fileSize,
          "Content-Type": "application/octet-stream",
        },
        body: videoRes.body, /* Stream directly — no memory buffering! */
      });
      const uploadData = await uploadRes.json();
      console.log("[FB Reels] Upload response:", JSON.stringify(uploadData).substring(0, 200));
      if (uploadData.error) throw new Error(`Upload: ${uploadData.error.message}`);

      /* Step 3: Finish */
      console.log(`[FB Reels] Step 3: Finishing...`);
      const finishParams = new URLSearchParams({ upload_phase: "finish", access_token: pageToken, video_id: videoId });
      if (caption) finishParams.append("description", caption);
      if (urls.length > 1 && urls[1]) finishParams.append("thumb", urls[1]);
      const finishRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: finishParams });
      const finishData = await finishRes.json();
      console.log("[FB Reels] Finish response:", JSON.stringify(finishData).substring(0, 200));
      if (finishData.error) throw new Error(`Finish: ${finishData.error.message}`);

      /* Step 4: Explicitly publish (video_state in finish step doesn't work reliably) */
      console.log(`[FB Reels] Step 4: Publishing video ${videoId}...`);
      const pubParams = new URLSearchParams({ access_token: pageToken, published: "true" });
      const pubRes = await fetch(`https://graph.facebook.com/v21.0/${videoId}`, { method: "POST", body: pubParams });
      const pubData = await pubRes.json();
      console.log("[FB Reels] Publish response:", JSON.stringify(pubData).substring(0, 200));

      return json({ success: true, media_id: videoId, message: "Reels publicado no Facebook!" });

    } else if (type === "STORIES") {
      /* ── STORIES ── */
      const results: { id: string }[] = [];
      for (const url of urls) {
        const params = new URLSearchParams({ access_token: pageToken, url });
        const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photo_stories`, { method: "POST", body: params });
        const data = await res.json();
        console.log(`[FB Story] Response:`, JSON.stringify(data).substring(0, 200));
        if (data.error) throw new Error(data.error.message);
        results.push({ id: data.id || data.post_id });
      }
      return json({ success: true, count: results.length, post_ids: results.map(r => r.id), message: `${results.length} story(s) publicado(s)!` });

    } else {
      /* ── FEED: photo post ── */
      const scheduledTime = body.scheduled_publish_time;
      const params = new URLSearchParams({ access_token: pageToken, url: urls[0] });
      if (caption) params.append("message", caption);
      if (scheduledTime) {
        params.append("published", "false");
        params.append("scheduled_publish_time", String(scheduledTime));
      }
      const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, { method: "POST", body: params });
      const data = await res.json();
      console.log(`[FB Feed] Response:`, JSON.stringify(data).substring(0, 200));
      if (data.error) throw new Error(data.error.message);
      return json({ success: true, media_id: data.id || data.post_id, message: scheduledTime ? "Post agendado!" : "Post publicado!" });
    }
  } catch (err: any) {
    console.error("[FB Publish] Error:", err.message);
    return json({ error: err.message }, 400);
  }
});
