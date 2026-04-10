import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let code = url.searchParams.get("code");
    let client_id = url.searchParams.get("client_id");
    let redirect_uri = url.searchParams.get("redirect_uri");

    if (req.method === "POST") {
      try {
        const body = await req.json();
        code = code || body.code;
        client_id = client_id || body.client_id;
        redirect_uri = redirect_uri || body.redirect_uri;
      } catch {}
    }

    if (!code) throw new Error("Missing code parameter");

    const app_id = client_id || Deno.env.get("META_APP_ID");
    const app_secret = Deno.env.get("META_APP_SECRET");
    if (!app_secret) throw new Error("META_APP_SECRET not configured");

    /* Step 1: Exchange code for short-lived user access token */
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${app_id}&client_secret=${app_secret}&redirect_uri=${encodeURIComponent(redirect_uri || "")}&code=${encodeURIComponent(code)}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();
    if (tokenData.error) throw new Error(`Token error: ${tokenData.error.message}`);
    const shortToken = tokenData.access_token;

    /* Step 2: Exchange for long-lived user token */
    const llUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${app_id}&client_secret=${app_secret}&fb_exchange_token=${shortToken}`;
    const llRes = await fetch(llUrl);
    const llData = await llRes.json();
    const userToken = llData.access_token || shortToken;

    /* Step 3: Get ALL pages user administers */
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,category,access_token,picture{url}&limit=100&access_token=${userToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(`Pages error: ${pagesData.error.message}`);
    const pages = pagesData.data || [];

    if (pages.length === 0) {
      return new Response(JSON.stringify({ error: "Nenhuma página encontrada. Você precisa ser administrador de pelo menos uma página do Facebook." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    /* Step 4: For each page, get long-lived page token + check Instagram Business Account */
    const enrichedPages = await Promise.all(pages.map(async (page) => {
      try {
        /* Get long-lived page token */
        const pageTokenUrl = `https://graph.facebook.com/v21.0/${page.id}?fields=access_token&access_token=${userToken}`;
        const ptRes = await fetch(pageTokenUrl);
        const ptData = await ptRes.json();
        const pageToken = ptData.access_token || page.access_token;

        /* Check for linked Instagram Business Account */
        let igUserId = null;
        let igUsername = null;
        try {
          const igUrl = `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username,profile_picture_url,followers_count}&access_token=${pageToken}`;
          const igRes = await fetch(igUrl);
          const igData = await igRes.json();
          console.log(`IG check for page ${page.id}:`, JSON.stringify(igData));
          if (igData.instagram_business_account) {
            igUserId = igData.instagram_business_account.id;
            igUsername = igData.instagram_business_account.username || null;
          }
        } catch (igErr) {
          console.log(`IG check failed for page ${page.id}:`, igErr.message);
        }

        return {
          page_id: page.id,
          page_name: page.name,
          page_category: page.category || null,
          page_picture: page.picture?.data?.url || null,
          page_token: pageToken,
          ig_user_id: igUserId,
          ig_username: igUsername,
          has_instagram: !!igUserId,
        };
      } catch (err) {
        console.log(`Error enriching page ${page.id}:`, err.message);
        return {
          page_id: page.id,
          page_name: page.name,
          page_category: page.category || null,
          page_picture: page.picture?.data?.url || null,
          page_token: page.access_token,
          ig_user_id: null, ig_username: null, has_instagram: false,
        };
      }
    }));

    /* Return full list of pages for frontend to display picker */
    return new Response(JSON.stringify({
      pages: enrichedPages,
      total: enrichedPages.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });

  } catch (err) {
    console.error("meta-oauth-callback error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  }
});
