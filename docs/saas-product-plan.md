# UniqueHub — Plano de Produto SaaS (Multi-Tenant)

## De Ferramenta Interna → Produto SaaS

Hoje o UniqueHub é uma ferramenta interna da Unique Marketing. Para vender para outras agências, precisa virar um produto multi-tenant com identidade própria de cada cliente.

## O Que Muda

```
HOJE (single-tenant):
┌──────────────────────────────────┐
│  UniqueHub (Unique Marketing)    │
│  1 agência → seus clientes      │
└──────────────────────────────────┘

FUTURO (multi-tenant):
┌──────────────────────────────────┐
│  UniqueHub Platform              │
├──────────┬──────────┬────────────┤
│ Agência A│ Agência B│ Criador C  │
│ 12 client│ 8 client │ (próprio)  │
│ plano Pro│ plano Biz│ plano Solo │
└──────────┴──────────┴────────────┘
```

## Público-Alvo e Personas

### 1. Agências de Marketing Digital (mercado principal)
- **Dor**: Gerenciam conteúdo em planilhas/WhatsApp, cliente não aprova no prazo, 
  não conseguem provar ROI, perdem cliente por falta de organização.
- **O que compram**: Plataforma completa (demandas, aprovação, CRM, relatórios).
- **Ticket**: R$200-800/mês dependendo de quantidade de clientes.
- **Tamanho do mercado BR**: ~40.000 agências digitais ativas.

### 2. Gestores de Tráfego / Freelancers
- **Dor**: Precisam parecer "profissionais", perdem leads por falta de CRM, 
  cliente acha que não faz nada porque não vê o trabalho.
- **O que compram**: CRM de leads + relatórios automáticos.
- **Ticket**: R$49-149/mês.
- **Tamanho**: ~200.000 gestores de tráfego no Brasil.

### 3. Criadores de Conteúdo / Social Media Managers
- **Dor**: Gerenciam múltiplos clientes, aprovação por WhatsApp é caótico, 
  calendário editorial em planilha.
- **O que compram**: Calendário + aprovação + agendamento.
- **Ticket**: R$29-99/mês.

### 4. Franquias
- **Dor**: Franqueador precisa aprovar materiais de 50+ franqueados, 
  sem controle de marca, cada unidade faz o que quer.
- **O que compram**: Aprovação centralizada + biblioteca de assets + 
  padronização de marca.
- **Ticket**: R$500-2000/mês (alto valor por volume).

### 5. Influenciadores / Personal Brands
- **Dor**: Precisam organizar publis, contratos, calendário, métricas 
  pra mostrar pra marcas.
- **O que compram**: Calendário + métricas + media kit automático.
- **Ticket**: R$29-79/mês.

## Planos e Precificação

| Plano | Preço/mês | Público | Inclui |
|---|---|---|---|
| **Solo** | R$49 | Freelancer, criador | 3 clientes, 1 usuário, aprovação, calendário, agendamento |
| **Pro** | R$149 | Agência pequena | 10 clientes, 3 usuários, CRM, relatórios, IA |
| **Business** | R$349 | Agência média | 30 clientes, 10 usuários, CRM, WhatsApp, white-label parcial |
| **Enterprise** | R$799 | Agência grande, franquia | Ilimitado, white-label total, API, suporte prioritário |

### Add-ons
| Add-on | Preço |
|---|---|
| WhatsApp Automático | +R$49/mês |
| CRM de Leads | +R$39/mês (incluso no Pro+) |
| Clientes extras (pack de 5) | +R$29/mês |
| Domínio customizado (white-label) | +R$79/mês |
| Agendamento Instagram/Facebook | +R$49/mês |

### Modelo Freemium (growth hack)
- **Free**: 1 cliente, 1 usuário, aprovação básica, marca UniqueHub
- Objetivo: viralização. O app do cliente mostra "Powered by UniqueHub"
- Quando o freelancer cresce pra 4+ clientes → upgrade obrigatório

## Arquitetura Multi-Tenant

### Estratégia: Shared Database, Row-Level Isolation

Cada agência/conta recebe um `org_id`. Todos os dados vivem no mesmo banco,
isolados por RLS (Row-Level Security) do Supabase — já usamos RLS hoje.

```
┌─────────────────────────────────────────────────────┐
│  Supabase (single project)                          │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ org: unique  │  │ org: agenc-b│  │ org: solo-c │ │
│  │ 10 clients   │  │ 8 clients   │  │ 3 clients   │ │
│  │ 25 demands   │  │ 18 demands  │  │ 7 demands   │ │
│  │ 150 leads    │  │ 80 leads    │  │ 20 leads    │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                     │
│  RLS: WHERE org_id = auth.jwt()->>'org_id'         │
└─────────────────────────────────────────────────────┘
```

### Tabela Principal: `organizations`

```sql
CREATE TABLE organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                    -- "Agência XYZ"
  slug TEXT UNIQUE NOT NULL,             -- "agencia-xyz" (para URL)
  owner_id UUID REFERENCES auth.users(id),
  
  -- Plano
  plan TEXT DEFAULT 'free',              -- 'free','solo','pro','business','enterprise'
  plan_started_at TIMESTAMPTZ,
  plan_expires_at TIMESTAMPTZ,
  max_clients INT DEFAULT 1,
  max_users INT DEFAULT 1,
  
  -- White-label
  logo_url TEXT,
  brand_color TEXT DEFAULT '#BBF246',
  custom_domain TEXT,                    -- "app.agenciaxyz.com.br"
  app_name TEXT,                         -- "XYZ Hub" (substitui UniqueHub)
  favicon_url TEXT,
  
  -- Features habilitadas
  features JSONB DEFAULT '{
    "crm": false,
    "whatsapp": false,
    "scheduling": false,
    "ai_assistant": true,
    "gamification": true,
    "reports": true,
    "match4biz": false
  }'::jsonb,
  
  -- Meta
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Migração das Tabelas Existentes

Cada tabela existente recebe uma coluna `org_id`:

```sql
-- Adicionar org_id em todas as tabelas existentes
ALTER TABLE clients ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE demands ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE team ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE client_scores ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE notifications ADD COLUMN org_id UUID REFERENCES organizations(id);
ALTER TABLE leads ADD COLUMN org_id UUID REFERENCES organizations(id);
-- ... todas as outras tabelas

-- RLS em todas as tabelas
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON clients
  FOR ALL USING (org_id = (auth.jwt()->>'org_id')::uuid);
-- Repetir para cada tabela

-- Tabela de membros da organização
CREATE TABLE org_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',  -- 'owner','admin','member','viewer'
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(org_id, user_id)
);
```

### Impacto no código atual

O que muda no UniqueHubApp.jsx:

1. **Login** → Após autenticar, buscar `org_id` do usuário via `org_members`
2. **Todas as queries** → Supabase RLS filtra automaticamente pelo `org_id` no JWT
3. **Custom claims** → Usar Supabase Auth Hook para injetar `org_id` no JWT token
4. **Branding** → Carregar `organizations.logo_url`, `brand_color`, `app_name` no boot

## White-Label

### O que cada plano permite customizar

| Elemento | Free | Solo | Pro | Business | Enterprise |
|---|---|---|---|---|---|
| Logo da agência | ❌ | ✅ | ✅ | ✅ | ✅ |
| Cor principal | ❌ | ❌ | ✅ | ✅ | ✅ |
| Nome do app | ❌ | ❌ | ❌ | ✅ | ✅ |
| Domínio customizado | ❌ | ❌ | ❌ | ✅ | ✅ |
| Remover "Powered by UniqueHub" | ❌ | ❌ | ❌ | ❌ | ✅ |
| Favicon customizado | ❌ | ❌ | ❌ | ✅ | ✅ |
| Email de notificação customizado | ❌ | ❌ | ❌ | ❌ | ✅ |

### Implementação do Domínio Customizado

```
Cliente acessa: app.agenciaxyz.com.br
         ↓
   CNAME → uniquehub.com.br (Vercel)
         ↓
   Vercel wildcard domain *.uniquehub.com.br
         ↓
   App carrega → busca org pelo domínio:
   SELECT * FROM organizations 
   WHERE custom_domain = 'app.agenciaxyz.com.br'
         ↓
   Aplica branding (logo, cor, nome)
         ↓
   Cliente vê "XYZ Hub" — sem saber que é UniqueHub
```

No Vercel: configurar wildcard domain + custom domains.
No código: no boot do app, checar `window.location.hostname`, 
buscar a org correspondente, e aplicar o branding.

## Onboarding (Fluxo de Cadastro)

```
1. Agência acessa uniquehub.com.br → Landing page
2. Clica "Começar Grátis"
3. Formulário: Nome, email, nome da agência, senha
4. Cria conta → cria organization → cria org_member (owner)
5. Wizard de setup (3 passos):
   a) Upload do logo + cor da marca
   b) Adicionar primeiro cliente (nome, email, plano)
   c) Criar primeira demanda de conteúdo
6. Dashboard com checklist de ativação:
   [ ] Adicionar logo ✓
   [ ] Cadastrar primeiro cliente ✓
   [ ] Criar primeira demanda
   [ ] Convidar membro da equipe
   [ ] Conectar Instagram
   [ ] Cliente aprovou primeiro post
```

## Billing (Cobrança)

### Opção 1: Stripe (recomendado)
- Checkout embutido, assinatura recorrente
- Portal de gerenciamento do cliente
- Webhook → atualiza plano no Supabase

### Opção 2: Hotmart / Kiwify (alternativa BR)
- Mais fácil pro público brasileiro
- Boleto, Pix, cartão
- Webhook → atualiza plano

### Implementação

```sql
CREATE TABLE subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  provider TEXT,            -- 'stripe', 'hotmart'
  provider_sub_id TEXT,     -- ID da assinatura no provider
  plan TEXT,
  status TEXT,              -- 'active','canceled','past_due','trial'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Feature Gating (Controle de Acesso por Plano)

No código, criar um hook `useFeature`:

```javascript
function useFeature(feature) {
  const org = useOrg(); // contexto da organização
  const plan = org?.plan || 'free';
  const features = org?.features || {};
  
  const PLAN_FEATURES = {
    free:       { clients: 1,  users: 1,  crm: false, whatsapp: false, scheduling: false, whitelabel: false },
    solo:       { clients: 3,  users: 1,  crm: false, whatsapp: false, scheduling: true,  whitelabel: false },
    pro:        { clients: 10, users: 3,  crm: true,  whatsapp: false, scheduling: true,  whitelabel: false },
    business:   { clients: 30, users: 10, crm: true,  whatsapp: true,  scheduling: true,  whitelabel: true  },
    enterprise: { clients: 999,users: 999,crm: true,  whatsapp: true,  scheduling: true,  whitelabel: true  },
  };
  
  return PLAN_FEATURES[plan]?.[feature] ?? features[feature] ?? false;
}

// Uso no código:
const hasCRM = useFeature('crm');
const maxClients = useFeature('clients');

// No menu:
{ hasCRM && <MenuItem k="leads" l="CRM" /> }

// Ao tentar adicionar cliente:
if (clients.length >= maxClients) {
  showUpgradeModal("Upgrade para adicionar mais clientes");
  return;
}
```

## Go-to-Market

### Canal 1: Freemium viral
- Plano gratuito com "Powered by UniqueHub" no app do cliente
- Todo cliente final vê a marca → pergunta pro dono "que app é esse?"
- Link de referral: cada agência ganha 1 mês grátis por indicação

### Canal 2: Conteúdo + SEO
- Blog: "Como organizar aprovação de posts", "CRM para agências"
- YouTube: Tutoriais de uso, cases de sucesso
- Instagram: Before/after de agências que adotaram

### Canal 3: Comunidade
- Grupo no WhatsApp/Discord de agências que usam UniqueHub
- Webinar mensal: "Como fidelizar clientes na agência"
- Template gratuito de contrato que menciona o UniqueHub

### Canal 4: Parcerias
- Cursos de marketing (Comunidade Sobral, V4 Company)
- Plataformas de freelancer (Workana, 99freelas)
- Contadores/escritórios que atendem agências

### Canal 5: Product-Led Growth
- O próprio produto vende: cliente da agência vira agência
- Ex: "Uso o UniqueHub na empresa onde sou cliente → 
  abro minha agência → contrato UniqueHub pra mim"

## Métricas de Sucesso (North Star)

| Métrica | Meta 6 meses | Meta 12 meses |
|---|---|---|
| Orgs cadastradas | 100 | 500 |
| Orgs pagantes | 20 | 100 |
| MRR | R$4.000 | R$25.000 |
| Churn mensal | <8% | <5% |
| NPS | >40 | >50 |
| Clientes finais ativos | 500 | 3.000 |

## Roadmap de Implementação

### FASE 0 — Produto Core (ONDE ESTAMOS HOJE) ✅
- [x] Demandas e aprovação de conteúdo
- [x] Calendário editorial
- [x] Agendamento Instagram
- [x] Assistente IA (GPT-4o, Gemini, Claude)
- [x] Gamificação / Growth Score
- [x] News, Academy, Match4Biz
- [x] Dashboard cliente mobile + desktop
- [x] Financeiro do cliente

### FASE 1 — Fundação SaaS (4-6 semanas)
**Prioridade: fazer o produto vendável**

Semana 1-2: Multi-tenancy
- [ ] Criar tabela `organizations` + `org_members` + `subscriptions`
- [ ] Adicionar `org_id` em todas as tabelas existentes
- [ ] Migrar dados da Unique Marketing para org_id fixo
- [ ] Implementar RLS por org_id em todas as tabelas
- [ ] Custom claims no Supabase Auth (injetar org_id no JWT)

Semana 3: Onboarding + Auth
- [ ] Landing page / site institucional (uniquehub.com.br)
- [ ] Fluxo de signup → criar org → wizard de setup
- [ ] Separar login de "owner/admin" vs "colaborador" vs "cliente"
- [ ] Convite de membros por email

Semana 4: Feature gating + Billing
- [ ] Hook `useFeature` + `useOrg` no código
- [ ] Telas de upgrade (paywall suave)
- [ ] Integração Stripe ou Hotmart
- [ ] Webhook de pagamento → ativar plano

Semana 5-6: White-label básico
- [ ] Logo e cor customizável por org
- [ ] Nome do app customizável (Business+)
- [ ] Domínio customizado via Vercel (Enterprise)
- [ ] "Powered by UniqueHub" no plano Free/Solo

### FASE 2 — Features de Valor (em paralelo ou logo após)
- [ ] CRM de Leads (~2 semanas)
- [ ] WhatsApp Automático (~1.5 semanas)
- [ ] Apresentações / Relatórios automatizados (~1 semana)
- [ ] Pulse Diário de métricas (~1 semana)

### FASE 3 — Escala (mês 3-6)
- [ ] Admin panel UniqueHub (gerenciar todas as orgs)
- [ ] Analytics de uso por org (quem usa o quê)
- [ ] Marketplace de templates (demandas, missões, pipelines)
- [ ] API pública para integrações
- [ ] App nativo (React Native ou PWA otimizado)
- [ ] Internacionalização (EN/ES)

## Decisões Arquiteturais Importantes

### Monolito vs. Separar o código?

**Recomendação: Manter o monolito por agora.**

O UniqueHubApp.jsx com 30k linhas funciona. Reescrever agora seria 
perder meses sem entregar valor. O caminho é:
1. Adicionar a camada de multi-tenancy (org_id + RLS)
2. Manter o código como está
3. Refatorar gradualmente conforme escala demanda

Quando tiver 50+ orgs pagantes, aí sim considerar:
- Separar em módulos/packages
- Extrair componentes compartilhados
- Micro-frontends para features independentes

### Um Supabase ou vários?

**Recomendação: Um só, com RLS.**

Supabase suporta milhares de orgs no mesmo projeto com RLS.
Só separar se atingir limites de performance (>100k rows/tabela 
com queries complexas). O free tier suporta até 500MB de banco.

Quando escalar: migrar para Supabase Pro ($25/mês) que dá 8GB
e backups automáticos.

### Vercel: uma instância ou múltiplas?

**Recomendação: Uma instância com wildcard.**

O mesmo deploy serve todos os clientes. Domínios customizados 
são adicionados como aliases no Vercel. O app detecta o domínio 
no boot e carrega a org correspondente.

## Concorrência e Diferencial

| Concorrente | Foco | Preço | O que falta |
|---|---|---|---|
| mLabs | Agendamento | R$50-250 | Sem CRM, sem aprovação, sem gamificação |
| Etus | Agendamento | R$70-300 | Sem CRM, sem white-label |
| Reportei | Relatórios | R$30-200 | Só relatórios, sem gestão |
| RD Station | Inbound CRM | R$80-800 | Complexo, caro, sem foco em agência |
| Studio | Aprovação | R$100-400 | Só aprovação, sem CRM, sem agendamento |

**Diferencial UniqueHub:**
1. **Tudo em um**: Aprovação + agendamento + CRM + relatórios + gamificação
2. **White-label**: Cliente nunca sabe que é UniqueHub
3. **Gamificação**: Ninguém tem — é o hook de retenção
4. **CRM integrado**: Lead → Venda → ROI, tudo dentro do app
5. **WhatsApp nativo**: Notificações automáticas nos grupos
6. **Preço agressivo**: Plano gratuito pra viralizar

## Projeção Financeira (Cenário Conservador)

### Mês 1-3: Lançamento
- 10 orgs free, 5 solo (R$49), 3 pro (R$149)
- MRR: R$692
- Custo: ~R$100 (Supabase Pro + VPS)

### Mês 4-6: Tração
- 50 orgs free, 15 solo, 8 pro, 2 business (R$349)
- MRR: R$2.625
- Custo: ~R$200

### Mês 7-12: Crescimento
- 200 orgs free, 40 solo, 20 pro, 5 business, 1 enterprise (R$799)
- MRR: R$7.535
- Custo: ~R$500

### Mês 13-24: Escala
- 500 free, 100 solo, 50 pro, 15 business, 3 enterprise
- MRR: R$21.782
- Break-even estimado: mês 4-5 (custo muito baixo)

## Resumo Executivo

**O que é**: Uma plataforma SaaS white-label para agências de marketing 
gerenciarem conteúdo, aprovação, CRM, gamificação e relacionamento com 
clientes — tudo em um app com a marca da agência.

**Para quem**: Agências digitais, gestores de tráfego, criadores de 
conteúdo, franquias e influenciadores.

**Modelo de negócio**: Freemium com planos de R$49 a R$799/mês + add-ons.

**Diferencial**: Único produto que combina aprovação + CRM + gamificação 
+ WhatsApp + white-label a um preço acessível.

**Investimento técnico**: 4-6 semanas para a Fase 1 (multi-tenancy + 
onboarding + billing). Custo de infra: ~R$100-200/mês inicialmente.

**Potencial**: 40.000+ agências no Brasil, 200.000+ gestores de tráfego. 
Capturando 0.1% = 240 clientes pagantes = R$20k+ MRR.

## Arquivos de Referência

- Este plano: `/docs/saas-product-plan.md`
- Plano CRM: `/docs/crm-implementation-plan.md`
- Plano WhatsApp: `/docs/whatsapp-integration-plan.md`
- Spec Apresentações: `/docs/apresentacoes-spec.md`
- Prompt Apresentações: `/docs/apresentacoes-prompt.md`
