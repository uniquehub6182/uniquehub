import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
};
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: sp } = await sb.from("scheduled_posts")
    .select("*").eq("id","80537a3e-fe60-40f4-a1e3-2d3247852864").single();
  return new Response(JSON.stringify({ now: new Date().toISOString(), sp }, null, 2),
    { headers: { ...H, "Content-Type":"application/json" } });
});
