import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (d: unknown, s=200) => new Response(JSON.stringify(d), { headers:{...H,"Content-Type":"application/json"}, status:s });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const V = "v21.0";

  try {
    const body = req.method === "POST" ? await req.json().catch(()=>({})) : {};
    const action = body.action || "scan";

    /* ═══ GENERATE AI REPLY using Claude ═══ */
    if (action === "generate_reply") {
      const { comment_id } = body;
      if (!comment_id) return json({ error: "Missing comment_id" });

      const { data: comment } = await sb.from("comment_replies").select("*").eq("id", comment_id).single();
      if (!comment) return json({ error: "Comment not found" });

      /* Get Claude API key */
      let claudeKey = "";
      try { const { data } = await sb.from("app_settings").select("value").eq("key","claude_key").single(); claudeKey = data?.value || ""; } catch {}
      /* Fallback to Gemini if no Claude key */
      let geminiKey = "";
      if (!claudeKey) {
        try { const { data } = await sb.from("app_settings").select("value").eq("key","gemini_key").single(); geminiKey = data?.value || ""; } catch {}
      }
      if (!claudeKey && !geminiKey) return json({ error: "Nenhuma chave de IA configurada (claude_key ou gemini_key)" });

      /* Get client name */
      let clientName = "";
      try { const { data: cl } = await sb.from("clients").select("name").eq("id", comment.client_id).single(); clientName = cl?.name || ""; } catch {}

      const prompt = `Você é o social media da empresa "${clientName}". Gere UMA resposta curta, simpática e profissional para este comentário no Instagram. A resposta deve ter no máximo 2 frases. Não use hashtags. Seja natural e humano. Se o comentário for apenas emojis ou aplausos, responda com gratidão de forma calorosa.\n\nComentário de @${comment.comment_author}: "${comment.comment_text}"\n\nResponda APENAS com o texto da resposta, sem aspas, sem explicações, sem prefixos:`;

      let suggestion = "";

      if (claudeKey) {
        /* Use Claude API */
        const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": claudeKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 150,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        const aiData = await aiRes.json();
        suggestion = aiData?.content?.[0]?.text?.trim() || "";
        if (aiData?.error) {
          console.log("[comment-monitor] Claude error:", JSON.stringify(aiData.error));
          return json({ error: "Claude API: " + (aiData.error?.message || JSON.stringify(aiData.error)) });
        }
      } else {
        /* Fallback: Gemini */
        const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 150, temperature: 0.7 } }),
        });
        const aiData = await aiRes.json();
        suggestion = aiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      }

      if (suggestion) {
        await sb.from("comment_replies").update({ suggested_reply: suggestion, status: "pending" }).eq("id", comment_id);
        return json({ success: true, suggestion });
      }
      return json({ error: "IA não gerou resposta" });
    }

    /* ═══ SCAN — collect comments (fast, no AI) ═══ */
    const targetClient = body.client_id;
    const results: any[] = [];

    const { data: settings } = await sb.from("app_settings").select("key,value").like("key","meta_token_%");
    if (!settings?.length) return json({ message: "No Meta tokens found", results: [] });

    const clients = settings.map(s => {
      try { return { client_id: s.key.replace("meta_token_",""), token: JSON.parse(s.value) }; }
      catch { return null; }
    }).filter(Boolean).filter((c: any) => !targetClient || c.client_id === targetClient);

    for (const client of clients as any[]) {
      const at = client.token.page_token || "";
      const igId = client.token.ig_user_id || "";
      if (!at || !igId) { results.push({ client_id: client.client_id, error: "Missing token" }); continue; }

      try {
        const mediaRes = await fetch(`https://graph.facebook.com/${V}/${igId}/media?fields=id,timestamp&limit=5&access_token=${at}`);
        const mediaData = await mediaRes.json();
        if (mediaData.error) { results.push({ client_id: client.client_id, error: mediaData.error.message }); continue; }

        const media = (mediaData.data || []).filter((m: any) => {
          const age = Date.now() - new Date(m.timestamp).getTime();
          return age < 14 * 24 * 60 * 60 * 1000;
        });

        let newComments = 0;
        for (const post of media) {
          const commRes = await fetch(`https://graph.facebook.com/${V}/${post.id}/comments?fields=id,text,timestamp,username&limit=30&access_token=${at}`);
          const commData = await commRes.json();
          if (commData.error || !commData.data?.length) continue;

          const ids = commData.data.map((c: any) => c.id);
          const { data: existing } = await sb.from("comment_replies").select("comment_id").in("comment_id", ids);
          const existingSet = new Set((existing || []).map((e: any) => e.comment_id));

          const fresh = commData.data.filter((c: any) => {
            if (existingSet.has(c.id)) return false;
            const text = (c.text || "").trim();
            if (text.length < 1) return false;
            if (/^@\w+\s*$/.test(text)) return false;
            return true;
          });

          if (fresh.length > 0) {
            const rows = fresh.map((c: any) => ({
              client_id: client.client_id, post_id: post.id, comment_id: c.id,
              comment_text: (c.text || "").trim(), comment_author: c.username || "unknown",
              comment_timestamp: c.timestamp, platform: "instagram", status: "new",
            }));
            await sb.from("comment_replies").insert(rows);
            newComments += rows.length;
          }
        }
        results.push({ client_id: client.client_id, media: media.length, new_comments: newComments });
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
