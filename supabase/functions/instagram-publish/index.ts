import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { client_id, image_url, caption, media_type, scheduled_publish_time } = await req.json();
    if (!client_id) throw new Error("Missing client_id");
    if (!image_url) throw new Error("Missing image_url");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Read Instagram token from app_settings
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", `ig_token_${client_id}`).single();
    if (!setting?.value) throw new Error("Instagram não conectado para este cliente.");
    
    let tokenData;
    try { tokenData = JSON.parse(setting.value); } catch { throw new Error("Token corrompido"); }
    const { ig_user_id, access_token } = tokenData;
    if (!ig_user_id || !access_token) throw new Error("Token inválido — reconecte o Instagram");

    const type = (media_type || "FEED").toUpperCase();
    const isScheduled = !!scheduled_publish_time && type !== "STORIES"; // Stories can't be scheduled
    console.log("[IG Publish] user:", ig_user_id, "type:", type, "scheduled:", isScheduled);

    // Create media container
    const containerParams = new URLSearchParams();
    containerParams.append("access_token", access_token);
    containerParams.append("image_url", image_url);
    if (type === "STORIES") containerParams.append("media_type", "STORIES");
    else if (type === "REELS") { containerParams.append("media_type", "REELS"); containerParams.append("video_url", image_url); }
    if (caption && type !== "STORIES") containerParams.append("caption", caption);

    const containerRes = await fetch(`https://graph.instagram.com/v21.0/${ig_user_id}/media`, { method: "POST", body: containerParams });
    const containerData = await containerRes.json();
    console.log("[IG Publish] Container:", JSON.stringify(containerData).substring(0, 300));
    if (containerData.error) throw new Error(containerData.error.message || JSON.stringify(containerData.error));
    const creationId = containerData.id;
    if (!creationId) throw new Error("No creation_id from Instagram");

    // Wait for Instagram to process the image
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`https://graph.instagram.com/v21.0/${creationId}?fields=status_code,status&access_token=${access_token}`);
    const statusData = await statusRes.json();
    console.log("[IG Publish] Status:", JSON.stringify(statusData));
    if (statusData.status_code === "ERROR") throw new Error(`Processing error: ${statusData.status || "unknown"}`);
    if (statusData.status_code === "IN_PROGRESS") await new Promise(r => setTimeout(r, 5000));

    // If scheduled, save to DB for later publishing (cron job needed)
    if (isScheduled) {
      const { error: schedErr } = await supabase.from("app_settings").upsert({
        key: `ig_scheduled_${creationId}`,
        value: JSON.stringify({ creation_id: creationId, ig_user_id, access_token, scheduled_publish_time, client_id, type, caption }),
        updated_at: new Date().toISOString()
      }, { onConflict: "key" });
      console.log("[IG Publish] Scheduled for:", new Date(scheduled_publish_time * 1000).toISOString(), schedErr ? `Error: ${schedErr.message}` : "OK");
      return new Response(JSON.stringify({
        success: true, media_id: creationId, media_type: type, scheduled: true,
        message: `Agendado para ${new Date(scheduled_publish_time * 1000).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}!`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // Publish immediately
    const publishParams = new URLSearchParams();
    publishParams.append("access_token", access_token);
    publishParams.append("creation_id", creationId);
    const publishRes = await fetch(`https://graph.instagram.com/v21.0/${ig_user_id}/media_publish`, { method: "POST", body: publishParams });
    const publishData = await publishRes.json();
    console.log("[IG Publish] Published:", JSON.stringify(publishData).substring(0, 300));
    if (publishData.error) throw new Error(publishData.error.message || JSON.stringify(publishData.error));

    return new Response(JSON.stringify({
      success: true, media_id: publishData.id, media_type: type,
      message: type === "STORIES" ? "Story publicado!" : "Post publicado!",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });

  } catch (err) {
    console.error("[IG Publish] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
});
