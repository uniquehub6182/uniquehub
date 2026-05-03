/**
 * transcode-video
 * --------------------------------------------------------------
 * Recebe URL de vídeo e devolve URL R2 do vídeo convertido pra
 * H.264 8-bit yuv420p (compatível com Instagram/Meta API).
 *
 * Pipeline:
 *  1. Cria job no CloudConvert (import URL → convert mp4/H.264 → export URL)
 *  2. Polling até job=finished
 *  3. Download do arquivo convertido + upload direto pro R2 via S3 presigned PUT
 *
 * Body: { sourceUrl: string, fileName?: string }
 * Resp: { publicUrl, key, transcoded, elapsedSec } | { error }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CC_API = "https://api.cloudconvert.com/v2";

/* ── Helpers AWS Sig V4 (idênticos ao r2-upload) ── */
async function hmacSHA256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}
async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  let k = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  k = await hmacSHA256(k, region); k = await hmacSHA256(k, service);
  return await hmacSHA256(k, "aws4_request");
}
function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function generatePresignedPutUrl(
  endpoint: string, bucket: string, key: string,
  accessKeyId: string, secretKey: string, contentType: string, expiresIn = 3600,
) {
  const url = new URL(`${endpoint}/${bucket}/${key}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const shortDate = amzDate.substring(0, 8);
  const region = "auto";
  const credentialScope = `${shortDate}/${region}/s3/aws4_request`;
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${accessKeyId}/${credentialScope}`);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  url.searchParams.set("X-Amz-SignedHeaders", "content-type;host");
  const canonicalHeaders = `content-type:${contentType}\nhost:${url.host}\n`;
  const signedHeaders = "content-type;host";
  const sortedParams = new URLSearchParams([...url.searchParams.entries()].sort());
  const canonicalRequest = `PUT\n/${bucket}/${key}\n${sortedParams.toString()}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest));
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${toHex(hashBuffer)}`;
  const signingKey = await getSignatureKey(secretKey, shortDate, region, "s3");
  const signature = toHex(await hmacSHA256(signingKey, stringToSign));
  url.searchParams.set("X-Amz-Signature", signature);
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const CC_KEY = Deno.env.get("CLOUDCONVERT_API_KEY");
    if (!CC_KEY) return json({ error: "CLOUDCONVERT_API_KEY não configurada nas secrets" }, 500);

    const R2_AK = Deno.env.get("R2_ACCESS_KEY_ID");
    const R2_SK = Deno.env.get("R2_SECRET_ACCESS_KEY");
    const R2_EP = Deno.env.get("R2_ENDPOINT");
    const R2_BK = Deno.env.get("R2_BUCKET") || "uniquehub-files";
    const R2_PU = Deno.env.get("R2_PUBLIC_URL") || "";
    if (!R2_AK || !R2_SK || !R2_EP) return json({ error: "R2 credentials não configuradas" }, 500);

    const body = await req.json().catch(() => ({}));
    const sourceUrl: string = body?.sourceUrl;
    const fileName: string = body?.fileName || "video.mp4";
    if (!sourceUrl) return json({ error: "sourceUrl é obrigatório" }, 400);

    console.log("[transcode] starting:", fileName);

    /* ============ 1. Criar job CloudConvert ============ */
    const jobReq = await fetch(`${CC_API}/jobs`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${CC_KEY}`, "Content-Type": "application/json" },
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
            engine: "ffmpeg",
            engine_version: "7.1",
            options: { movflags: "+faststart", strict: "-2" },
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

    /* ============ 2. Polling até finished ============ */
    let exportUrl: string | null = null;
    let lastStatus = "";
    const POLL_INTERVAL_MS = 4000;
    const MAX_WAIT_MS = 300_000;
    while (Date.now() - startedAt < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const sRes = await fetch(`${CC_API}/jobs/${jobId}`, {
        headers: { "Authorization": `Bearer ${CC_KEY}` },
      });
      const sJson = await sRes.json();
      const status = sJson?.data?.status || "unknown";
      if (status !== lastStatus) {
        console.log(`[transcode] status=${status} (${((Date.now() - startedAt) / 1000).toFixed(0)}s)`);
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
        return json({ error: "Job finished mas sem URL", details: sJson }, 500);
      }
    }
    if (!exportUrl) return json({ error: "CloudConvert timeout (>5min)" }, 504);
    console.log("[transcode] export ready, downloading converted file...");

    /* ============ 3. Download convertido + upload direto pro R2 ============ */
    const convResp = await fetch(exportUrl);
    if (!convResp.ok) {
      return json({ error: `Download convertido falhou: ${convResp.status}` }, 502);
    }
    const convBlob = await convResp.blob();
    console.log(`[transcode] downloaded ${(convBlob.size / 1048576).toFixed(1)}MB, uploading to R2...`);

    const cleanName = fileName.replace(/\.(mov|mp4|webm|avi|mkv|m4v)$/i, "") + "_h264.mp4";
    const safeName = cleanName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2Key = `uploads/${Date.now()}-${safeName}`;
    const ct = "video/mp4";

    const signedUrl = await generatePresignedPutUrl(R2_EP, R2_BK, r2Key, R2_AK, R2_SK, ct);
    const upResp = await fetch(signedUrl, {
      method: "PUT",
      headers: { "Content-Type": ct },
      body: convBlob,
    });
    if (!upResp.ok) {
      const text = await upResp.text().catch(() => "");
      console.error("[transcode] R2 PUT failed:", upResp.status, text.slice(0, 200));
      return json({ error: `R2 upload falhou: ${upResp.status}` }, 502);
    }

    const publicUrl = R2_PU ? `${R2_PU}/${r2Key}` : `${R2_EP}/${R2_BK}/${r2Key}`;
    const elapsed = Number(((Date.now() - startedAt) / 1000).toFixed(1));
    console.log(`[transcode] DONE in ${elapsed}s →`, publicUrl);

    return json({
      publicUrl,
      key: r2Key,
      transcoded: true,
      elapsedSec: elapsed,
      sizeMB: Number((convBlob.size / 1048576).toFixed(1)),
    }, 200);
  } catch (e) {
    console.error("[transcode] exception:", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
