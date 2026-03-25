import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacSHA256(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  let kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  let kRegion = await hmacSHA256(kDate, region);
  let kService = await hmacSHA256(kRegion, service);
  return await hmacSHA256(kService, "aws4_request");
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function generatePresignedPutUrl(endpoint: string, bucket: string, key: string, accessKeyId: string, secretKey: string, contentType: string, expiresIn = 3600): Promise<string> {
  const url = new URL(`${endpoint}/${bucket}/${key}`);
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const shortDate = dateStamp.substring(0, 8);
  const region = "auto";
  const credentialScope = `${shortDate}/${region}/s3/aws4_request`;
  
  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", `${accessKeyId}/${credentialScope}`);
  url.searchParams.set("X-Amz-Date", dateStamp);
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  url.searchParams.set("X-Amz-SignedHeaders", "content-type;host");
  
  const canonicalHeaders = `content-type:${contentType}\nhost:${url.host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = `PUT\n/${bucket}/${key}\n${url.searchParams.toString()}\n${canonicalHeaders}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;

  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalRequest));
  const canonicalRequestHash = toHex(hashBuffer);
  
  const stringToSign = `AWS4-HMAC-SHA256\n${dateStamp}\n${credentialScope}\n${canonicalRequestHash}`;
  const signingKey = await getSignatureKey(secretKey, shortDate, region, "s3");
  const signatureBuffer = await hmacSHA256(signingKey, stringToSign);
  const signature = toHex(signatureBuffer);
  
  url.searchParams.set("X-Amz-Signature", signature);
  return url.toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
    const R2_BUCKET = Deno.env.get("R2_BUCKET") || "uniquehub-files";
    const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

    const body = await req.json();
    const fileName = body.fileName || `file-${Date.now()}`;
    const contentType = body.contentType || "application/octet-stream";
    const key = `uploads/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const signedUrl = await generatePresignedPutUrl(R2_ENDPOINT, R2_BUCKET, key, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, contentType);
    const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

    return new Response(JSON.stringify({ signedUrl, publicUrl, key }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("R2 presign error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
