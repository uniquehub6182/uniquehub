# Migrações pendentes — RLS Full Enforcement

## Status
**ARQUIVADAS**, validadas via dry-run (com ROLLBACK), **não aplicadas** ainda.

## Quando aplicar
Em horário de baixo uso (madrugada 3-4h da manhã ideal):
- 0 usuários no app
- Cron de publicação não está disparando
- Você está acompanhando logs

## Como aplicar (procedimento seguro)

```bash
# 1. Backup das tabelas afetadas
cd /Users/matheusbahiense/Desktop/uniquehub
mkdir -p ~/Desktop/rls-backup-$(date +%Y%m%d_%H%M)
cd ~/Desktop/rls-backup-*

for tbl in agency_members scheduled_posts demand_steps demand_assignees scheduling traffic campaigns presentations match4biz match4biz_messages match4biz_swipes match4biz_profiles match4biz_credits clients_users credits invoices; do
  npx --prefix /Users/matheusbahiense/Desktop/uniquehub supabase db query "SELECT * FROM public.$tbl" --linked --output csv > $tbl.csv
done

# 2. Backup das policies atuais
npx --prefix /Users/matheusbahiense/Desktop/uniquehub supabase db query "SELECT * FROM pg_policies WHERE schemaname='public'" --linked --output csv > policies_before.csv

# 3. Aplicar migration
cd /Users/matheusbahiense/Desktop/uniquehub
npx supabase db query --linked -f supabase/migrations/_pending/20260503_PREPARE_RLS_FULL.sql

# 4. Validar imediatamente
# - Faça login como contato@uniquemkt.com.br (admin) — deve ver tudo
# - Faça login como cliente do portal — deve ver apenas suas demands
# - Verifique cron logs: tail -f publish-scheduled

# 5. Se algo quebrou, rodar rollback (script no fim do .sql)
```

## Tabelas cobertas (15 + 4 grupos)

### Grupo 1: vazias (zero risco)
- demand_steps, demand_assignees (filtradas via JOIN com demands)
- scheduling, traffic, campaigns, presentations (recebem coluna org_id)
- asaas_customers (legado, bloqueado pra super_admin)
- invoices (recebe org_id)

### Grupo 2: poucas rows
- scheduled_posts (251 rows, 1 org só) — filtrada via JOIN com demands

### Grupo 3: match4biz (feature opcional, vazias)
- match4biz, _messages, _swipes, _profiles, _credits

### Grupo 4: util (custom)
- agency_members (recebe org_id, backfill Unique Marketing)
- clients_users (filtrado via clients.org_id)
- credits (mantém "users see own", admin manage)

## Tabelas DEIXADAS de fora (já estão OK ou em outra fase)
- app_settings, clients, demands, profiles, etc — já estão org-scoped
- transactions — fase 2 (precisa análise de pagamentos)
- role_permissions — leitura aberta intencional
- stripe_events, subscriptions — sem RLS, só service_role acessa via webhook
