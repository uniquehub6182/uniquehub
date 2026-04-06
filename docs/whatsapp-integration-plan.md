# UniqueHub — Plano de Integração WhatsApp (Evolution API)

## Visão Geral

Integrar o WhatsApp da agência ao UniqueHub para enviar mensagens automáticas nos grupos dos clientes, puxando-os de volta ao app diariamente.

## Arquitetura

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Supabase pg_cron   │────▶│  Edge Function   │────▶│ Evolution   │
│  (8h, 18h, seg)     │     │  whatsapp-notify │     │ API (VPS)   │
└─────────────────────┘     └──────────────────┘     └──────┬──────┘
                                     │                      │
                              Puxa dados:                Envia msg:
                              - posts pendentes          - Grupos WA
                              - posts agendados          - 1-a-1
                              - métricas Meta            
                              - score gamificação        
                                     │                      │
                            ┌────────▼────────┐    ┌────────▼────────┐
                            │   Supabase DB   │    │  WhatsApp Web   │
                            │  (demands, etc) │    │  (sessão ativa) │
                            └─────────────────┘    └─────────────────┘
```

## Fase 1 — Infraestrutura (Dia 1-2)

### 1.1 VPS + Evolution API

- **VPS**: Hetzner CX22 (2 vCPU, 4GB RAM) — €4.49/mês (~R$25)
- **Domínio**: `wa.uniquehub.com.br` (subdomínio, SSL via Caddy)
- **Deploy**: Docker Compose

```yaml
# docker-compose.yml
version: '3'
services:
  evolution:
    image: atendai/evolution-api:latest
    ports:
      - "8080:8080"
    environment:
      - AUTHENTICATION_API_KEY=<CHAVE_SECRETA>
      - SERVER_URL=https://wa.uniquehub.com.br
      - DATABASE_PROVIDER=postgresql
      - DATABASE_CONNECTION_URI=postgresql://...
    volumes:
      - evolution_data:/evolution/instances
    restart: unless-stopped

  caddy:
    image: caddy:latest
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    restart: unless-stopped

volumes:
  evolution_data:
  caddy_data:
```

```
# Caddyfile
wa.uniquehub.com.br {
    reverse_proxy evolution:8080
}
```

### 1.2 Conectar WhatsApp da Agência

Após deploy, acessar `https://wa.uniquehub.com.br/manager` e:

1. Criar instância: `POST /instance/create` com `{ "instanceName": "unique-agency" }`
2. Obter QR Code: `GET /instance/connect/unique-agency`
3. Escanear com o WhatsApp do celular da agência
4. Sessão persiste — reconecta automaticamente

### 1.3 Tabela no Supabase

```sql
CREATE TABLE whatsapp_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL,          -- ex: "120363xxxxx@g.us"
  group_name TEXT,                   -- nome do grupo p/ referência
  enabled BOOLEAN DEFAULT true,
  notify_morning BOOLEAN DEFAULT true,   -- resumo 8h
  notify_evening BOOLEAN DEFAULT true,   -- resumo 18h
  notify_weekly BOOLEAN DEFAULT true,    -- resumo semanal (segunda)
  notify_approvals BOOLEAN DEFAULT true, -- aviso de post pendente
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Histórico de mensagens enviadas (para não duplicar)
CREATE TABLE whatsapp_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id),
  group_jid TEXT,
  message_type TEXT,  -- 'morning', 'evening', 'weekly', 'approval_reminder'
  message_text TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'sent'  -- 'sent', 'failed'
);
```

## Fase 2 — Edge Function de Notificação (Dia 3-4)

### 2.1 Edge Function: `whatsapp-notify`

```typescript
// supabase/functions/whatsapp-notify/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL");    // https://wa.uniquehub.com.br
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
const INSTANCE = "unique-agency";

async function sendWhatsApp(groupJid: string, text: string) {
  const res = await fetch(`${EVOLUTION_URL}/message/sendText/${INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY! },
    body: JSON.stringify({ number: groupJid, text, delay: 1200, linkPreview: true }),
  });
  return res.ok;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { type } = await req.json(); // "morning" | "evening" | "weekly" | "approval_reminder"
  const { data: groups } = await supabase
    .from("whatsapp_groups")
    .select("*, clients(name, plan, contact_email)")
    .eq("enabled", true);

  if (!groups?.length) return new Response("No groups configured");

  for (const g of groups) {
    const clientId = g.client_id;
    const clientName = g.clients?.name || "Cliente";
    let message = "";

    if (type === "morning") {
      // Posts agendados para hoje
      const today = new Date().toISOString().split("T")[0];
      const { data: scheduled } = await supabase
        .from("demands")
        .select("title, schedule_time")
        .eq("client_id", clientId)
        .eq("schedule_date", today)
        .in("stage", ["published", "scheduled"]);

      // Posts pendentes de aprovação
      const { count: pending } = await supabase
        .from("demands")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("steps->client->mode", "sent_to_client")
        .is("steps->client->status", null);

      const schedList = (scheduled || [])
        .map(s => `  📌 ${s.title} às ${s.schedule_time || "—"}`)
        .join("\n");

      message = `☀️ *Bom dia, ${clientName}!*\n\n`;
      if (scheduled?.length) {
        message += `📅 *${scheduled.length} post(s) agendado(s) para hoje:*\n${schedList}\n\n`;
      }
      if (pending) {
        message += `⚠️ *${pending} post(s) aguardando sua aprovação*\n`;
      }
      if (!scheduled?.length && !pending) {
        message += `✅ Tudo em dia! Nenhuma pendência.\n`;
      }
      message += `\n👉 Acesse o app: https://uniquehub.com.br`;
    }

    else if (type === "evening") {
      // Resumo do dia
      const today = new Date().toISOString().split("T")[0];
      const { data: published } = await supabase
        .from("demands")
        .select("title")
        .eq("client_id", clientId)
        .gte("updated_at", today + "T00:00:00")
        .eq("stage", "published");

      const { data: scores } = await supabase
        .from("client_scores")
        .select("points")
        .eq("client_id", clientId)
        .gte("created_at", today + "T00:00:00");

      const dayPts = (scores || []).reduce((a, s) => a + Number(s.points), 0);

      message = `🌙 *Resumo do dia — ${clientName}*\n\n`;
      message += `📊 Posts publicados hoje: *${published?.length || 0}*\n`;
      message += `🏆 Pontos ganhos hoje: *+${dayPts.toFixed(1)}*\n`;
      message += `\n👉 Veja detalhes: https://uniquehub.com.br`;
    }

    else if (type === "weekly") {
      // Resumo semanal (roda na segunda de manhã)
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: weekPosts } = await supabase
        .from("demands")
        .select("title")
        .eq("client_id", clientId)
        .gte("updated_at", weekAgo)
        .eq("stage", "published");

      const { data: weekScores } = await supabase
        .from("client_scores")
        .select("points")
        .eq("client_id", clientId)
        .gte("created_at", weekAgo);

      const weekPts = (weekScores || []).reduce((a, s) => a + Number(s.points), 0);
      const { data: totalScores } = await supabase
        .from("client_scores")
        .select("points")
        .eq("client_id", clientId);
      const totalPts = Math.min(100, Math.round(
        (totalScores || []).reduce((a, s) => a + Number(s.points), 0)
      ));

      message = `📊 *Resumo Semanal — ${clientName}*\n\n`;
      message += `📝 Posts publicados: *${weekPosts?.length || 0}*\n`;
      message += `🏆 Pontos ganhos: *+${weekPts.toFixed(1)}*\n`;
      message += `📈 Growth Score atual: *${totalPts}/100*\n`;
      message += `\n👉 Veja o relatório completo: https://uniquehub.com.br`;
    }

    else if (type === "approval_reminder") {
      if (!g.notify_approvals) continue;
      const { count: pending } = await supabase
        .from("demands")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .eq("steps->client->mode", "sent_to_client")
        .is("steps->client->status", null);

      if (!pending) continue;
      message = `📋 *${clientName}*, você tem *${pending} post(s)* aguardando aprovação!\n\n`;
      message += `Aprovar rapidamente garante que seu conteúdo saia no horário ideal 🚀\n`;
      message += `\n👉 Aprovar agora: https://uniquehub.com.br`;
    }

    if (!message) continue;

    const ok = await sendWhatsApp(g.group_jid, message);
    await supabase.from("whatsapp_log").insert({
      client_id: clientId, group_jid: g.group_jid,
      message_type: type, message_text: message,
      status: ok ? "sent" : "failed",
    });
  }

  return new Response("OK");
});
```

### 2.2 pg_cron Schedule

```sql
-- Resumo matinal (8h Brasília = 11h UTC)
SELECT cron.schedule('wa-morning', '0 11 * * *',
  $$SELECT net.http_post(
    'https://kyoenyglyayfxtihlewb.supabase.co/functions/v1/whatsapp-notify',
    '{"type":"morning"}'::jsonb,
    headers := '{"Authorization":"Bearer <SERVICE_KEY>","Content-Type":"application/json"}'::jsonb
  )$$
);

-- Resumo noturno (18h Brasília = 21h UTC)
SELECT cron.schedule('wa-evening', '0 21 * * *',
  $$SELECT net.http_post(
    'https://kyoenyglyayfxtihlewb.supabase.co/functions/v1/whatsapp-notify',
    '{"type":"evening"}'::jsonb,
    headers := '{"Authorization":"Bearer <SERVICE_KEY>","Content-Type":"application/json"}'::jsonb
  )$$
);

-- Resumo semanal (segunda 9h Brasília = 12h UTC)
SELECT cron.schedule('wa-weekly', '0 12 * * 1',
  $$SELECT net.http_post(
    'https://kyoenyglyayfxtihlewb.supabase.co/functions/v1/whatsapp-notify',
    '{"type":"weekly"}'::jsonb,
    headers := '{"Authorization":"Bearer <SERVICE_KEY>","Content-Type":"application/json"}'::jsonb
  )$$
);

-- Lembrete de aprovação (14h Brasília = 17h UTC, seg-sex)
SELECT cron.schedule('wa-approval', '0 17 * * 1-5',
  $$SELECT net.http_post(
    'https://kyoenyglyayfxtihlewb.supabase.co/functions/v1/whatsapp-notify',
    '{"type":"approval_reminder"}'::jsonb,
    headers := '{"Authorization":"Bearer <SERVICE_KEY>","Content-Type":"application/json"}'::jsonb
  )$$
);
```

## Fase 3 — Painel Admin no UniqueHub (Dia 5-6)

Nova sub-page em Settings → "WhatsApp" (admin only):

### Funcionalidades do painel:
- **Status da conexão**: Mostra se a sessão WA está ativa (GET `/instance/connectionState/unique-agency`)
- **QR Code**: Se desconectado, mostra QR para reconectar
- **Lista de grupos**: Busca via `GET /group/fetchAllGroups/unique-agency`
- **Vincular grupo ↔ cliente**: Dropdown de clientes + select de grupo
- **Toggle por tipo de notificação**: morning/evening/weekly/approval por grupo
- **Log de mensagens**: Últimas 50 mensagens do `whatsapp_log`
- **Botão "Testar"**: Envia mensagem de teste no grupo selecionado

## Fase 4 — Notificações em Tempo Real (Dia 7)

Além dos agendamentos, disparar WhatsApp em eventos importantes:

| Evento | Trigger | Mensagem |
|---|---|---|
| Post enviado p/ aprovação | `respondDemand` (agency side) | "📋 Novo post pra aprovação: [título]. Acesse o app!" |
| Post publicado | Edge Function `publish-demand` | "✅ Post publicado: [título]" |
| Reunião amanhã | pg_cron 18h | "📅 Lembrete: reunião amanhã às [hora]" |
| Score atingiu nova zona | Trigger no `client_scores` | "🏆 Parabéns! Você subiu para a zona [nome]!" |

## Fase 5 — Pulse Diário via WhatsApp (Dia 8-10)

Integrar com Meta API para enviar métricas reais:

```
☀️ *Bom dia, Grumari Sorvetes!*

📊 *Instagram ontem:*
  👥 Seguidores: 2.847 (+12)
  ❤️ Curtidas: 89
  💬 Comentários: 7
  👀 Alcance: 3.2k

📅 *Hoje:*
  📌 "Promoção de inverno" às 15h
  ⚠️ 1 post aguardando aprovação

🏆 Growth Score: 72/100 (Zona Estratégica)

👉 https://uniquehub.com.br
```

## Custos

| Item | Custo mensal |
|---|---|
| VPS Hetzner CX22 | ~R$25 |
| Domínio (subdomínio) | R$0 |
| Evolution API | R$0 (open source) |
| Edge Functions | R$0 (free tier Supabase) |
| **Total** | **~R$25/mês** |

## Riscos e Mitigação

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Banimento do número | Baixa (msgs legítimas, baixo volume) | Usar número secundário dedicado |
| Desconexão da sessão | Média | Monitor + alerta + reconexão auto |
| Rate limit WhatsApp | Baixa (poucos grupos) | Delay de 1-2s entre mensagens |
| Evolution API instável | Média | Usar versão Lite, monitorar health |

## Cronograma

| Dia | Tarefa |
|---|---|
| 1-2 | VPS + Docker + Evolution API + DNS |
| 3-4 | Edge Function + pg_cron + tabelas |
| 5-6 | Painel admin no UniqueHub |
| 7 | Notificações em tempo real |
| 8-10 | Pulse diário com métricas Meta |

## Alternativa Sem VPS

Se preferir zero manutenção de infra:
- **Z-API**: Hosted, brasileiro, R$50-80/mês, suporta grupos
- **WasenderAPI**: $6/mês, cloud-hosted, SDKs prontos
- Mesma Edge Function, só muda a URL do endpoint de envio
