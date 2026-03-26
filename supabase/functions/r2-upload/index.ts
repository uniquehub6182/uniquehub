import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacSHA256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}
async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  let k = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  k = await hmacSHA256(k, region); k = await hmacSHA256(k, service);
  return await hmacSHA256(k, "aws4_request");
}
function toHex(buf: ArrayBuffer) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join(""); }

async function generatePresignedPutUrl(endpoint: string, bucket: string, key: string, accessKeyId: string, secretKey: string, contentType: string, expiresIn = 3600) {
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

/* Proxy: download from cloud URL → upload to R2 (server-to-server, fast) */
async function proxyToR2(sourceUrl: string, key: string, endpoint: string, bucket: string, accessKeyId: string, secretKey: string, publicUrl: string) {
  console.log("Proxy: downloading from", sourceUrl);
  const resp = await fetch(sourceUrl, { redirect: "follow" });
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const blob = await resp.blob();
  const ct = blob.type || "video/mp4";
  console.log(`Proxy: downloaded ${(blob.size/1048576).toFixed(1)}MB, uploading to R2...`);
  const signedUrl = await generatePresignedPutUrl(endpoint, bucket, key, accessKeyId, secretKey, ct);
  const upResp = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": ct }, body: blob });
  if (!upResp.ok) throw new Error(`R2 upload failed: ${upResp.status}`);
  console.log("Proxy: R2 upload OK");
  return `${publicUrl}/${key}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const R2_AK = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const R2_SK = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const R2_EP = Deno.env.get("R2_ENDPOINT")!;
    const R2_BK = Deno.env.get("R2_BUCKET") || "uniquehub-files";
    const R2_PU = Deno.env.get("R2_PUBLIC_URL") || "";
    const body = await req.json();
    const { fileName, contentType, sourceUrl } = body;
    const safeName = (fileName || `file-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `uploads/${Date.now()}-${safeName}`;

    /* MODE 1: Proxy — download from cloud URL and upload to R2 */
    if (sourceUrl) {
      const r2Url = await proxyToR2(sourceUrl, key, R2_EP, R2_BK, R2_AK, R2_SK, R2_PU);
      return new Response(JSON.stringify({ publicUrl: r2Url, key, proxied: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* MODE 2: Presigned URL — browser uploads directly */
    const ct = contentType || "application/octet-stream";
    const signedUrl = await generatePresignedPutUrl(R2_EP, R2_BK, key, R2_AK, R2_SK, ct);
    const publicUrl = R2_PU ? `${R2_PU}/${key}` : `${R2_EP}/${R2_BK}/${key}`;
    return new Response(JSON.stringify({ signedUrl, publicUrl, key }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("R2 error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
