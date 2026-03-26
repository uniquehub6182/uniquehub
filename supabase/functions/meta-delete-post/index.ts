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
    const { client_id, post_id } = await req.json();
    if (!client_id || !post_id) return json({ error: "client_id and post_id required" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    /* Try Facebook token first (app_settings → meta_token_{client_id}) */
    let accessToken: string | null = null;
    const { data: fbSetting } = await sb.from("app_settings").select("value").eq("key", `meta_token_${client_id}`).single();
    if (fbSetting?.value) {
      try {
        const tk = JSON.parse(fbSetting.value);
        accessToken = tk.page_token || tk.access_token;
      } catch {}
    }

    /* Fallback: try Instagram token */
    if (!accessToken) {
      const { data: igSetting } = await sb.from("app_settings").select("value").eq("key", `ig_token_${client_id}`).single();
      if (igSetting?.value) {
        try {
          const tk = JSON.parse(igSetting.value);
          accessToken = tk.access_token;
        } catch {}
      }
    }

    /* Last fallback: social_tokens table */
    if (!accessToken) {
      const { data: tokenRow } = await sb.from("social_tokens").select("*").eq("client_id", client_id).maybeSingle();
      accessToken = tokenRow?.page_access_token || tokenRow?.access_token || null;
    }

    if (!accessToken) return json({ error: "Nenhum token encontrado para este cliente. Reconecte as redes sociais." }, 400);

    console.log(`[Delete] Attempting to delete post ${post_id} for client ${client_id}`);

    /* Delete via Meta Graph API */
    const deleteUrl = `https://graph.facebook.com/v21.0/${post_id}?access_token=${accessToken}`;
    const deleteRes = await fetch(deleteUrl, { method: "DELETE" });
    const deleteData = await deleteRes.json();

    console.log(`[Delete] Response:`, JSON.stringify(deleteData).substring(0, 300));

    if (deleteData.success === true || deleteData === true) {
      return json({ success: true, post_id });
    }

    /* If permission error, provide helpful message */
    const errMsg = deleteData.error?.message || "Falha ao excluir";
    const errCode = deleteData.error?.code;
    if (errCode === 10 || errMsg.includes("permission")) {
      return json({ 
        error: "Permissão insuficiente. O token do Facebook não tem a permissão 'pages_manage_posts'. Reconecte o Facebook com as permissões necessárias.",
        details: deleteData 
      }, 400);
    }

    return json({ error: errMsg, details: deleteData }, 400);
  } catch (e: any) {
    console.error("[Delete] Error:", e.message);
    return json({ error: e.message }, 500);
  }
});
