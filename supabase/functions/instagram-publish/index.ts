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
    const { client_id, image_url, caption, media_type } = await req.json();
    // media_type: "FEED" (default), "STORIES", "REELS"

    if (!client_id) throw new Error("Missing client_id");
    if (!image_url) throw new Error("Missing image_url");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Step 1: Read Instagram token from app_settings
    const settingKey = `ig_token_${client_id}`;
    const { data: setting, error: settingErr } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", settingKey)
      .single();

    if (settingErr || !setting?.value) {
      throw new Error("Instagram não conectado para este cliente. Conecte primeiro via OAuth.");
    }

    let tokenData;
    try { tokenData = JSON.parse(setting.value); } catch { throw new Error("Token data corrupted"); }

    const { ig_user_id, access_token } = tokenData;
    if (!ig_user_id || !access_token) {
      throw new Error("Token inválido — reconecte o Instagram");
    }

    console.log("[IG Publish] Publishing for user:", ig_user_id, "type:", media_type || "FEED");

    // Step 2: Create media container
    const containerParams = new URLSearchParams();
    containerParams.append("access_token", access_token);
    containerParams.append("image_url", image_url);
    
    const type = (media_type || "FEED").toUpperCase();
    if (type === "STORIES") {
      containerParams.append("media_type", "STORIES");
    } else if (type === "REELS") {
      containerParams.append("media_type", "REELS");
      containerParams.append("video_url", image_url); // For reels, image_url should be video
    }
    
    if (caption && type !== "STORIES") {
      containerParams.append("caption", caption);
    }

    const containerRes = await fetch(
      `https://graph.instagram.com/v21.0/${ig_user_id}/media`,
      { method: "POST", body: containerParams }
    );
    const containerData = await containerRes.json();
    console.log("[IG Publish] Container response:", JSON.stringify(containerData).substring(0, 300));

    if (containerData.error) {
      throw new Error(containerData.error.message || JSON.stringify(containerData.error));
    }

    const creationId = containerData.id;
    if (!creationId) throw new Error("No creation_id returned from Instagram");

    // Step 3: Wait a bit for Instagram to process the image, then publish
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check container status before publishing
    const statusRes = await fetch(
      `https://graph.instagram.com/v21.0/${creationId}?fields=status_code,status&access_token=${access_token}`
    );
    const statusData = await statusRes.json();
    console.log("[IG Publish] Container status:", JSON.stringify(statusData));

    if (statusData.status_code === "ERROR") {
      throw new Error(`Instagram processing error: ${statusData.status || "unknown"}`);
    }

    // If still processing, wait more
    if (statusData.status_code === "IN_PROGRESS") {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Step 4: Publish the container
    const publishParams = new URLSearchParams();
    publishParams.append("access_token", access_token);
    publishParams.append("creation_id", creationId);

    const publishRes = await fetch(
      `https://graph.instagram.com/v21.0/${ig_user_id}/media_publish`,
      { method: "POST", body: publishParams }
    );
    const publishData = await publishRes.json();
    console.log("[IG Publish] Publish response:", JSON.stringify(publishData).substring(0, 300));

    if (publishData.error) {
      throw new Error(publishData.error.message || JSON.stringify(publishData.error));
    }

    return new Response(JSON.stringify({
      success: true,
      media_id: publishData.id,
      media_type: type,
      message: type === "STORIES" ? "Story publicado com sucesso!" : "Post publicado com sucesso!",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err) {
    console.error("[IG Publish] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
