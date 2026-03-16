import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { code, redirect_uri } = await req.json();
    if (!code) throw new Error("Missing authorization code");

    const IG_APP_ID = Deno.env.get("INSTAGRAM_APP_ID") || Deno.env.get("IG_APP_ID")!;
    const IG_APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET") || Deno.env.get("IG_APP_SECRET")!;

    if (!IG_APP_ID || !IG_APP_SECRET) {
      throw new Error("Instagram App credentials not configured");
    }

    // Step 1: Exchange authorization code for short-lived token
    const tokenForm = new URLSearchParams();
    tokenForm.append("client_id", IG_APP_ID);
    tokenForm.append("client_secret", IG_APP_SECRET);
    tokenForm.append("grant_type", "authorization_code");
    tokenForm.append("redirect_uri", redirect_uri || "https://uniquehub-beta.vercel.app/");
    tokenForm.append("code", code);

    console.log("[IG OAuth] Exchanging code for token, redirect_uri:", redirect_uri);

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: tokenForm,
    });
    const tokenData = await tokenRes.json();
    console.log("[IG OAuth] Token response:", JSON.stringify(tokenData).substring(0, 200));

    if (tokenData.error_message || tokenData.error) {
      throw new Error(tokenData.error_message || tokenData.error?.message || JSON.stringify(tokenData.error));
    }

    const shortLivedToken = tokenData.access_token;
    const igUserId = tokenData.user_id;

    if (!shortLivedToken) {
      throw new Error("No access_token in Instagram response");
    }

    // Step 2: Exchange for long-lived token (60 days)
    let longLivedToken = shortLivedToken;
    let expiresIn = 3600; // default 1 hour for short-lived
    try {
      const longUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${shortLivedToken}`;
      const longRes = await fetch(longUrl);
      const longData = await longRes.json();
      console.log("[IG OAuth] Long-lived token response:", JSON.stringify(longData).substring(0, 200));
      if (longData.access_token) {
        longLivedToken = longData.access_token;
        expiresIn = longData.expires_in || 5184000; // 60 days
      }
    } catch (e) {
      console.warn("[IG OAuth] Long-lived token exchange failed, using short-lived:", e.message);
    }

    // Step 3: Get user profile info
    const profileRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username,name,account_type,profile_picture_url,followers_count,media_count&access_token=${longLivedToken}`
    );
    const profile = await profileRes.json();
    console.log("[IG OAuth] Profile:", JSON.stringify(profile).substring(0, 300));

    if (profile.error) {
      console.warn("[IG OAuth] Profile fetch error:", profile.error.message);
    }

    // Return profile + token data to frontend
    const result = {
      ig_user_id: String(profile.id || igUserId),
      username: profile.username || "",
      account_type: profile.account_type || "",
      profile_picture_url: profile.profile_picture_url || "",
      followers_count: profile.followers_count || 0,
      media_count: profile.media_count || 0,
      access_token: longLivedToken,
      expires_in: expiresIn,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err) {
    console.error("[IG OAuth] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
