import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (d: unknown, s=200) => new Response(JSON.stringify(d), { headers:{...H,"Content-Type":"application/json"}, status:s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });

  try {
    const { reply_id, reply_text } = await req.json();
    if (!reply_id || !reply_text) return json({ error: "Missing reply_id or reply_text" }, 400);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const V = "v21.0";

    /* Get the comment reply record */
    const { data: record } = await sb.from("comment_replies").select("*").eq("id", reply_id).single();
    if (!record) return json({ error: "Reply not found" }, 404);

    /* Get client's Meta token */
    const { data: tokenData } = await sb.from("app_settings").select("value").eq("key", `meta_token_${record.client_id}`).single();
    if (!tokenData?.value) return json({ error: "No Meta token for client" }, 400);

    const token = JSON.parse(tokenData.value);
    const at = token.page_token || "";
    if (!at) return json({ error: "No page_token" }, 400);

    /* Post reply to Instagram comment */
    const replyRes = await fetch(`https://graph.facebook.com/${V}/${record.comment_id}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: reply_text, access_token: at }),
    });
    const replyData = await replyRes.json();

    if (replyData.error) {
      /* Update status to failed */
      await sb.from("comment_replies").update({ status: "failed", approved_reply: reply_text }).eq("id", reply_id);
      return json({ error: replyData.error.message });
    }

    /* Update record as replied */
    await sb.from("comment_replies").update({
      status: "replied",
      approved_reply: reply_text,
      replied_at: new Date().toISOString(),
    }).eq("id", reply_id);

    return json({ success: true, ig_reply_id: replyData.id });
  } catch (err: any) {
    console.error("[comment-reply] Fatal:", err);
    return json({ error: err.message }, 200);
  }
});
