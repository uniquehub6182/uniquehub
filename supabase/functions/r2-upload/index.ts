import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, PutObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.370.0";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.370.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
    const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
    const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
    const R2_BUCKET = Deno.env.get("R2_BUCKET") || "uniquehub-files";
    const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";

    const s3 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });

    const body = await req.json();
    const fileName = body.fileName || `file-${Date.now()}`;
    const contentType = body.contentType || "application/octet-stream";
    const key = `uploads/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    /* Generate presigned URL — client uploads directly to R2 */
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    const publicUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL}/${key}`
      : `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;

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
