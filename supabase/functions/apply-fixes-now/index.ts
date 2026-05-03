import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d, null, 2), { headers: { ...H, "Content-Type": "application/json" }, status: s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const FORTE_DEMAND_IDS = [
    "518e564b-0607-4667-99c7-170039eb41b9", // +1 no Grand Park
    "d587fbce-eb71-4a64-9aa1-70545032feab"  // Casa Cantagalo
  ];

  const log: any[] = [];
  for (const did of FORTE_DEMAND_IDS) {
    const { data: before } = await sb.from("demands").select("id, title, stage").eq("id", did).single();
    log.push(`Antes: ${before?.title?.trim()} → stage=${before?.stage}`);

    const { error } = await sb.from("demands")
      .update({ stage: "design", updated_at: new Date().toISOString() })
      .eq("id", did);

    if (error) log.push(`  ERRO: ${error.message}`);
    else {
      const { data: after } = await sb.from("demands").select("stage").eq("id", did).single();
      log.push(`  OK movido para 'design' → stage agora = ${after?.stage}`);
    }
  }

  return json({ success: true, log });
});
