/**
 * stripe-portal
 * --------------------------------------------------------------
 * Cria Customer Portal Session — cliente gerencia assinatura,
 * cartao, invoices, cancela, etc. Tudo Stripe-hosted.
 *
 * Body: { orgId: string, returnUrl?: string }
 * Resp: { url: string } | { error }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SK = Deno.env.get("STRIPE_SECRET_KEY");
    const APP_URL = Deno.env.get("APP_URL") || "https://uniquehub.pages.dev";
    if (!SK) return json({ error: "STRIPE_SECRET_KEY não configurada" }, 500);

    const body = await req.json().catch(() => ({}));
    const { orgId, returnUrl } = body || {};
    if (!orgId) return json({ error: "orgId é obrigatório" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: org, error } = await sb
      .from("organizations").select("stripe_customer_id, name")
      .eq("id", orgId).single();
    if (error || !org?.stripe_customer_id) {
      return json({ error: "Org sem stripe_customer_id — abra checkout primeiro" }, 400);
    }

    const params = new URLSearchParams();
    params.append("customer", org.stripe_customer_id);
    params.append("return_url", returnUrl || APP_URL);

    const res = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const psJson = await res.json();
    if (!res.ok || !psJson.url) {
      console.error("[stripe-portal] failed:", JSON.stringify(psJson).slice(0,300));
      return json({ error: "Falha ao criar Portal Session", details: psJson?.error }, 502);
    }
    return json({ url: psJson.url }, 200);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
