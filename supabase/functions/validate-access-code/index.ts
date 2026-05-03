import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return new Response(JSON.stringify({ client: null, error: "missing_code" }), { headers: corsHeaders });
    }
    const normalized = code.trim().toUpperCase();
    const { data, error } = await sb
      .from("clients")
      .select("id,name,org_id,access_code")
      .eq("access_code", normalized)
      .limit(1);
    if (error) {
      return new Response(JSON.stringify({ client: null, error: error.message }), { headers: corsHeaders });
    }
    const client = data?.[0] || null;
    return new Response(
      JSON.stringify({ client: client ? { id: client.id, name: client.name, org_id: client.org_id } : null }),
      { headers: corsHeaders }
    );
  } catch (e) {
    return new Response(JSON.stringify({ client: null, error: (e as Error).message }), { headers: corsHeaders });
  }
});
