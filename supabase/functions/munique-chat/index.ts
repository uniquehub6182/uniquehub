/**
 * Munique A.I. Chat — Edge Function (v2 — structured output)
 * Restricted assistant that answers ONLY questions about UniqueHub agency data.
 * Returns JSON: { text, cards[], suggestions[] }
 *
 * Request (POST):
 *   { question: string, context: object, history?: [{role, content}] }
 *
 * Response:
 *   { text, cards, suggestions }  OR  { error }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), {
    headers: { ...H, "Content-Type": "application/json" },
    status: s,
  });

function buildSystemPrompt() {
  const now = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "full",
    timeStyle: "short",
  });
  return `Você é a Munique A.I., assistente dentro do UniqueHub — plataforma SaaS de gestão para agências de marketing digital. Você conversa com o time da agência para ajudar com perguntas sobre a operação deles.

ESCOPO ESTRITO: responda EXCLUSIVAMENTE perguntas sobre os dados no CONTEXTO (clientes, demandas, posts agendados, eventos, equipe, ideias, notícias, financeiro, performance). Nada além disso.

SEMPRE use a tool "respond_to_user" para responder. Nunca responda em texto direto.

COMO PREENCHER A TOOL:

1. "text" — resposta principal
   - 1 frase curta e direta (máximo 2 frases). O bloco de chat é estreito.
   - Destaque números/métricas com <b>negrito</b>. Ex: "Você tem <b>7 posts</b> aguardando aprovação em <b>3 clientes</b>."
   - Tom casual, português brasileiro, sem formalidade.
   - No máximo 1 emoji por resposta, só quando agregar (opcional).
   - Use dados EXATOS do CONTEXTO. Nunca invente.

2. "cards" — complementos visuais (opcional, máx 4)
   Use cards APENAS quando adicionam informação útil que o texto sozinho não passa bem (breakdowns por cliente, ranking, estatísticas destaque, próximos eventos). Se a resposta é simples ("Hoje é segunda"), deixe cards vazio [].

   Tipos disponíveis:
   - "client-progress": breakdown numérico por cliente
     { type: "client-progress", name: "Nome do Cliente", count: 4, label: "posts", percent: 60 }
     Use percent 0-100 representando a proporção relativa (ex: cliente com mais itens = 100, outros proporcionais).
   - "stat": número destaque com contexto
     { type: "stat", label: "RECEITA MÊS", value: "R$ 22.880", delta: "+12% vs mês passado", positive: true }
   - "event": compromisso específico
     { type: "event", title: "Reunião mensal", date: "22/04", time: "14:00", client: "Sport West" }
   - "list": itens curtos em lista
     { type: "list", title: "Em atraso", items: ["Post Boutique Ana — 3 dias", "Reels Café Luís — 2 dias"] }

3. "suggestions" — 2 a 4 perguntas curtas de follow-up
   - Cada sugestão tem no MÁXIMO 6 palavras.
   - Naturais, ligadas ao que acabou de ser respondido.
   - Use imperativo curto ou pergunta direta. Ex: "Quais estão mais atrasados?", "Como está a produção?", "Ver agenda da semana"

QUANDO REDIRECIONAR (pergunta fora de escopo):
- text: "Sou especialista em dados da sua agência 😊 posso ajudar com clientes, demandas, agenda, performance."
- cards: []
- suggestions: 3 sugestões de coisas que ELA PODE fazer.

QUANDO NÃO TIVER O DADO:
- text: "Esse dado ainda não tá aqui pra mim — posso te ajudar com outra coisa?"
- cards: []
- suggestions: 2-3 perguntas alternativas viáveis.

Data/hora atual: ${now}`;
}

const RESPOND_TOOL = {
  name: "respond_to_user",
  description: "Envia a resposta estruturada pro usuário (texto + cards opcionais + sugestões).",
  input_schema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Resposta principal curta (1-2 frases). Pode ter <b>negrito</b>. Sem markdown nem listas."
      },
      cards: {
        type: "array",
        description: "Cards visuais complementares (0-4). Use apenas quando agregam info visual.",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["client-progress", "stat", "event", "list"] },
            name: { type: "string" },
            count: { type: "number" },
            label: { type: "string" },
            percent: { type: "number" },
            value: { type: "string" },
            delta: { type: "string" },
            positive: { type: "boolean" },
            title: { type: "string" },
            date: { type: "string" },
            time: { type: "string" },
            client: { type: "string" },
            items: { type: "array", items: { type: "string" } }
          },
          required: ["type"]
        }
      },
      suggestions: {
        type: "array",
        description: "2-4 follow-ups curtos (máx 6 palavras cada).",
        items: { type: "string" },
        minItems: 2,
        maxItems: 4
      }
    },
    required: ["text", "cards", "suggestions"]
  }
};

function trimContext(ctx: unknown): string {
  try {
    const c = JSON.parse(JSON.stringify(ctx || {}));
    const CAPS: Record<string, number> = {
      demands: 40, clients: 30, scheduled_posts: 30, events: 25,
      team: 20, ideas: 15, news: 10, checkins: 15,
    };
    for (const [k, cap] of Object.entries(CAPS)) {
      if (Array.isArray(c[k]) && c[k].length > cap) {
        c[k] = c[k].slice(0, cap);
        c[`_${k}_truncated_to`] = cap;
      }
    }
    return JSON.stringify(c, null, 2).slice(0, 14000);
  } catch {
    return "{}";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const question = (body.question || "").toString().trim();
    const context = body.context || {};
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    if (!question) return json({ error: "missing question" }, 400);
    if (question.length > 500) return json({ error: "question too long" }, 400);

    let claudeKey = "";
    try {
      const { data } = await sb
        .from("app_settings")
        .select("value")
        .eq("key", "claude_key")
        .single();
      claudeKey = (data?.value || "").trim();
    } catch { /* ignore */ }

    if (!claudeKey) {
      return json({ error: "Claude API key não configurada" }, 500);
    }

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (const h of history) {
      if (h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string") {
        messages.push({ role: h.role, content: h.content.slice(0, 2000) });
      }
    }

    const ctxStr = trimContext(context);
    messages.push({
      role: "user",
      content: `CONTEXTO ATUAL (JSON com dados da agência neste momento):\n\`\`\`json\n${ctxStr}\n\`\`\`\n\nPergunta: ${question}`,
    });

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": claudeKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 700,
        system: buildSystemPrompt(),
        tools: [RESPOND_TOOL],
        tool_choice: { type: "tool", name: "respond_to_user" },
        messages,
      }),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return json({
        error: data?.error?.message || "Erro ao chamar Claude",
        details: data,
      }, 500);
    }

    /* Extract the tool_use payload — Claude is forced to use the tool */
    const toolUse = Array.isArray(data?.content)
      ? data.content.find((c: { type?: string; name?: string }) => c?.type === "tool_use" && c?.name === "respond_to_user")
      : null;

    const payload = toolUse?.input || null;
    if (!payload || typeof payload.text !== "string") {
      return json({
        error: "resposta sem formato estruturado",
        raw: data,
      }, 500);
    }

    /* Sanitize — ensure arrays exist even if omitted */
    const out = {
      text: String(payload.text).slice(0, 600),
      cards: Array.isArray(payload.cards) ? payload.cards.slice(0, 4) : [],
      suggestions: Array.isArray(payload.suggestions) ? payload.suggestions.slice(0, 4) : [],
    };

    return json(out);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
