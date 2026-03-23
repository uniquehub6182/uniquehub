import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const { action } = body;
    const CLIENT_KEY = Deno.env.get("TIKTOK_CLIENT_KEY")!;
    const CLIENT_SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET")!;
    if (!CLIENT_KEY || !CLIENT_SECRET) throw new Error("TikTok credentials not configured");

    if (action === "exchange_token") {
      const { code, redirect_uri } = body;
      if (!code) throw new Error("Missing code");

      // Exchange code for access token
      const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: CLIENT_KEY,
          client_secret: CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirect_uri || "https://uniquehub-beta.vercel.app/",
        }),
      });
      const tokenData = await tokenRes.json();
      console.log("[TikTok] Token:", JSON.stringify(tokenData).substring(0, 300));
      if (tokenData.error || !tokenData.access_token) throw new Error(tokenData.error_description || tokenData.error || "Token exchange failed");

      // Get user info
      const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url,follower_count,username", {
        headers: { "Authorization": `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();
      const user = userData.data?.user || {};

      return new Response(JSON.stringify({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        open_id: tokenData.open_id,
        username: user.username || user.display_name || "",
        avatar_url: user.avatar_url || "",
        follower_count: user.follower_count || 0,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    /* ═══ PUBLISH VIDEO ═══ */
    if (action === "publish") {
      const { client_id, video_url, caption } = body;
      const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(SUPA_URL, SUPA_KEY);
      const { data: setting } = await sb.from("app_settings").select("value").eq("key", `tiktok_token_${client_id}`).single();
      if (!setting?.value) throw new Error("TikTok token not found for client");
      const token = JSON.parse(setting.value);

      // Init video upload (pull from URL)
      const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          source_info: { source: "PULL_FROM_URL", video_url },
        }),
      });
      const initData = await initRes.json();
      if (initData.error?.code !== "ok") throw new Error(initData.error?.message || "Failed to init upload");

      return new Response(JSON.stringify({
        success: true,
        publish_id: initData.data?.publish_id,
        message: "Video enviado para TikTok. O vídeo aparecerá na caixa de entrada do TikTok para edição final.",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    throw new Error("Invalid action: " + action);
  } catch (e) {
    console.error("[TikTok]", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
