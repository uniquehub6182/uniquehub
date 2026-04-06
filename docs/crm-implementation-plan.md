# UniqueHub — Plano de Implementação CRM de Leads

## Problema

A agência gera tráfego pago → leads chegam → caem no formulário do Meta ou landing page → vão pro e-mail/WhatsApp pessoal do cliente → agência perde visibilidade → não consegue provar ROI → cliente não sabe se o marketing está funcionando.

## Solução

CRM embutido no UniqueHub que captura leads automaticamente, notifica o cliente em tempo real, e fecha o ciclo tráfego → lead → venda → ROI comprovado.

## Por que resolve o engajamento

Lead = dinheiro. Nenhum empresário ignora "Novo lead: João Silva quer orçamento". O CRM transforma o UniqueHub de "app de aprovar post" em "app que me traz clientes". Motivo genuíno pra abrir o app várias vezes ao dia.

## Arquitetura

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Meta Lead   │   │  Landing     │   │  Manual      │
│  Ads Webhook │   │  Page Form   │   │  (cliente)   │
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────┐
│          Edge Function: lead-capture                │
│   Recebe lead → salva no Supabase → notifica       │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌──────────┐ ┌───────────┐ ┌──────────┐
   │ Supabase │ │ Push/WA   │ │ UniqueHub│
   │ DB leads │ │ Notifica  │ │ Realtime │
   └──────────┘ └───────────┘ └──────────┘
```

## Fase 1 — Banco de Dados (Dia 1)

### Tabelas Supabase

```sql
-- ═══════════════════════════════════════════
-- LEADS
-- ═══════════════════════════════════════════
CREATE TABLE leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Dados do lead
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  
  -- Origem
  source TEXT DEFAULT 'manual',       -- 'meta_lead_ads', 'landing_page', 'manual', 'whatsapp', 'instagram'
  campaign TEXT,                       -- Nome da campanha Meta
  ad_set TEXT,                         -- Conjunto de anúncios
  ad_name TEXT,                        -- Nome do anúncio específico
  form_id TEXT,                        -- ID do formulário Meta (para dedup)
  meta_lead_id TEXT UNIQUE,            -- ID do lead no Meta (para dedup)
  
  -- Pipeline
  status TEXT DEFAULT 'novo',          -- 'novo','contato','negociacao','proposta','fechado','perdido'
  lost_reason TEXT,                    -- Motivo da perda (quando status = 'perdido')
  
  -- Valores
  estimated_value NUMERIC(10,2),       -- Valor estimado do negócio
  actual_value NUMERIC(10,2),          -- Valor real fechado
  
  -- Atribuição
  assigned_to TEXT,                     -- Nome do responsável no cliente
  notes TEXT,                           -- Observações livres
  tags TEXT[],                          -- Tags personalizáveis
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  contacted_at TIMESTAMPTZ,            -- Quando fez primeiro contato
  closed_at TIMESTAMPTZ                -- Quando fechou/perdeu
);

-- Índices para performance
CREATE INDEX idx_leads_client ON leads(client_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_leads_source ON leads(source);
```

```sql
-- ═══════════════════════════════════════════
-- HISTÓRICO DE AÇÕES NO LEAD
-- ═══════════════════════════════════════════
CREATE TABLE lead_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                -- 'status_change','note','call','whatsapp','email','assignment'
  from_value TEXT,                     -- Valor anterior (ex: status antigo)
  to_value TEXT,                       -- Valor novo
  notes TEXT,
  performed_by TEXT,                   -- Nome de quem fez a ação
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_lead_history_lead ON lead_history(lead_id);

-- ═══════════════════════════════════════════
-- PIPELINE CUSTOMIZÁVEL POR CLIENTE
-- ═══════════════════════════════════════════
CREATE TABLE lead_pipelines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  stages JSONB DEFAULT '[
    {"key":"novo","label":"Novo","color":"#3B82F6"},
    {"key":"contato","label":"Em Contato","color":"#F59E0B"},
    {"key":"negociacao","label":"Negociação","color":"#8B5CF6"},
    {"key":"proposta","label":"Proposta","color":"#EC4899"},
    {"key":"fechado","label":"Fechado ✓","color":"#10B981"},
    {"key":"perdido","label":"Perdido","color":"#EF4444"}
  ]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- CONFIGURAÇÃO DE CAPTURA POR CLIENTE
-- ═══════════════════════════════════════════
CREATE TABLE lead_sources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                  -- 'meta_lead_ads', 'landing_page', 'webhook'
  config JSONB,                        -- { page_id, form_id, api_key, webhook_secret }
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: clientes só veem seus leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_client_access ON leads
  FOR ALL USING (
    client_id IN (
      SELECT id FROM clients 
      WHERE contact_email = auth.jwt()->>'email'
    )
  );
```

## Fase 2 — Captura de Leads (Dia 2-4)

### 2.1 Edge Function: `lead-capture`

Endpoint público que recebe leads de qualquer fonte.

```typescript
// supabase/functions/lead-capture/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const source = url.searchParams.get("source") || "webhook";
  const clientId = url.searchParams.get("client_id");
  const apiKey = url.searchParams.get("api_key");

  // Validar API key do cliente
  if (source !== "meta_lead_ads") {
    const { data: src } = await supabase
      .from("lead_sources")
      .select("client_id")
      .eq("config->>api_key", apiKey)
      .eq("enabled", true)
      .single();
    if (!src) return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json();

  // ── Meta Lead Ads Webhook ──
  if (source === "meta_lead_ads") {
    // Verificação de webhook (GET challenge)
    if (req.method === "GET") {
      const challenge = url.searchParams.get("hub.challenge");
      return new Response(challenge);
    }

    // Processar lead do Meta
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "leadgen") continue;
        const leadgenId = change.value.leadgen_id;
        const pageId = change.value.page_id;
        const formId = change.value.form_id;

        // Buscar qual cliente tem essa page_id configurada
        const { data: src } = await supabase
          .from("lead_sources")
          .select("client_id, config")
          .eq("type", "meta_lead_ads")
          .eq("enabled", true);

        const match = (src || []).find(s => s.config?.page_id === String(pageId));
        if (!match) continue;

        // Buscar dados do lead na Meta API
        const token = match.config?.access_token;
        const metaRes = await fetch(
          `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${token}`
        );
        const metaData = await metaRes.json();
        const fields: Record<string, string> = {};
        (metaData.field_data || []).forEach((f: any) => {
          fields[f.name] = f.values?.[0] || "";
        });

        // Inserir lead (com dedup pelo meta_lead_id)
        const { error } = await supabase.from("leads").upsert({
          client_id: match.client_id,
          name: fields.full_name || fields.first_name || "Lead sem nome",
          phone: fields.phone_number || fields.phone || "",
          email: fields.email || "",
          source: "meta_lead_ads",
          campaign: metaData.campaign_name || "",
          ad_set: metaData.adset_name || "",
          ad_name: metaData.ad_name || "",
          form_id: String(formId),
          meta_lead_id: String(leadgenId),
          status: "novo",
        }, { onConflict: "meta_lead_id" });

        if (!error) {
          // Notificar cliente via Supabase Realtime + WhatsApp
          await supabase.from("notifications").insert({
            type: "new_lead",
            title: "Novo lead!",
            body: `${fields.full_name || "Novo lead"} — ${fields.phone_number || fields.email || "sem contato"}`,
            client_id: match.client_id,
            read: false,
          });

          // Gamificação: +2 pontos por lead recebido
          await supabase.from("client_scores").insert({
            client_id: match.client_id,
            action: "lead_received",
            points: 2.0,
            pillar: "crescimento",
            description: `Lead recebido: ${fields.full_name || "Novo"}`,
          });
        }
      }
    }
    return new Response("OK");
  }

  // ── Landing Page / Webhook genérico ──
  const lead = {
    client_id: clientId || body.client_id,
    name: body.name || body.full_name || "Lead",
    phone: body.phone || body.telefone || "",
    email: body.email || "",
    source: source,
    campaign: body.campaign || body.utm_campaign || "",
    ad_name: body.ad || body.utm_content || "",
    status: "novo",
    notes: body.message || body.mensagem || "",
  };

  const { error } = await supabase.from("leads").insert(lead);
  if (error) return new Response(JSON.stringify({ error }), { status: 400 });

  // Notificar
  await supabase.from("notifications").insert({
    type: "new_lead", title: "Novo lead!",
    body: `${lead.name} — via ${source}`,
    client_id: lead.client_id, read: false,
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json",
               "Access-Control-Allow-Origin": "*" }
  });
});
```

### 2.2 Endpoint para Landing Pages

Qualquer landing page do cliente pode enviar leads com um fetch simples:

```html
<!-- No formulário da landing page do cliente -->
<script>
document.querySelector("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await fetch("https://kyoenyglyayfxtihlewb.supabase.co/functions/v1/lead-capture?source=landing_page&client_id=UUID&api_key=KEY", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: fd.get("name"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      message: fd.get("message"),
      utm_campaign: new URLSearchParams(location.search).get("utm_campaign"),
    })
  });
  alert("Enviado! Entraremos em contato.");
});
</script>
```

## Fase 3 — Frontend: App do Cliente (Dia 5-8)

### 3.1 Nova página "Leads" no menu do cliente

Adicionar ao menu: `{ k:"leads", l:"Leads", i:IC.leads }`

### 3.2 Tela principal — Kanban Board

```
┌─────────────────────────────────────────────────────────────┐
│  LEADS   [Kanban] [Lista]        Filtro ▾    + Novo Lead   │
├──────────┬───────────┬────────────┬───────────┬─────────────┤
│  Novo(5) │Contato(3) │Negociaç(2)│Proposta(1)│ Fechado(8)  │
├──────────┼───────────┼────────────┼───────────┼─────────────┤
│┌────────┐│┌─────────┐│┌──────────┐│           │┌───────────┐│
││João S. ││├Maria L. ││├Pedro R.  ││           ││Ana C.     ││
││📱 21... │││📧 maria ││├💰 R$5k  ││           ││💰 R$3.2k  ││
││Meta Ads │││Landing  ││├3 dias   ││           ││✅ 12/mar  ││
│└────────┘│└─────────┘│└──────────┘│           │└───────────┘│
│┌────────┐│           │            │           │             │
││Ana M.  ││           │            │           │             │
││📱 24...│││           │            │           │             │
││Inst.DM ││           │            │           │             │
│└────────┘│           │            │           │             │
└──────────┴───────────┴────────────┴───────────┴─────────────┘
```

Funcionalidades:
- **Drag & Drop** entre colunas (muda status)
- **Card do lead**: nome, telefone, email, origem, tempo no stage
- **Tap no card** → abre detalhe com histórico, notas, ações
- **Ações rápidas**: 📱 Ligar (tel:), 💬 WhatsApp (wa.me/), ✉️ Email
- **Badge de urgência**: lead há +48h sem contato fica com borda vermelha
- **Filtros**: período, origem, campanha, responsável
- **Busca**: por nome, telefone, email

### 3.3 Detalhe do Lead

```
┌─────────────────────────────────────┐
│  ← João Silva           ⚡ Novo    │
│                                     │
│  📱 (21) 99999-8888    [Ligar]     │
│  💬 WhatsApp            [Abrir]    │
│  ✉️ joao@email.com      [Email]    │
│                                     │
│  ── Origem ──                       │
│  📊 Meta Ads                        │
│  🎯 Campanha: Black Friday 2026    │
│  📋 Anúncio: Carrossel Produtos    │
│                                     │
│  ── Pipeline ──                     │
│  [Novo] → [Contato] → [Negoc.] → …│
│                                     │
│  💰 Valor estimado: R$ ____        │
│  👤 Responsável: [Selecionar ▾]    │
│                                     │
│  ── Notas ──                        │
│  + Adicionar nota                   │
│  • "Interessado no plano premium"   │
│    por Alice — 2h atrás            │
│                                     │
│  ── Histórico ──                    │
│  🟢 Lead criado — Meta Ads — 10h   │
│  🔵 Status: Novo → Contato — 8h    │
│  💬 Nota adicionada — 2h           │
└─────────────────────────────────────┘
```

## Fase 4 — Frontend: Painel da Agência (Dia 9-11)

### 4.1 Sub-page "CRM" no painel da agência

Visão consolidada de todos os clientes:

**Dashboard CRM:**
- Total de leads este mês (todos os clientes)
- Taxa de conversão média
- Custo por lead médio (se integrado com gasto de ads)
- Top 5 clientes por conversão
- Leads sem contato há +48h (alertas)

**Por cliente:**
- Pipeline completo com métricas
- Funil visual: Novo → Contato → Negociação → Fechado
- Tempo médio em cada etapa
- Comparativo mês a mês

**Configuração (por cliente):**
- Ativar/desativar captura Meta Lead Ads
- Configurar page_id e access_token
- Gerar API key para landing pages
- Customizar stages do pipeline
- Definir notificações (WA, push, email)

### 4.2 Métricas de ROI

O grande diferencial — mostrar pro cliente:

```
┌──────────────────────────────────────────┐
│  📊 ROI do Marketing — Março 2026       │
│                                          │
│  💰 Investido em ads:     R$ 2.500      │
│  👥 Leads gerados:        47            │
│  📞 Leads contatados:     38 (81%)      │
│  ✅ Vendas fechadas:      12 (25%)      │
│  💵 Receita gerada:       R$ 18.400     │
│                                          │
│  📈 ROI: 636%                            │
│  💲 Custo por lead: R$ 53,19           │
│  💲 Custo por venda: R$ 208,33         │
│                                          │
│  vs mês anterior: ▲ +8% conversão       │
└──────────────────────────────────────────┘
```

Este card aparece no dashboard do cliente E no relatório semanal por WhatsApp.

## Fase 5 — Integrações (Dia 12-14)

### 5.1 Meta Lead Ads (automático)

Usar o app do Facebook já existente (ID `1557196698688426`):
1. Adicionar permissão `leads_retrieval` e `pages_manage_ads`
2. Configurar Webhook URL: `https://kyoenyglyayfxtihlewb.supabase.co/functions/v1/lead-capture?source=meta_lead_ads`
3. Subscribir ao campo `leadgen` da página do cliente
4. Lead chega → Edge Function processa → salva → notifica

### 5.2 WhatsApp (Evolution API)

Quando lead novo chega, disparar no grupo do cliente:
```
🔔 *Novo lead chegou!*

👤 João Silva
📱 (21) 99999-8888
✉️ joao@email.com
📊 Origem: Meta Ads — Campanha "Black Friday"

⏰ Entre em contato o mais rápido possível!
👉 Ver no app: https://uniquehub.com.br
```

### 5.3 Gamificação integrada

Novos scoring triggers para o CRM:

| Ação | Pontos | Pilar |
|---|---|---|
| Lead recebido (automático) | +2.0 | Crescimento |
| Qualificar lead (mudar status) | +1.0 | Execução |
| Fechar venda | +5.0 | Crescimento |
| Contatar lead em <2h | +1.5 | Execução |
| Registrar valor da venda | +1.0 | Crescimento |
| Adicionar nota ao lead | +0.3 | Execução |

Penalidades:
| Ação | Pontos |
|---|---|
| Lead sem contato há 3+ dias | -2.0 |
| Lead perdido sem motivo registrado | -1.0 |

### 5.4 Relatórios e Apresentações

A feature "Apresentações" (já especificada) pode puxar dados do CRM:
- Total de leads gerados no mês
- Taxa de conversão
- ROI calculado
- Comparativo com mês anterior
- Ranking dos anúncios que mais geraram leads

## Cronograma

| Dia | Fase | Tarefa |
|---|---|---|
| 1 | DB | Tabelas leads, lead_history, lead_pipelines, lead_sources |
| 2-3 | Backend | Edge Function lead-capture (Meta + webhook genérico) |
| 4 | Backend | Webhook Meta Lead Ads + testes |
| 5-6 | Frontend | Kanban board no app do cliente (mobile) |
| 7-8 | Frontend | Detalhe do lead, ações, notas, histórico |
| 9-10 | Frontend | Painel CRM na agência (visão consolidada) |
| 11 | Frontend | Métricas de ROI, funil, comparativos |
| 12-13 | Integrações | Meta Lead Ads, WhatsApp, gamificação |
| 14 | Polish | Testes, ajustes, desktop layout |

**Total: ~14 dias de desenvolvimento**

## Custos

| Item | Custo |
|---|---|
| Supabase (DB + Edge Functions) | R$0 (free tier) |
| Meta Lead Ads API | R$0 (gratuita) |
| Desenvolvimento | Interno |
| **Total recorrente** | **R$0/mês** |

O CRM não tem custo adicional de infra — roda 100% no Supabase existente.

## Comparativo com CRMs do mercado

| Feature | UniqueHub CRM | RD Station | Pipedrive | HubSpot |
|---|---|---|---|---|
| Custo mensal | R$0 | R$80+ | R$90+ | R$0-800 |
| Integrado com aprovação de posts | ✅ | ❌ | ❌ | ❌ |
| Gamificação | ✅ | ❌ | ❌ | ❌ |
| WhatsApp automático | ✅ (com Evolution) | Pago | ❌ | Pago |
| ROI de tráfego automático | ✅ | Parcial | ❌ | Parcial |
| Meta Lead Ads nativo | ✅ | ✅ | ✅ | ✅ |
| Dentro do app da agência | ✅ | ❌ | ❌ | ❌ |

## Impacto esperado no engajamento

1. **Abertura diária**: Lead = dinheiro. Cliente vai abrir pra ver leads.
2. **Tempo no app**: Qualificar leads exige interação (notas, status, ligação).
3. **Retenção da agência**: Cliente vê ROI concreto → renova contrato.
4. **Upsell**: "Quer mais leads? Aumente o investimento em tráfego."
5. **Diferencial competitivo**: Nenhuma agência de porte similar oferece isso.

## Ordem de implementação recomendada (CRM vs WhatsApp)

**Opção A — CRM primeiro (recomendado):**
- CRM é o que gera valor direto pro cliente (leads = receita)
- WhatsApp amplifica o CRM (notifica lead novo no grupo)
- Sem CRM, WhatsApp é só "bom dia" — com CRM, é "novo lead chegou"

**Opção B — WhatsApp primeiro:**
- Implementação mais rápida (~10 dias vs 14)
- Já começa a puxar o cliente pro app
- Mas sem conteúdo novo no app, o engajamento sobe pouco

**Opção C — Paralelo (se tiver fôlego):**
- Dia 1-2: Infra WhatsApp (VPS + Evolution)
- Dia 3-8: CRM completo (DB + frontend)
- Dia 9-12: Integrar WhatsApp + CRM
- Dia 13-14: Polish, testes, Meta webhook
- Total: ~14 dias para os dois
