import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ASAAS_URL = Deno.env.get("ASAAS_ENV") === "production"
  ? "https://api.asaas.com/v3"
  : "https://sandbox.asaas.com/api/v3";
const ASAAS_KEY = Deno.env.get("ASAAS_API_KEY")!;
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const asaas = async (path: string, method = "GET", body?: any) => {
  const res = await fetch(`${ASAAS_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", access_token: ASAAS_KEY },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const sb = createClient(SB_URL, SB_KEY);
    const { action, ...params } = await req.json();
    console.log("[Asaas]", action, JSON.stringify(params).substring(0, 200));

    // ── CREATE CUSTOMER ──
    if (action === "create_customer") {
      const { client_id, name, cpf_cnpj, email, phone } = params;
      // Check if already exists
      const { data: existing } = await sb.from("asaas_customers").select("*").eq("client_id", client_id).limit(1);
      if (existing?.[0]?.asaas_id) return new Response(JSON.stringify({ asaas_id: existing[0].asaas_id, existing: true }), { headers: { ...cors, "Content-Type": "application/json" } });

      const customer = await asaas("/customers", "POST", {
        name, cpfCnpj: cpf_cnpj?.replace(/\D/g, ""), email, phone: phone?.replace(/\D/g, ""),
        externalReference: client_id, notificationDisabled: false,
      });
      if (customer.id) {
        await sb.from("asaas_customers").upsert({ client_id, asaas_id: customer.id, name, cpf_cnpj, email, phone }, { onConflict: "client_id" });
      }
      return new Response(JSON.stringify(customer), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── CREATE CHARGE (one-time) ──
    if (action === "create_charge") {
      const { client_id, value, due_date, billing_type, description } = params;
      const { data: cust } = await sb.from("asaas_customers").select("asaas_id").eq("client_id", client_id).limit(1);
      if (!cust?.[0]?.asaas_id) return new Response(JSON.stringify({ error: "Cliente não cadastrado no Asaas" }), { headers: { ...cors, "Content-Type": "application/json" }, status: 400 });

      const charge = await asaas("/payments", "POST", {
        customer: cust[0].asaas_id, billingType: billing_type || "UNDEFINED",
        value, dueDate: due_date, description: description || "Serviço Unique Marketing",
        externalReference: client_id,
      });
      if (charge.id) {
        let pix = null;
        if (billing_type === "PIX" || billing_type === "UNDEFINED") {
          pix = await asaas(`/payments/${charge.id}/pixQrCode`);
        }
        await sb.from("invoices").insert({
          client_id, asaas_id: charge.id, asaas_customer_id: cust[0].asaas_id,
          description: description || "Serviço Unique Marketing", value, due_date,
          billing_type: charge.billingType, status: charge.status,
          pix_qr_code: pix?.encodedImage, pix_copy_paste: pix?.payload,
          boleto_url: charge.bankSlipUrl, invoice_url: charge.invoiceUrl,
        });
        return new Response(JSON.stringify({ ...charge, pix }), { headers: { ...cors, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify(charge), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── CREATE SUBSCRIPTION (recurring monthly) ──
    if (action === "create_subscription") {
      const { client_id, value, description, next_due_date, cycle } = params;
      const { data: cust } = await sb.from("asaas_customers").select("asaas_id").eq("client_id", client_id).limit(1);
      if (!cust?.[0]?.asaas_id) return new Response(JSON.stringify({ error: "Cliente não cadastrado no Asaas" }), { headers: { ...cors, "Content-Type": "application/json" }, status: 400 });

      const sub = await asaas("/subscriptions", "POST", {
        customer: cust[0].asaas_id, billingType: "UNDEFINED",
        value, nextDueDate: next_due_date, cycle: cycle || "MONTHLY",
        description: description || "Mensalidade Unique Marketing",
        externalReference: client_id,
      });
      if (sub.id) {
        await sb.from("invoices").insert({
          client_id, asaas_id: sub.id, asaas_customer_id: cust[0].asaas_id,
          description: description || "Mensalidade Unique Marketing", value,
          due_date: next_due_date, billing_type: "UNDEFINED", status: "ACTIVE",
          subscription_id: sub.id, recurring: true, cycle: cycle || "MONTHLY",
        });
      }
      return new Response(JSON.stringify(sub), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── LIST CHARGES ──
    if (action === "list_charges") {
      const { client_id } = params;
      const { data: cust } = await sb.from("asaas_customers").select("asaas_id").eq("client_id", client_id).limit(1);
      if (!cust?.[0]?.asaas_id) return new Response(JSON.stringify({ payments: [] }), { headers: { ...cors, "Content-Type": "application/json" } });
      const result = await asaas(`/payments?customer=${cust[0].asaas_id}&limit=50`);
      // Sync statuses to our DB
      if (result?.data) {
        for (const p of result.data) {
          await sb.from("invoices").update({ status: p.status, payment_date: p.paymentDate, boleto_url: p.bankSlipUrl, invoice_url: p.invoiceUrl, updated_at: new Date().toISOString() }).eq("asaas_id", p.id);
        }
      }
      return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── WEBHOOK (called by Asaas when payment status changes) ──
    if (action === "webhook") {
      const { event, payment } = params;
      console.log("[Asaas Webhook]", event, payment?.id, payment?.status);
      if (payment?.id) {
        await sb.from("invoices").update({
          status: payment.status,
          payment_date: payment.paymentDate,
          updated_at: new Date().toISOString(),
        }).eq("asaas_id", payment.id);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── DELETE CHARGE ──
    if (action === "delete_charge") {
      const { asaas_id } = params;
      const result = await asaas(`/payments/${asaas_id}`, "DELETE");
      await sb.from("invoices").delete().eq("asaas_id", asaas_id);
      return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── GET PIX QR CODE ──
    if (action === "get_pix") {
      const { asaas_id } = params;
      const pix = await asaas(`/payments/${asaas_id}/pixQrCode`);
      return new Response(JSON.stringify(pix), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação desconhecida: " + action }), { headers: { ...cors, "Content-Type": "application/json" }, status: 400 });
  } catch (err) {
    console.error("[Asaas Error]", err);
    return new Response(JSON.stringify({ error: err.message }), { headers: { ...cors, "Content-Type": "application/json" }, status: 500 });
  }
});
