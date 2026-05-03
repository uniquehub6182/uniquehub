/**
 * stripe-checkout
 * --------------------------------------------------------------
 * Cria Stripe Customer (se nao existe) + Checkout Session com trial
 * de 15 dias. Retorna URL pra redirecionar o usuario.
 *
 * Body: { orgId: string, email: string, name?: string, returnUrl?: string }
 * Resp: { url: string, sessionId: string } | { error }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRIPE_API = "https://api.stripe.com/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SK = Deno.env.get("STRIPE_SECRET_KEY");
    const PRICE_ID = Deno.env.get("STRIPE_PRICE_ID_ESCALA");
    const APP_URL = Deno.env.get("APP_URL") || "https://uniquehub.pages.dev";
    if (!SK) return json({ error: "STRIPE_SECRET_KEY não configurada" }, 500);
    if (!PRICE_ID) return json({ error: "STRIPE_PRICE_ID_ESCALA não configurada" }, 500);

    const body = await req.json().catch(() => ({}));
    const { orgId, email, name, returnUrl } = body || {};
    if (!orgId || !email) return json({ error: "orgId e email são obrigatórios" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /* 1. Busca org e verifica se já existe customer */
    const { data: org, error: orgErr } = await sb
      .from("organizations").select("id, name, stripe_customer_id, trial_ends_at")
      .eq("id", orgId).single();
    if (orgErr || !org) return json({ error: "Org não encontrada" }, 404);

    let customerId = org.stripe_customer_id;

    /* 2. Cria customer Stripe se ainda não existe */
    if (!customerId) {
      const cuRes = await fetch(`${STRIPE_API}/customers`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email,
          name: name || org.name || "",
          "metadata[org_id]": orgId,
          "metadata[org_name]": org.name || "",
        }),
      });
      const cuJson = await cuRes.json();
      if (!cuRes.ok || !cuJson.id) {
        console.error("[stripe-checkout] customer create failed:", JSON.stringify(cuJson).slice(0,300));
        return json({ error: "Falha ao criar customer Stripe", details: cuJson?.error }, 502);
      }
      customerId = cuJson.id;
      await sb.from("organizations").update({ stripe_customer_id: customerId }).eq("id", orgId);
      console.log("[stripe-checkout] customer created:", customerId);
    }

    /* 3. Calcula trial: usa o que sobra do trial_ends_at da org, OU 15 dias do zero */
    let trialDays = 15;
    if (org.trial_ends_at) {
      const remaining = Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000);
      if (remaining > 0 && remaining < 15) trialDays = remaining; /* respeita o que ja passou */
      if (remaining <= 0) trialDays = 0; /* trial expirado: cobra direto */
    }

    /* 4. Cria Checkout Session subscription mode com trial */
    const successUrl = (returnUrl || APP_URL) + "?billing=success";
    const cancelUrl = (returnUrl || APP_URL) + "?billing=cancel";

    const params = new URLSearchParams();
    params.append("mode", "subscription");
    params.append("customer", customerId);
    params.append("line_items[0][price]", PRICE_ID);
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", successUrl);
    params.append("cancel_url", cancelUrl);
    params.append("payment_method_types[]", "card");
    params.append("locale", "pt-BR");
    params.append("subscription_data[metadata][org_id]", orgId);
    if (trialDays > 0) {
      params.append("subscription_data[trial_period_days]", String(trialDays));
      /* trial sem cartao requerido — pede cartao mas nao bloqueia se nao informado */
      params.append("payment_method_collection", "if_required");
    }
    params.append("allow_promotion_codes", "true");

    const csRes = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SK}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const csJson = await csRes.json();
    if (!csRes.ok || !csJson.url) {
      console.error("[stripe-checkout] session failed:", JSON.stringify(csJson).slice(0,400));
      return json({ error: "Falha ao criar Checkout Session", details: csJson?.error }, 502);
    }

    console.log("[stripe-checkout] session created:", csJson.id);
    return json({ url: csJson.url, sessionId: csJson.id, customerId, trialDays }, 200);
  } catch (e) {
    console.error("[stripe-checkout] exception:", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
