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
    if (!metaToken && !igToken) return json({ error: "Nenhum token social encontrado para este cliente" });

    const safeFetch = async (url: string, opts?: any) => {
      try {
        const r = await fetch(url, opts);
        const d = await r.json();
        if (d.error) { console.log("[social-inbox] API err:", JSON.stringify(d.error).substring(0,200)); return { error: d.error.message || JSON.stringify(d.error), data: null }; }
        return d;
      } catch (e: any) { console.log("[social-inbox] Fetch err:", e.message); return { error: e.message, data: null }; }
    };

    /* Helper: paginate through all results */
    const fetchAllPages = async (url: string, maxPages = 5) => {
      const allData: any[] = [];
      let nextUrl: string | null = url;
      let page = 0;
      while (nextUrl && page < maxPages) {
        const result = await safeFetch(nextUrl);
        if (result?.data) allData.push(...result.data);
        nextUrl = result?.paging?.next || null;
        page++;
      }
      return allData;
    };

    const at = metaToken?.page_token || igToken?.access_token || "";
    const pid = metaToken?.page_id || "";
    const igId = metaToken?.ig_user_id || igToken?.ig_user_id || "";

    console.log(`[social-inbox] action=${action} client=${client_id} pid=${pid} igId=${igId} hasToken=${!!at}`);

    /* ═══ LIST CONVERSATIONS ═══ */
    if (action === "list" || !action) {
      const conversations: any[] = [];
      const errors: string[] = [];

      /* Facebook Messenger — paginated */
      if (at && pid) {
        const fbUrl = `https://graph.facebook.com/${V}/${pid}/conversations?fields=id,updated_time,participants,message_count,snippet&limit=100&access_token=${at}`;
        const fbData = await fetchAllPages(fbUrl, 5);
        console.log(`[social-inbox] FB conversations: ${fbData.length}`);
        for (const c of fbData) {
          const other = c.participants?.data?.find((p: any) => p.id !== pid) || c.participants?.data?.[0] || {};
          conversations.push({
            id: c.id, platform: "facebook", updated_time: c.updated_time,
            participant_name: other.name || "Desconhecido", participant_id: other.id,
            message_count: c.message_count || 0, snippet: c.snippet || "",
          });
        }
      }

      /* Instagram DMs — paginated */
      if (at && igId) {
        const igUrl = `https://graph.facebook.com/${V}/${igId}/conversations?fields=id,updated_time,participants,message_count&platform=instagram&limit=100&access_token=${at}`;
        const igResult = await safeFetch(igUrl);
        console.log(`[social-inbox] IG conversations response:`, igResult?.data ? `${igResult.data.length} found` : `error: ${igResult?.error || 'no data'}`);
        if (igResult?.data) {
          for (const c of igResult.data) {
            const other = c.participants?.data?.find((p: any) => p.id !== igId) || c.participants?.data?.[0] || {};
            conversations.push({
              id: c.id, platform: "instagram", updated_time: c.updated_time,
              participant_name: other.name || other.username || "Desconhecido",
              participant_username: other.username || "", participant_id: other.id,
              message_count: c.message_count || 0, snippet: "",
            });
          }
          /* Paginate IG too */
          let nextIg = igResult?.paging?.next;
          let igPage = 1;
          while (nextIg && igPage < 5) {
            const more = await safeFetch(nextIg);
            if (more?.data) {
              for (const c of more.data) {
                const other = c.participants?.data?.find((p: any) => p.id !== igId) || c.participants?.data?.[0] || {};
                conversations.push({
                  id: c.id, platform: "instagram", updated_time: c.updated_time,
                  participant_name: other.name || other.username || "Desconhecido",
                  participant_username: other.username || "", participant_id: other.id,
                  message_count: c.message_count || 0, snippet: "",
                });
              }
              nextIg = more?.paging?.next;
            } else { nextIg = null; }
            igPage++;
          }
        } else if (igResult?.error) {
          errors.push(`Instagram: ${igResult.error}`);
        }
      } else if (!igId) {
        errors.push("Instagram: ig_user_id não encontrado nos tokens");
      }

      /* Sort by most recent */
      conversations.sort((a, b) => new Date(b.updated_time).getTime() - new Date(a.updated_time).getTime());
      return json({ conversations, total: conversations.length, errors: errors.length ? errors : undefined });
    }

    /* ═══ GET MESSAGES from a conversation ═══ */
    if (action === "messages" && conversation_id) {
      /* Fetch more messages with pagination */
      const msgsUrl = `https://graph.facebook.com/${V}/${conversation_id}/messages?fields=id,message,created_time,from,to,attachments{mime_type,name,size,image_data,video_data}&limit=100&access_token=${at}`;
      const allMsgs = await fetchAllPages(msgsUrl, 3);
      console.log(`[social-inbox] Messages loaded: ${allMsgs.length} for conv ${conversation_id}`);
      const messages = allMsgs.map((m: any) => ({
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
  } catch (err: any) { console.error("[social-inbox] Fatal:", err); return json({ error: err.message }, 200); }
});
