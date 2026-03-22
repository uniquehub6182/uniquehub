import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const H = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (d: unknown, s=200) => new Response(JSON.stringify(d), { headers:{...H,"Content-Type":"application/json"}, status:s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const { action, client_id, conversation_id, message, platform } = await req.json();
    if (!client_id) throw new Error("Missing client_id");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const V = "v21.0";

    /* Load tokens */
    let metaToken: any = null;
    try { const { data } = await sb.from("app_settings").select("value").eq("key", `meta_token_${client_id}`).single(); if (data?.value) metaToken = JSON.parse(data.value); } catch {}
    let igToken: any = null;
    try { const { data } = await sb.from("app_settings").select("value").eq("key", `ig_token_${client_id}`).single(); if (data?.value) igToken = JSON.parse(data.value); } catch {}
    if (!metaToken && !igToken) return json({ error: "Nenhum token social encontrado" });

    const safeFetch = async (url: string, opts?: any) => {
      try {
        const r = await fetch(url, opts);
        const d = await r.json();
        if (d.error) { console.log("API err:", d.error.message?.substring(0,100)); return { error: d.error.message }; }
        return d;
      } catch (e: any) { return { error: e.message }; }
    };

    const at = metaToken?.page_token || "";
    const pid = metaToken?.page_id || "";
    const igId = metaToken?.ig_user_id || igToken?.ig_user_id || "";

    /* ═══ LIST CONVERSATIONS ═══ */
    if (action === "list" || !action) {
      const conversations: any[] = [];

      /* Facebook Messenger */
      if (at && pid) {
        const fb = await safeFetch(`https://graph.facebook.com/${V}/${pid}/conversations?fields=id,updated_time,participants,message_count,snippet&limit=20&access_token=${at}`);
        if (fb?.data) {
          for (const c of fb.data) {
            const other = c.participants?.data?.find((p: any) => p.id !== pid) || c.participants?.data?.[0] || {};
            conversations.push({
              id: c.id, platform: "facebook", updated_time: c.updated_time,
              participant_name: other.name || "Desconhecido", participant_id: other.id,
              message_count: c.message_count || 0, snippet: c.snippet || "",
            });
          }
        }
      }

      /* Instagram DMs */
      if (at && igId) {
        const ig = await safeFetch(`https://graph.facebook.com/${V}/${igId}/conversations?fields=id,updated_time,participants,message_count&platform=instagram&limit=20&access_token=${at}`);
        if (ig?.data) {
          for (const c of ig.data) {
            const other = c.participants?.data?.find((p: any) => p.id !== igId) || c.participants?.data?.[0] || {};
            conversations.push({
              id: c.id, platform: "instagram", updated_time: c.updated_time,
              participant_name: other.name || other.username || "Desconhecido",
              participant_username: other.username || "", participant_id: other.id,
              message_count: c.message_count || 0, snippet: "",
            });
          }
        }
      }

      /* Sort by most recent */
      conversations.sort((a, b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime());
      return json({ conversations, total: conversations.length });
    }

    /* ═══ GET MESSAGES from a conversation ═══ */
    if (action === "messages" && conversation_id) {
      const msgs = await safeFetch(`https://graph.facebook.com/${V}/${conversation_id}/messages?fields=id,message,created_time,from,to,attachments{mime_type,name,size,image_data,video_data}&limit=50&access_token=${at}`);
      if (msgs?.error) return json({ error: msgs.error });
      const messages = (msgs?.data || []).map((m: any) => ({
        id: m.id, text: m.message || "", created_time: m.created_time,
        from_name: m.from?.name || m.from?.username || "?", from_id: m.from?.id || "",
        is_page: m.from?.id === pid || m.from?.id === igId,
        attachments: (m.attachments?.data || []).map((a: any) => ({
          type: a.mime_type, name: a.name, url: a.image_data?.url || a.video_data?.url || "",
        })),
      })).reverse(); /* chronological order */
      return json({ messages, conversation_id });
    }

    /* ═══ SEND MESSAGE ═══ */
    if (action === "send" && conversation_id && message) {
      /* Get the recipient from the conversation */
      const convDetail = await safeFetch(`https://graph.facebook.com/${V}/${conversation_id}?fields=participants&access_token=${at}`);
      if (convDetail?.error) return json({ error: convDetail.error });
      const recipient = convDetail?.participants?.data?.find((p: any) => p.id !== pid && p.id !== igId);
      if (!recipient) return json({ error: "Destinatário não encontrado" });

      /* Determine if this is an IG or FB conversation */
      const isIG = platform === "instagram";
      const sendUrl = isIG
        ? `https://graph.facebook.com/${V}/${igId}/messages`
        : `https://graph.facebook.com/${V}/${pid}/messages`;

      const body = isIG
        ? { recipient: { id: recipient.id }, message: { text: message } }
        : { recipient: { id: recipient.id }, message: { text: message }, messaging_type: "RESPONSE" };

      const result = await safeFetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, access_token: at }),
      });

      if (result?.error) return json({ error: result.error });
      return json({ success: true, message_id: result?.message_id || result?.id });
    }

    return json({ error: "Ação inválida. Use: list, messages, send" });
  } catch (err: any) { console.error("social-inbox:", err); return json({ error: err.message }, 200); }
});
