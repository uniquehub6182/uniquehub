import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const ASAAS_KEY = Deno.env.get("ASAAS_API_KEY");
    if (!ASAAS_KEY) return new Response(JSON.stringify({ error: "ASAAS_API_KEY not configured" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

    const ASAAS_ENV = Deno.env.get("ASAAS_ENV") || "sandbox";
    const BASE = ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://sandbox.asaas.com/api/v3";

    const body = await req.json();
    const { action, data } = body;

    let url = "";
    let method = "GET";
    let payload: any = undefined;

    /* ── ACTIONS ── */
    switch (action) {
      /* Create or find customer */
      case "create_customer": {
        method = "POST"; url = `${BASE}/customers`;
        payload = { name: data.name, cpfCnpj: data.cpfCnpj, email: data.email, phone: data.phone, mobilePhone: data.mobilePhone };
        break;
      }
      case "find_customer": {
        url = `${BASE}/customers?email=${encodeURIComponent(data.email)}`;
        break;
      }
      /* List payments for a customer */
      case "list_payments": {
        const params = new URLSearchParams();
        if (data.customer) params.set("customer", data.customer);
        if (data.status) params.set("status", data.status);
        params.set("limit", data.limit || "20");
        params.set("offset", data.offset || "0");
        url = `${BASE}/payments?${params.toString()}`;
        break;
      }
      /* Create a single payment */
      case "create_payment": {
        method = "POST"; url = `${BASE}/payments`;
        payload = { customer: data.customer, billingType: data.billingType || "UNDEFINED", value: data.value, dueDate: data.dueDate, description: data.description, externalReference: data.externalReference };
        break;
      }
      /* Get Pix QR code for a payment */
      case "pix_qrcode": {
        url = `${BASE}/payments/${data.paymentId}/pixQrCode`;
        break;
      }
      /* Get boleto identification field (barcode line) */
      case "boleto_barcode": {
        url = `${BASE}/payments/${data.paymentId}/identificationField`;
        break;
      }
      /* Get payment invoice URL */
      case "get_payment": {
        url = `${BASE}/payments/${data.paymentId}`;
        break;
      }
      /* Create subscription (recurring) */
      case "create_subscription": {
        method = "POST"; url = `${BASE}/subscriptions`;
        payload = {
          customer: data.customer, billingType: data.billingType || "UNDEFINED",
          value: data.value, nextDueDate: data.nextDueDate,
          cycle: data.cycle || "MONTHLY", description: data.description,
          externalReference: data.externalReference,
        };
        break;
      }
      /* List subscriptions */
      case "list_subscriptions": {
        url = `${BASE}/subscriptions?customer=${data.customer}`;
        break;
      }
      /* Tokenize credit card */
      case "tokenize_card": {
        method = "POST"; url = `${BASE}/creditCard/tokenize`;
        payload = {
          customer: data.customer,
          creditCard: data.creditCard,
          creditCardHolderInfo: data.creditCardHolderInfo,
          remoteIp: data.remoteIp || "0.0.0.0",
        };
        break;
      }
      /* Pay with tokenized card */
      case "pay_with_card": {
        method = "POST"; url = `${BASE}/payments`;
        payload = {
          customer: data.customer, billingType: "CREDIT_CARD",
          value: data.value, dueDate: data.dueDate,
          creditCardToken: data.creditCardToken,
          description: data.description,
          remoteIp: data.remoteIp || "0.0.0.0",
        };
        break;
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    /* ── Make request to Asaas ── */
    const fetchOpts: any = {
      method,
      headers: { "Content-Type": "application/json", "access_token": ASAAS_KEY, "User-Agent": "UniqueHub/1.0" },
    };
    if (payload && method !== "GET") fetchOpts.body = JSON.stringify(payload);

    console.log(`[Asaas] ${method} ${url}`);
    const resp = await fetch(url, fetchOpts);
    const result = await resp.json();

    if (!resp.ok) {
      console.error("[Asaas] Error:", JSON.stringify(result));
      return new Response(JSON.stringify({ error: result.errors?.[0]?.description || "Asaas API error", details: result }), { status: resp.status, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(result), { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("[Asaas] Exception:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
