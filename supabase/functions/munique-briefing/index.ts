/**
 * munique-briefing - texto longo natural pra narracao (OpenAI TTS).
 * POST body: { prompt: string }
 * Resposta: { text: string } | { error: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d, s = 200) =>
  new Response(JSON.stringify(d), {
    headers: { ...CORS, "Content-Type": "application/json" },
    status: s,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return json({ error: "missing prompt" }, 400);
    if (prompt.length > 8000) return json({ error: "prompt too long" }, 400);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    let claudeKey = "";
    try {
      const { data } = await sb
        .from("app_settings")
        .select("value")
        .eq("key", "claude_key")
        .single();
      claudeKey = (data?.value || "").toString().trim();
    } catch { /* ignore */ }

    if (!claudeKey) return json({ error: "Claude API key nao configurada" }, 500);

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 800,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return json({
        error: data?.error?.message || "Claude " + resp.status,
        details: data,
      }, 502);
    }

    let text = "";
    if (Array.isArray(data?.content)) {
      for (const c of data.content) {
        if (c?.type === "text" && typeof c.text === "string") {
          text += c.text + " ";
        }
      }
    }
    text = text.trim();

    if (!text) return json({ error: "empty response", raw: data }, 502);
    return json({ text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
