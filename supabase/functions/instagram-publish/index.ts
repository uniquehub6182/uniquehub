import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { client_id, caption, media_type, scheduled_publish_time } = body;
    // Support both single image_url and array of image_urls
    const imageUrls = body.image_urls || (body.image_url ? [body.image_url] : []);
    if (!client_id) throw new Error("Missing client_id");
    if (imageUrls.length === 0) throw new Error("Missing image_url(s)");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", `ig_token_${client_id}`).single();
    if (!setting?.value) throw new Error("Instagram não conectado para este cliente.");
    let tokenData;
    try { tokenData = JSON.parse(setting.value); } catch { throw new Error("Token corrompido"); }
    const { ig_user_id, access_token } = tokenData;
    if (!ig_user_id || !access_token) throw new Error("Token inválido — reconecte o Instagram");

    const type = (media_type || "FEED").toUpperCase();
    const isCarousel = imageUrls.length > 1 && type !== "STORIES";
    console.log("[IG Publish] user:", ig_user_id, "type:", type, "images:", imageUrls.length, "carousel:", isCarousel);

    let creationId: string;

    if (isCarousel) {
      // === CAROUSEL: Create individual item containers first ===
      const childIds: string[] = [];
      for (const url of imageUrls) {
        const p = new URLSearchParams();
        p.append("access_token", access_token);
        p.append("image_url", url);
        p.append("is_carousel_item", "true");
        const r = await fetch(`https://graph.instagram.com/v21.0/${ig_user_id}/media`, { method: "POST", body: p });
        const d = await r.json();
        console.log("[IG Carousel] Child container:", JSON.stringify(d).substring(0, 150));
        if (d.error) throw new Error(`Carousel item error: ${d.error.message}`);
        if (d.id) childIds.push(d.id);
      }
      if (childIds.length < 2) throw new Error("Carrossel precisa de pelo menos 2 imagens processadas com sucesso");

      // Wait for all children to process
      await new Promise(r => setTimeout(r, 5000));

      // Create carousel container
      const cp = new URLSearchParams();
      cp.append("access_token", access_token);
      cp.append("media_type", "CAROUSEL");
      cp.append("children", childIds.join(","));
      if (caption) cp.append("caption", caption);
      const cr = await fetch(`https://graph.instagram.com/v21.0/${ig_user_id}/media`, { method: "POST", body: cp });
      const cd = await cr.json();
      console.log("[IG Carousel] Container:", JSON.stringify(cd).substring(0, 200));
      if (cd.error) throw new Error(`Carousel container: ${cd.error.message}`);
      creationId = cd.id;

    } else {
      // === SINGLE IMAGE / STORY / REEL ===
      const p = new URLSearchParams();
      p.append("access_token", access_token);
      p.append("image_url", imageUrls[0]);
      if (type === "STORIES") p.append("media_type", "STORIES");
      else if (type === "REELS") { p.append("media_type", "REELS"); p.append("video_url", imageUrls[0]); }
      if (caption && type !== "STORIES") p.append("caption", caption);
      const r = await fetch(`https://graph.instagram.com/v21.0/${ig_user_id}/media`, { method: "POST", body: p });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      creationId = d.id;
    }

    if (!creationId) throw new Error("No creation_id from Instagram");

    // Wait for processing
    await new Promise(r => setTimeout(r, 3000));
    const sr = await fetch(`https://graph.instagram.com/v21.0/${creationId}?fields=status_code,status&access_token=${access_token}`);
    const sd = await sr.json();
    console.log("[IG Publish] Status:", JSON.stringify(sd));
    if (sd.status_code === "ERROR") throw new Error(`Processing error: ${sd.status || "unknown"}`);
    if (sd.status_code === "IN_PROGRESS") await new Promise(r => setTimeout(r, 5000));

    // Publish
    const pp = new URLSearchParams();
    pp.append("access_token", access_token);
    pp.append("creation_id", creationId);
    const pr = await fetch(`https://graph.instagram.com/v21.0/${ig_user_id}/media_publish`, { method: "POST", body: pp });
    const pd = await pr.json();
    console.log("[IG Publish] Published:", JSON.stringify(pd).substring(0, 300));
    if (pd.error) throw new Error(pd.error.message);

    const label = isCarousel ? "Carrossel" : type === "STORIES" ? "Story" : "Post";
    return new Response(JSON.stringify({
      success: true, media_id: pd.id, media_type: isCarousel ? "CAROUSEL" : type,
      message: `${label} publicado com sucesso!`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });

  } catch (err) {
    console.error("[IG Publish] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
});
