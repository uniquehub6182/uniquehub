import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { client_id, post_id, platform } = await req.json();
    if (!client_id || !post_id) {
      return new Response(JSON.stringify({ error: "client_id and post_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get token for this client
    const { data: tokenRow } = await supabase
      .from("social_tokens")
      .select("*")
      .eq("client_id", client_id)
      .maybeSingle();

    if (!tokenRow) {
      return new Response(JSON.stringify({ error: "No social token found for client" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const accessToken = tokenRow.page_access_token || tokenRow.access_token;
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "No access token available" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Delete the post via Meta Graph API
    const deleteUrl = `https://graph.facebook.com/v21.0/${post_id}?access_token=${accessToken}`;
    const deleteRes = await fetch(deleteUrl, { method: "DELETE" });
    const deleteData = await deleteRes.json();

    if (deleteData.success === true || deleteData === true) {
      return new Response(JSON.stringify({ success: true, post_id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } else {
      return new Response(JSON.stringify({ error: deleteData.error?.message || "Failed to delete post", details: deleteData }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
