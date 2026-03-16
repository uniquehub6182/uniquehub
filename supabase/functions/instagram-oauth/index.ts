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
    // Instagram Business Login uses graph.instagram.com/access_token
    let longLivedToken = shortLivedToken;
    let expiresIn = 3600;
    try {
      // Try multiple endpoints for long-lived token
      const endpoints = [
        `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${shortLivedToken}`,
        `https://graph.instagram.com/v21.0/access_token?grant_type=ig_exchange_token&client_secret=${IG_APP_SECRET}&access_token=${shortLivedToken}`,
      ];
      for (const url of endpoints) {
        console.log("[IG OAuth] Trying long-lived URL:", url.replace(IG_APP_SECRET, "***").replace(shortLivedToken, "TKN***"));
        const res = await fetch(url);
        const txt = await res.text();
        console.log("[IG OAuth] Long-lived response:", txt.substring(0, 200));
        try {
          const data = JSON.parse(txt);
          if (data.access_token) {
            longLivedToken = data.access_token;
            expiresIn = data.expires_in || 5184000;
            console.log("[IG OAuth] Got long-lived token, expires:", expiresIn);
            break;
          }
        } catch {}
      }
    } catch (e) {
      console.warn("[IG OAuth] Long-lived exchange failed:", e.message);
    }

    // Step 3: Get user profile — try /me first, then /{user_id}
    let profile: any = {};
    const fields = "user_id,username,name,account_type,profile_picture_url,followers_count,media_count";
    const profileEndpoints = [
      `https://graph.instagram.com/me?fields=${fields}&access_token=${longLivedToken}`,
      `https://graph.instagram.com/v21.0/me?fields=${fields}&access_token=${longLivedToken}`,
      `https://graph.instagram.com/v21.0/${igUserId}?fields=${fields}&access_token=${longLivedToken}`,
      `https://graph.instagram.com/${igUserId}?fields=${fields}&access_token=${longLivedToken}`,
    ];
    for (const url of profileEndpoints) {
      console.log("[IG OAuth] Trying profile:", url.replace(longLivedToken, "TKN***"));
      const res = await fetch(url);
      const txt = await res.text();
      console.log("[IG OAuth] Profile response:", txt.substring(0, 300));
      try {
        const data = JSON.parse(txt);
        if (data.username || data.name) {
          profile = data;
          console.log("[IG OAuth] Profile found:", data.username);
          break;
        }
        if (data.error) console.warn("[IG OAuth] Profile error:", data.error.message);
      } catch {}
    }

    // Return profile + token data to frontend
    const result = {
      ig_user_id: String(profile.user_id || igUserId),
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
