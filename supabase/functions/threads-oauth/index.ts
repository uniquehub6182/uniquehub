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
    const APP_ID = Deno.env.get("THREADS_APP_ID") || Deno.env.get("META_APP_ID")!;
    const APP_SECRET = Deno.env.get("THREADS_APP_SECRET") || Deno.env.get("META_APP_SECRET")!;
    if (!APP_ID || !APP_SECRET) throw new Error("Threads credentials not configured");

    if (action === "exchange_token") {
      const { code, redirect_uri } = body;
      if (!code) throw new Error("Missing code");

      // Step 1: Exchange code for short-lived token
      const tokenRes = await fetch("https://graph.threads.net/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: APP_ID,
          client_secret: APP_SECRET,
          grant_type: "authorization_code",
          redirect_uri: redirect_uri || "https://uniquehub-beta.vercel.app/",
          code,
        }),
      });
      const tokenData = await tokenRes.json();
      console.log("[Threads] Token:", JSON.stringify(tokenData).substring(0, 200));
      if (tokenData.error_message || tokenData.error) throw new Error(tokenData.error_message || tokenData.error?.message || "Token exchange failed");

      const shortToken = tokenData.access_token;
      const userId = tokenData.user_id;

      // Step 2: Exchange for long-lived token
      const llRes = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${APP_SECRET}&access_token=${shortToken}`);
      const llData = await llRes.json();
      const longToken = llData.access_token || shortToken;

      // Step 3: Get profile info
      const profileRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${longToken}`);
      const profile = await profileRes.json();

      return new Response(JSON.stringify({
        access_token: longToken,
        user_id: userId || profile.id,
        username: profile.username || "",
        profile_picture_url: profile.threads_profile_picture_url || "",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    /* ═══ PUBLISH ═══ */
    if (action === "publish") {
      const { client_id, text, image_url } = body;
      const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
      const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(SUPA_URL, SUPA_KEY);
      const { data: setting } = await sb.from("app_settings").select("value").eq("key", `threads_token_${client_id}`).single();
      if (!setting?.value) throw new Error("Threads token not found for client");
      const token = JSON.parse(setting.value);
      const accessToken = token.access_token;
      const userId = token.user_id;

      // Create media container
      const params: Record<string, string> = { text: text || "", access_token: accessToken };
      if (image_url) { params.media_type = "IMAGE"; params.image_url = image_url; } else { params.media_type = "TEXT"; }

      const createRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
      });
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error.message || "Failed to create container");
      const containerId = createData.id;

      // Wait for processing
      await new Promise(r => setTimeout(r, 3000));

      // Publish
      const pubRes = await fetch(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: containerId, access_token: accessToken }),
      });
      const pubData = await pubRes.json();
      if (pubData.error) throw new Error(pubData.error.message || "Failed to publish");

      return new Response(JSON.stringify({ success: true, id: pubData.id }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    throw new Error("Invalid action: " + action);
  } catch (e) {
    console.error("[Threads]", e);
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
