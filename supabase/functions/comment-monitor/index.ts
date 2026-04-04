import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (d: unknown, s=200) => new Response(JSON.stringify(d), { headers:{...H,"Content-Type":"application/json"}, status:s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const V = "v21.0";
  const results: any[] = [];

  try {
    const body = req.method === "POST" ? await req.json().catch(()=>({})) : {};
    const targetClient = body.client_id; // optional: monitor specific client only

    /* ── Get Gemini key for AI replies ── */
    let geminiKey = "";
    try {
      const { data } = await sb.from("app_settings").select("value").eq("key","gemini_key").single();
      geminiKey = data?.value || "";
    } catch {}

    /* ── Get all clients with Meta tokens ── */
    const { data: settings } = await sb.from("app_settings").select("key,value").like("key","meta_token_%");
    if (!settings?.length) return json({ message: "No Meta tokens found", results: [] });

    const clients = settings.map(s => ({
      client_id: s.key.replace("meta_token_",""),
      token: JSON.parse(s.value),
    })).filter(c => !targetClient || c.client_id === targetClient);

    for (const client of clients) {
      const at = client.token.page_token || "";
      const igId = client.token.ig_user_id || "";
      if (!at || !igId) { results.push({ client_id: client.client_id, error: "Missing token/igId" }); continue; }

      try {
        /* ── Get recent media (last 14 days) ── */
        const mediaRes = await fetch(`https://graph.facebook.com/${V}/${igId}/media?fields=id,caption,timestamp,media_type&limit=10&access_token=${at}`);
        const mediaData = await mediaRes.json();
        if (mediaData.error) { results.push({ client_id: client.client_id, error: mediaData.error.message }); continue; }

        const media = (mediaData.data || []).filter((m: any) => {
          const age = Date.now() - new Date(m.timestamp).getTime();
          return age < 14 * 24 * 60 * 60 * 1000; // 14 days
        });

        let newComments = 0;

        for (const post of media) {
          /* ── Get comments on this post ── */
          const commRes = await fetch(`https://graph.facebook.com/${V}/${post.id}/comments?fields=id,text,timestamp,username&limit=50&access_token=${at}`);
          const commData = await commRes.json();
          if (commData.error || !commData.data) continue;

          /* ── Check which comments are already processed ── */
          const commentIds = commData.data.map((c: any) => c.id);
          const { data: existing } = await sb.from("comment_replies").select("comment_id").in("comment_id", commentIds);
          const existingIds = new Set((existing || []).map((e: any) => e.comment_id));

          const fresh = commData.data.filter((c: any) => !existingIds.has(c.id));
          if (!fresh.length) continue;

          /* ── Get client name for context ── */
          let clientName = "";
          try {
            const { data: cl } = await sb.from("clients").select("name,segment").eq("id", client.client_id).single();
            clientName = cl?.name || "";
          } catch {}

          /* ── Generate AI reply for each new comment ── */
          for (const comment of fresh) {
            // Skip very short or emoji-only comments
            const text = (comment.text || "").trim();
            if (text.length < 3) continue;
            // Skip comments that are just tags (@mentions with no other text)
            if (/^@\w+\s*$/.test(text)) continue;

            let suggestedReply = "";

            if (geminiKey) {
              try {
                const prompt = `Você é o social media da empresa "${clientName}". Gere UMA resposta curta, simpática e profissional para este comentário no Instagram. A resposta deve ter no máximo 2 frases. Não use hashtags. Seja natural e humano.

Contexto do post: ${(post.caption || "").substring(0, 200)}

Comentário de @${comment.username}: "${text}"

Responda APENAS com o texto da resposta, sem aspas nem explicações:`;

                const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 150, temperature: 0.7 } }),
                });
                const aiData = await aiRes.json();
                suggestedReply = aiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
              } catch (e: any) { console.log("[comment-monitor] AI error:", e.message); }
            }

            /* ── Save to database ── */
            await sb.from("comment_replies").insert({
              client_id: client.client_id,
              post_id: post.id,
              comment_id: comment.id,
              comment_text: text,
              comment_author: comment.username || "unknown",
              comment_timestamp: comment.timestamp,
              platform: "instagram",
              suggested_reply: suggestedReply,
              status: suggestedReply ? "pending" : "no_reply",
            });
            newComments++;
          }
        }

        results.push({ client_id: client.client_id, media_checked: media.length, new_comments: newComments });
      } catch (e: any) {
        results.push({ client_id: client.client_id, error: e.message });
      }
    }

    return json({ success: true, results, timestamp: new Date().toISOString() });
  } catch (err: any) {
    console.error("[comment-monitor] Fatal:", err);
    return json({ error: err.message }, 200);
  }
});
