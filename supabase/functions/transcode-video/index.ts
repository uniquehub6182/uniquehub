/**
 * transcode-video
 * --------------------------------------------------------------
 * Recebe URL de vídeo (HEVC/H.265 ou outros codecs incompatíveis com
 * a Meta API) e devolve URL R2 do vídeo convertido pra H.264 8-bit yuv420p.
 *
 * Pipeline:
 *  1. Cria job no CloudConvert (import URL → convert mp4/H.264 → export URL)
 *  2. Polling até job=finished
 *  3. Chama r2-upload (mode proxy) com a URL exportada → retorna URL R2 final
 *
 * Body: { sourceUrl: string, fileName?: string }
 * Resp: { publicUrl, key, originalSize?, transcodedSize? } | { error }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CC_API = "https://api.cloudconvert.com/v2";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const CC_KEY = Deno.env.get("CLOUDCONVERT_API_KEY");
    if (!CC_KEY) {
      return json({ error: "CLOUDCONVERT_API_KEY não configurada nas secrets" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const sourceUrl: string = body?.sourceUrl;
    const fileName: string = body?.fileName || "video.mp4";
    if (!sourceUrl) return json({ error: "sourceUrl é obrigatório" }, 400);

    console.log("[transcode] starting:", sourceUrl, "fileName:", fileName);

    // === 1. Criar job no CloudConvert ===
    // import-source: importa URL
    // convert-h264:  H.264 baseline yuv420p, AAC, profile main, faststart (moov no início p/ streaming)
    // export-url:    exporta URL temporária do resultado
    const jobReq = await fetch(`${CC_API}/jobs`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CC_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tasks: {
          "import-source": {
            operation: "import/url",
            url: sourceUrl,
            filename: fileName,
          },
          "convert-h264": {
            operation: "convert",
            input: "import-source",
            output_format: "mp4",
            video_codec: "x264",
            crf: 23,
            preset: "medium",
            profile: "main",
            level: "4.0",
            pixel_format: "yuv420p",
            audio_codec: "aac",
            audio_bitrate: 128,
            // Otimizações de compatibilidade Instagram/Meta:
            // - moov atom no início (faststart) → permite streaming progressivo
            // - tonemap se vier HDR
            engine: "ffmpeg",
            engine_version: "7.1",
            options: {
              movflags: "+faststart",
              "strict": "-2",
            },
          },
          "export-url": {
            operation: "export/url",
            input: "convert-h264",
            inline: false,
            archive_multiple_files: false,
          },
        },
      }),
    });

    const jobBody = await jobReq.json();
    if (!jobReq.ok || !jobBody?.data?.id) {
      console.error("[transcode] job creation failed:", JSON.stringify(jobBody).slice(0, 500));
      return json({ error: "CloudConvert job falhou ao criar", details: jobBody }, 502);
    }
    const jobId = jobBody.data.id;
    console.log("[transcode] job created:", jobId);

    // === 2. Polling até job=finished (máx 5 min) ===
    let exportUrl: string | null = null;
    let lastStatus = "";
    const POLL_INTERVAL_MS = 4000;
    const MAX_WAIT_MS = 300_000; // 5 min
    while (Date.now() - startedAt < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const sRes = await fetch(`${CC_API}/jobs/${jobId}`, {
        headers: { "Authorization": `Bearer ${CC_KEY}` },
      });
      const sJson = await sRes.json();
      const status = sJson?.data?.status || "unknown";
      if (status !== lastStatus) {
        console.log(`[transcode] job ${jobId} status=${status} (${((Date.now()-startedAt)/1000).toFixed(0)}s)`);
        lastStatus = status;
      }
      if (status === "error") {
        const failed = sJson?.data?.tasks?.find((t: any) => t.status === "error");
        return json({
          error: "CloudConvert task falhou",
          task: failed?.name,
          message: failed?.message,
          code: failed?.code,
        }, 500);
      }
      if (status === "finished") {
        const exportTask = sJson?.data?.tasks?.find((t: any) => t.name === "export-url");
        const fileUrl = exportTask?.result?.files?.[0]?.url;
        if (fileUrl) { exportUrl = fileUrl; break; }
        return json({ error: "Job finalizado mas sem URL exportada", details: sJson }, 500);
      }
    }

    if (!exportUrl) return json({ error: "CloudConvert timeout (>5min)" }, 504);
    console.log("[transcode] export URL ready, calling r2-upload to persist...");

    // === 3. Chama r2-upload (mode proxy) pra mover do CloudConvert pro R2 ===
    const supaUrl = Deno.env.get("SUPABASE_URL") || `https://${Deno.env.get("PROJECT_REF") || "kyoenyglyayfxtihlewb"}.supabase.co`;
    const supaAnon = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("ANON_KEY") || "";

    const cleanName = fileName.replace(/\.(mov|mp4|webm|avi|mkv|m4v)$/i, "") + "_h264.mp4";
    const r2Resp = await fetch(`${supaUrl}/functions/v1/r2-upload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supaAnon}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fileName: cleanName,
        contentType: "video/mp4",
        sourceUrl: exportUrl,
      }),
    });
    const r2Body = await r2Resp.json();
    if (!r2Resp.ok || !r2Body?.publicUrl) {
      console.error("[transcode] r2-upload failed:", JSON.stringify(r2Body).slice(0, 300));
      return json({ error: "Falha ao salvar arquivo convertido no R2", details: r2Body }, 502);
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[transcode] DONE in ${elapsed}s →`, r2Body.publicUrl);
    return json({
      publicUrl: r2Body.publicUrl,
      key: r2Body.key,
      transcoded: true,
      elapsedSec: Number(elapsed),
    }, 200);

  } catch (e) {
    console.error("[transcode] exception:", e);
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
