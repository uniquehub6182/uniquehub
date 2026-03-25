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
    const { client_id, image_url, caption, media_type } = await req.json();
    if (!client_id) throw new Error("Missing client_id");
    if (!image_url) throw new Error("Missing image_url");

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

    console.log(`[FB Publish] page: ${page_id}, type: ${type}, hasImage: ${!!image_url}`);

    const params = new URLSearchParams();
    params.append("access_token", page_token);
    params.append("url", image_url);

    if (!isStories && caption) params.append("message", caption);

    /* Stories use /photo_stories endpoint, Feed uses /photos */
    const endpoint = isStories
      ? `https://graph.facebook.com/v21.0/${page_id}/photo_stories`
      : `https://graph.facebook.com/v21.0/${page_id}/photos`;

    const res = await fetch(endpoint, { method: "POST", body: params });
    const data = await res.json();
    console.log(`[FB Publish] Response:`, JSON.stringify(data).substring(0, 300));

    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    return json({
      success: true,
      media_id: data.id || data.post_id,
      message: isStories ? "Story publicado no Facebook!" : "Post publicado no Facebook!",
    });
  } catch (err: any) {
    console.error("[FB Publish] Error:", err.message);
    return json({ error: err.message }, 400);
  }
});
