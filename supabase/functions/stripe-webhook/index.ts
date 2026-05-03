/**
 * stripe-webhook
 * --------------------------------------------------------------
 * Recebe eventos do Stripe e sincroniza com banco:
 *  - subscriptions: estado, periodos, trial
 *  - organizations.suspended: bloqueia se past_due ou canceled
 *  - notifications: avisa admin antes de trial acabar e em payment_failed
 *
 * Eventos tratados:
 *  - checkout.session.completed         (sub criada via checkout)
 *  - customer.subscription.created
 *  - customer.subscription.updated
 *  - customer.subscription.deleted
 *  - customer.subscription.trial_will_end (3 dias antes do fim do trial)
 *  - invoice.payment_succeeded
 *  - invoice.payment_failed
 *
 * Idempotente via tabela stripe_events.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "stripe-signature, content-type",
};

/* Verificação de assinatura HMAC-SHA256 do webhook (manual, sem SDK) */
async function verifyStripeSignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = signature.split(",").reduce((acc: any, p) => {
      const [k, v] = p.split("=");
      acc[k] = v; return acc;
    }, {});
    const timestamp = parts["t"];
    const sig = parts["v1"];
    if (!timestamp || !sig) return false;
    const payload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const computed = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    /* Constant-time compare */
    if (computed.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ sig.charCodeAt(i);
    /* Verifica timestamp recente (max 5min) */
    const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (ageSec > 300) { console.warn("[webhook] signature too old"); return false; }
    return diff === 0;
  } catch (e) { console.error("[webhook] verify error:", e); return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const WHSEC = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!WHSEC) return new Response("STRIPE_WEBHOOK_SECRET não configurada", { status: 500 });

    const sig = req.headers.get("stripe-signature");
    if (!sig) return new Response("Missing stripe-signature", { status: 400 });

    const rawBody = await req.text();
    const ok = await verifyStripeSignature(rawBody, sig, WHSEC);
    if (!ok) {
      console.warn("[webhook] invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /* Idempotencia: evento ja processado? */
    const { data: existing } = await sb
      .from("stripe_events").select("id").eq("id", event.id).maybeSingle();
    if (existing) {
      console.log("[webhook] já processado:", event.id);
      return new Response(JSON.stringify({ received: true, duplicated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[webhook] processing", event.type, event.id);

    /* ===== HANDLERS POR EVENTO ===== */
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(sb, event.data.object);
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
          await handleSubscriptionUpsert(sb, event.data.object);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(sb, event.data.object);
          break;
        case "customer.subscription.trial_will_end":
          await handleTrialWillEnd(sb, event.data.object);
          break;
        case "invoice.payment_succeeded":
          await handleInvoicePaid(sb, event.data.object);
          break;
        case "invoice.payment_failed":
          await handleInvoiceFailed(sb, event.data.object);
          break;
        default:
          console.log("[webhook] evento ignorado:", event.type);
      }
    } catch (handlerErr) {
      console.error("[webhook] handler error:", handlerErr);
      /* Não rethrow — retorna 200 pra Stripe parar de retentar, mas registra o erro */
    }

    /* Marca evento como processado */
    await sb.from("stripe_events").insert({
      id: event.id, type: event.type, payload: event,
    }).select().maybeSingle();

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[webhook] exception:", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ===== HANDLERS ===== */

async function findOrgIdForCustomer(sb: any, customerId: string, fallbackMetaOrg?: string): Promise<string | null> {
  if (fallbackMetaOrg) return fallbackMetaOrg;
  const { data } = await sb.from("organizations").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id || null;
}

async function handleCheckoutCompleted(sb: any, session: any) {
  const customerId = session.customer;
  const subId = session.subscription;
  const orgId = session.metadata?.org_id || session.subscription_data?.metadata?.org_id;
  if (!orgId) { console.warn("[checkout] sem org_id no metadata"); return; }
  /* Garante stripe_customer_id na org */
  await sb.from("organizations").update({ stripe_customer_id: customerId }).eq("id", orgId);
  console.log(`[checkout] org ${orgId} -> sub ${subId}`);
}

async function handleSubscriptionUpsert(sb: any, sub: any) {
  const orgId = sub.metadata?.org_id || await findOrgIdForCustomer(sb, sub.customer);
  if (!orgId) { console.warn("[sub upsert] sem org_id pra customer", sub.customer); return; }

  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id;

  const subRow = {
    org_id: orgId,
    provider: "stripe",
    provider_sub_id: sub.id,
    status: sub.status, /* trialing, active, past_due, unpaid, canceled, incomplete, incomplete_expired, paused */
    plan: sub.metadata?.plan || "escala",
    price_id: priceId,
    current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
    metadata: sub.metadata || {},
  };

  /* Upsert pelo provider_sub_id */
  const { data: existing } = await sb.from("subscriptions").select("id").eq("provider_sub_id", sub.id).maybeSingle();
  if (existing) {
    await sb.from("subscriptions").update(subRow).eq("id", existing.id);
  } else {
    await sb.from("subscriptions").insert(subRow);
  }

  /* Reflete suspended no nivel da org */
  const shouldSuspend = ["past_due","unpaid","canceled","incomplete_expired"].includes(sub.status);
  const orgUpdate: any = {
    plan: subRow.plan,
    suspended: shouldSuspend,
    suspended_reason: shouldSuspend ? `subscription_${sub.status}` : null,
    suspended_at: shouldSuspend ? new Date().toISOString() : null,
  };
  /* Se ativo, estende trial_ends_at pra current_period_end (defesa em profundidade) */
  if (sub.status === "active" || sub.status === "trialing") {
    orgUpdate.trial_ends_at = subRow.current_period_end;
  }
  await sb.from("organizations").update(orgUpdate).eq("id", orgId);

  console.log(`[sub upsert] org ${orgId} status=${sub.status} suspended=${shouldSuspend}`);
}

async function handleSubscriptionDeleted(sb: any, sub: any) {
  const orgId = sub.metadata?.org_id || await findOrgIdForCustomer(sb, sub.customer);
  if (!orgId) return;
  await sb.from("subscriptions").update({
    status: "canceled",
    canceled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("provider_sub_id", sub.id);
  await sb.from("organizations").update({
    suspended: true,
    suspended_reason: "subscription_canceled",
    suspended_at: new Date().toISOString(),
  }).eq("id", orgId);
  console.log(`[sub deleted] org ${orgId} suspended`);
}

async function handleTrialWillEnd(sb: any, sub: any) {
  const orgId = sub.metadata?.org_id || await findOrgIdForCustomer(sb, sub.customer);
  if (!orgId) return;
  /* Notifica owner da org */
  const { data: org } = await sb.from("organizations").select("owner_id, name").eq("id", orgId).single();
  if (!org?.owner_id) return;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toLocaleDateString("pt-BR") : "em breve";
  await sb.from("notifications").insert({
    user_id: org.owner_id,
    type: "trial_ending",
    title: "⏰ Seu trial termina em 3 dias",
    body: `O trial da ${org.name} termina em ${trialEnd}. Adicione um cartão pra continuar.`,
    org_id: orgId,
    read: false,
  });
  console.log(`[trial ending] org ${orgId} notif enviada`);
}

async function handleInvoicePaid(sb: any, invoice: any) {
  const orgId = invoice.subscription_details?.metadata?.org_id
    || await findOrgIdForCustomer(sb, invoice.customer);
  if (!orgId) return;
  /* Insere invoice no banco (best-effort) */
  await sb.from("invoices").insert({
    client_id: orgId,
    number: invoice.number,
    description: `Stripe ${invoice.id}`,
    amount: (invoice.amount_paid || 0) / 100,
    status: "paid",
    paid_at: new Date(invoice.status_transitions?.paid_at * 1000 || Date.now()).toISOString(),
    paid_amount: (invoice.amount_paid || 0) / 100,
    payment_method: invoice.collection_method || "stripe",
    notes: `Stripe invoice_id=${invoice.id}`,
  }).select().maybeSingle();
  /* Garante que org não esteja suspended */
  await sb.from("organizations").update({
    suspended: false, suspended_reason: null, suspended_at: null,
  }).eq("id", orgId);
  console.log(`[invoice paid] org ${orgId} amount=${invoice.amount_paid/100}`);
}

async function handleInvoiceFailed(sb: any, invoice: any) {
  const orgId = invoice.subscription_details?.metadata?.org_id
    || await findOrgIdForCustomer(sb, invoice.customer);
  if (!orgId) return;
  const { data: org } = await sb.from("organizations").select("owner_id, name").eq("id", orgId).single();
  if (org?.owner_id) {
    await sb.from("notifications").insert({
      user_id: org.owner_id,
      type: "payment_failed",
      title: "❌ Pagamento falhou",
      body: `Não conseguimos cobrar o cartão da ${org.name}. Atualize os dados pra evitar suspensão.`,
      org_id: orgId,
      read: false,
    });
  }
  console.log(`[invoice failed] org ${orgId}`);
}
