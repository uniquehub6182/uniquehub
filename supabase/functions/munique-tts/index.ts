import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * munique-tts — converte texto em fala natural via OpenAI TTS (tts-1-hd).
 * POST body: { text: string, voice?: 'nova'|'shimmer'|'alloy'|'echo'|'fable'|'onyx', speed?: number }
 * Resposta: audio/mpeg (MP3 binario)
 */
serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").trim();
    const voice = String(body.voice || "nova");
    const speed = Math.max(0.25, Math.min(4.0, Number(body.speed) || 1.0));
    const model = String(body.model || "tts-1-hd");

    if (!text) {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const input = text.length > 4000 ? text.slice(0, 4000) : text;

    const apiKey = Deno.env.get("OPENAI_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const openaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        voice,
        input,
        speed,
        response_format: "mp3"
      })
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      return new Response(JSON.stringify({ error: `OpenAI TTS ${openaiRes.status}: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const audioBuffer = await openaiRes.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=600"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      }
    });
  }
});
