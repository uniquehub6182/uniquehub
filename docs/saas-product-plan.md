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

## Conexão de Redes Sociais (Multi-Tenant)

### Como funciona hoje (single-tenant)

```
UniqueHub tem 2 apps no Meta:
  Facebook App (1557196698688426) → publica no Facebook
  Instagram App (1380216083791935) → publica no Instagram
  
Tokens salvos em: social_tokens (tabela no Supabase)
Cada cliente da Unique Marketing conecta via OAuth → token salvo
```

### Como precisa funcionar (multi-tenant)

```
UniqueHub (PLATAFORMA) tem 1 Facebook App verificado
         ↓
   Agência A se cadastra no UniqueHub
         ↓
   Agência A adiciona seu cliente "Pizzaria Bella"
         ↓
   Pizzaria Bella conecta o Instagram DELA via OAuth
   (autoriza o app da UniqueHub a publicar)
         ↓
   Token salvo: org_id=agencia_a, client_id=pizzaria_bella
         ↓
   Agência A agenda post → UniqueHub publica com o token da Pizzaria
```

**O ponto-chave**: O app do Facebook/Instagram é da PLATAFORMA (UniqueHub), 
não de cada agência. Isso é exatamente como Buffer, mLabs, Etus funcionam. 
Uma única app do Meta autorizada, e cada usuário final (cliente da agência) 
faz OAuth pra dar permissão de publicação.

### Arquitetura

```
┌──────────────────────────────────────────────────────────┐
│  Meta Platform                                           │
│                                                          │
│  Facebook App: "UniqueHub" (verificado, tipo Business)   │
│  Permissões: pages_manage_posts, instagram_basic,        │
│              instagram_content_publish, leads_retrieval,  │
│              pages_read_engagement, business_management   │
│                                                          │
│  Redirect URI: https://uniquehub.com.br/auth/meta/cb     │
└─────────────────────────┬────────────────────────────────┘
                          │ OAuth 2.0
      ┌───────────────────┼───────────────────┐
      ▼                   ▼                   ▼
┌───────────┐      ┌───────────┐      ┌───────────┐
│ Agência A │      │ Agência B │      │ Criador C │
│           │      │           │      │           │
│ Client 1 ─┼─token│ Client 1 ─┼─token│ (próprio)─┼─token
│ Client 2 ─┼─token│ Client 2 ─┼─token│           │
│ Client 3 ─┼─token│ Client 3 ─┼─token│           │
└───────────┘      └───────────┘      └───────────┘
```

### Tabela `social_tokens` (atualizada para multi-tenant)

```sql
-- Migrar a tabela existente
ALTER TABLE social_tokens ADD COLUMN org_id UUID REFERENCES organizations(id);

-- Estrutura final
CREATE TABLE social_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  
  -- Qual rede
  platform TEXT NOT NULL,        -- 'instagram', 'facebook', 'tiktok', 'linkedin'
  
  -- Dados da conta conectada
  account_id TEXT,               -- ID da conta na plataforma
  account_name TEXT,             -- Nome/username
  account_avatar TEXT,           -- URL do avatar
  page_id TEXT,                  -- Facebook Page ID (necessário pra Instagram)
  ig_user_id TEXT,               -- Instagram Business Account ID
  
  -- Tokens
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  token_status TEXT DEFAULT 'active',  -- 'active', 'expired', 'revoked'
  
  -- Metadata
  permissions TEXT[],            -- Permissões concedidas
  connected_by TEXT,             -- Quem conectou (email do user)
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  
  UNIQUE(org_id, client_id, platform, account_id)
);

-- RLS
ALTER TABLE social_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON social_tokens
  FOR ALL USING (org_id = (auth.jwt()->>'org_id')::uuid);
```

### Fluxo de Conexão (quem faz o quê)

**Cenário 1: Agência conecta o Instagram do cliente**
```
1. Agência abre UniqueHub → vai no cliente "Pizzaria Bella"
2. Clica "Conectar Instagram"
3. Entra no celular/computador do cliente (ou pede pro cliente fazer)
4. OAuth: Login no Instagram → autoriza o app UniqueHub
5. Callback retorna token → salvo com org_id + client_id
6. Pronto — agência pode agendar posts pro Instagram da Pizzaria
```

**Cenário 2: Cliente conecta ele mesmo (self-service)**
```
1. Cliente abre o app UniqueHub (app do cliente)
2. Em Configurações → "Conectar Instagram"
3. OAuth: Login no Instagram → autoriza
4. Token salvo automaticamente com o org_id da agência + client_id dele
5. Agência já pode publicar sem pedir nada ao cliente
```

**Cenário 3: Criador de conteúdo / influenciador (sem agência)**
```
1. Criador se cadastra no UniqueHub (plano Solo)
2. É ao mesmo tempo "agência" e "cliente" de si mesmo
3. Conecta o próprio Instagram
4. Usa o UniqueHub pra agendar seus posts
```

### O que muda no código atual

Hoje, o OAuth redirect é fixo para a Unique Marketing:
```
redirect_uri: https://uniquehub.com.br/auth/instagram/callback
```

No multi-tenant, o redirect continua o MESMO (é uma limitação do Meta — 
cada app tem URIs fixas), mas o callback precisa saber DE QUAL org veio:

```javascript
// No início do OAuth, salvar no state:
const state = JSON.stringify({ org_id, client_id, platform });
const authUrl = `https://api.instagram.com/oauth/authorize?
  client_id=${INSTAGRAM_APP_ID}
  &redirect_uri=${REDIRECT_URI}
  &scope=instagram_basic,instagram_content_publish
  &response_type=code
  &state=${encodeURIComponent(state)}`;

// No callback:
const { code, state } = queryParams;
const { org_id, client_id, platform } = JSON.parse(state);
// Trocar code por token...
// Salvar com org_id e client_id corretos
```

### Requisito: Verificação do App no Meta

Para que o app da UniqueHub possa ser usado por qualquer pessoa 
(não só a Unique Marketing), o app precisa passar pela 
**App Review do Meta**:

1. **App tipo Business** (já é o caso)
2. **Verificação de negócio** — Precisa verificar a empresa UniqueHub 
   no Meta Business Suite (documento, CNPJ, etc.)
3. **Revisão de permissões** — Submeter cada permissão pra aprovação:
   - `instagram_basic` — Ler dados do perfil
   - `instagram_content_publish` — Publicar posts
   - `pages_manage_posts` — Publicar no Facebook
   - `pages_read_engagement` — Ler métricas
   - `leads_retrieval` — Capturar leads (para o CRM)
   - `business_management` — Gerenciar contas business
4. **Gravação de screencast** — Mostrar como o app usa cada permissão
5. **Política de privacidade** — URL pública com política adequada
6. **Termos de uso** — URL pública

Prazo estimado de aprovação: 2-6 semanas após submissão.

**IMPORTANTE**: Enquanto não for aprovado, o app funciona em 
"Development Mode" — só contas adicionadas como testador podem 
conectar. Ou seja, a Unique Marketing continua funcionando normal, 
mas novos clientes de outras agências precisam esperar a aprovação.

### Estratégia para múltiplas plataformas

O modelo se aplica a qualquer rede social:

| Plataforma | App necessário | Status atual | Esforço |
|---|---|---|---|
| Instagram | Facebook App + Instagram API | ✅ Funcional | Só adaptar OAuth |
| Facebook Pages | Facebook App | ✅ Funcional | Já integrado |
| TikTok | TikTok for Developers App | ❌ Novo | API de publicação disponível |
| LinkedIn | LinkedIn App | ❌ Novo | API de publicação disponível |
| X (Twitter) | Twitter Developer App | ❌ Novo | API v2 disponível |
| YouTube | Google Cloud Project | ❌ Novo | API de upload disponível |
| Pinterest | Pinterest App | ❌ Novo | API de publicação |

Cada plataforma é um "connector" separado. A agência escolhe quais 
plataformas quer usar, e os clientes conectam as contas deles.

**Fase 1**: Instagram + Facebook (já funciona)
**Fase 2**: TikTok + LinkedIn (mais demandados)
**Fase 3**: X + YouTube + Pinterest

### Painel de Conexões na Agência

Nova seção em cada cliente (no painel da agência):

```
┌─────────────────────────────────────────────────┐
│  Pizzaria Bella — Redes Sociais                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  📸 Instagram     @pizzariabella                │
│     ✅ Conectado · Token válido até 12/jun      │
│     Publicar ✓ · Métricas ✓ · Stories ✗        │
│     [Reconectar] [Desconectar]                  │
│                                                 │
│  📘 Facebook     Pizzaria Bella Oficial         │
│     ✅ Conectado · Token válido até 12/jun      │
│     Publicar ✓ · Métricas ✓                    │
│     [Reconectar] [Desconectar]                  │
│                                                 │
│  🎵 TikTok      não conectado                  │
│     [Conectar TikTok]                           │
│                                                 │
│  💼 LinkedIn     não conectado                  │
│     [Conectar LinkedIn]                         │
│                                                 │
│  ── Enviar link para o cliente conectar ──      │
│  O cliente pode conectar pelo próprio app.      │
│  [Copiar link de convite]                       │
│                                                 │
│  ── Health Check ──                             │
│  Última verificação: há 2 horas                 │
│  Próxima: em 4 horas (automático)              │
└─────────────────────────────────────────────────┘
```

### Token Health Check (já existe, adaptar para multi-tenant)

O Edge Function `check-token-health` que já roda a cada 6h via pg_cron
precisa ser adaptado:

```typescript
// Antes (single-tenant):
const { data: tokens } = await supabase
  .from("social_tokens").select("*");

// Depois (multi-tenant):
// Usa service_role key — ignora RLS, checa TODOS os tokens
const { data: tokens } = await supabase
  .from("social_tokens")
  .select("*, organizations(name, plan)")
  .eq("token_status", "active");

// Se token expirado/inválido:
// 1. Marcar como "expired" no banco
// 2. Notificar a agência (org) que o token do cliente X expirou
// 3. Notificar o cliente para reconectar
```
