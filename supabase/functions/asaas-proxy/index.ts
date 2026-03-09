import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const H = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (d: unknown, s=200) => new Response(JSON.stringify(d), { headers:{...H,"Content-Type":"application/json"}, status:s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const { action, data } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: cfg } = await sb.from("app_settings").select("value").eq("key", "fin_config").single();
    if (!cfg?.value) throw new Error("Config não encontrada");
    const fc = JSON.parse(cfg.value);
    if (!fc.asaasApiKey) throw new Error("API Key do Asaas não configurada");
    const base = fc.asaasMode === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
    const hdrs = { "Content-Type": "application/json", "access_token": fc.asaasApiKey };
    const asaasFetch = async (path: string, method = "GET", body?: any) => {
      const opts: any = { method, headers: hdrs };
      if (body) opts.body = JSON.stringify(body);
      const r = await fetch(`${base}${path}`, opts);
      return r.json();
    };

    if (action === "create_customer") {
      /* Create customer in Asaas: { name, cpfCnpj, email, phone } */
      const r = await asaasFetch("/customers", "POST", data);
      return json(r);
    }
    if (action === "list_customers") {
      const r = await asaasFetch("/customers?limit=100");
      return json(r);
    }
    if (action === "create_payment") {
      /* Create charge: { customer (asaas_id), billingType (BOLETO|PIX|CREDIT_CARD|UNDEFINED), value, dueDate, description } */
      const r = await asaasFetch("/payments", "POST", data);
      return json(r);
    }
    if (action === "list_payments") {
      const q = data?.customer ? `?customer=${data.customer}&limit=100` : "?limit=100&offset=0";
      const r = await asaasFetch(`/payments${q}`);
      return json(r);
    }
    if (action === "get_payment") {
      const r = await asaasFetch(`/payments/${data.id}`);
      return json(r);
    }
    if (action === "get_pix_qrcode") {
      const r = await asaasFetch(`/payments/${data.id}/pixQrCode`);
      return json(r);
    }
    if (action === "get_boleto_url") {
      const r = await asaasFetch(`/payments/${data.id}/bankSlipUrl`);
      return json(r);
    }
    if (action === "create_subscription") {
      /* Recurring: { customer, billingType, value, cycle (MONTHLY/WEEKLY), nextDueDate, description } */
      const r = await asaasFetch("/subscriptions", "POST", data);
      return json(r);
    }
    if (action === "list_subscriptions") {
      const r = await asaasFetch("/subscriptions?limit=100");
      return json(r);
    }
    if (action === "delete_payment") {
      const r = await asaasFetch(`/payments/${data.id}`, "DELETE");
      return json(r);
    }
    if (action === "get_balance") {
      const r = await asaasFetch("/finance/balance");
      return json(r);
    }
    throw new Error(`Ação desconhecida: ${action}`);
  } catch (e: any) { console.error("asaas-proxy:", e.message); return json({ error: e.message }, 200); }
});
