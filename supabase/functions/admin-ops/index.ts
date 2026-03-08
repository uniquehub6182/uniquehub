import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action } = await req.json();
    if (action === "clear_checkins") {
      const { count: before } = await sb.from("checkins").select("*", { count: "exact", head: true });
      const { error } = await sb.from("checkins").delete().gte("check_in_at", "2000-01-01");
      if (error) return new Response(JSON.stringify({ error: error.message }), { headers: corsHeaders });
      const { count: after } = await sb.from("checkins").select("*", { count: "exact", head: true });
      return new Response(JSON.stringify({ success: true, deleted: before, remaining: after }), { headers: corsHeaders });
    }
    return new Response(JSON.stringify({ error: "Unknown action" }), { headers: corsHeaders });
  } catch (e) { return new Response(JSON.stringify({ error: e.message }), { headers: corsHeaders }); }
});
