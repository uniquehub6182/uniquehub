import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { client_id, caption, media_type } = body;
    /* Accept both image_url (string) and image_urls (array) */
    const urls: string[] = body.image_urls
      ? (Array.isArray(body.image_urls) ? body.image_urls : [body.image_urls])
      : body.image_url ? [body.image_url] : [];
    if (!client_id) throw new Error("Missing client_id");
    if (urls.length === 0) throw new Error("Missing image_url or image_urls");

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: setting } = await sb
      .from("app_settings").select("value").eq("key", `meta_token_${client_id}`).single();
    if (!setting?.value) throw new Error("Facebook não conectado para este cliente.");

    let tokenData;
    try { tokenData = JSON.parse(setting.value); } catch { throw new Error("Token corrompido"); }
    const { page_id, page_token } = tokenData;
    if (!page_id || !page_token) throw new Error("Token do Facebook inválido — reconecte");

    const type = (media_type || "FEED").toUpperCase();
    const isStories = type === "STORIES";

    console.log(`[FB Publish] page: ${page_id}, type: ${type}, images: ${urls.length}`);

    if (isStories) {
      /* ── STORIES: loop through each image, publish one story per image ── */
      const results: { id: string }[] = [];
      for (const url of urls) {
        const params = new URLSearchParams();
        params.append("access_token", page_token);
        params.append("url", url);
        const endpoint = `https://graph.facebook.com/v21.0/${page_id}/photo_stories`;
        const res = await fetch(endpoint, { method: "POST", body: params });
        const data = await res.json();
        console.log(`[FB Story] Response:`, JSON.stringify(data).substring(0, 200));
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        results.push({ id: data.id || data.post_id });
      }
      return json({
        success: true,
        count: results.length,
        post_ids: results.map(r => r.id),
        message: `${results.length} story${results.length > 1 ? "s" : ""} publicado${results.length > 1 ? "s" : ""} no Facebook!`,
      });
    } else {
      /* ── FEED: single photo post (with optional scheduling) ── */
      const scheduledTime = body.scheduled_publish_time;
      const params = new URLSearchParams();
      params.append("access_token", page_token);
      params.append("url", urls[0]);
      if (caption) params.append("message", caption);
      if (scheduledTime) {
        params.append("published", "false");
        params.append("scheduled_publish_time", String(scheduledTime));
        console.log(`[FB Feed] Scheduling for timestamp: ${scheduledTime} (${new Date(scheduledTime * 1000).toISOString()})`);
      }
      const endpoint = `https://graph.facebook.com/v21.0/${page_id}/photos`;
      const res = await fetch(endpoint, { method: "POST", body: params });
      const data = await res.json();
      console.log(`[FB Feed] Response:`, JSON.stringify(data).substring(0, 200));
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return json({
        success: true,
        media_id: data.id || data.post_id,
        scheduled: !!scheduledTime,
        message: scheduledTime ? "Post agendado no Facebook!" : "Post publicado no Facebook!",
      });
    }
  } catch (err: any) {
    console.error("[FB Publish] Error:", err.message);
    return json({ error: err.message }, 400);
  }
});
