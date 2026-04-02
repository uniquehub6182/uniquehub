# Especificação: Menu "Apresentações" - UniqueHub Agency

## Contexto
Alice (social media) faz reuniões mensais com clientes para apresentar resultados e campanhas.
Atualmente usa prompts manuais + Canva. Precisamos trazer isso para dentro do UniqueHub.

## Menu
- Menu exclusivo "Apresentações" na barra de navegação da agência
- NÃO é sub-item de Relatórios — é menu separado porque são vários clientes

## Fluxo
1. Selecionar cliente
2. Selecionar modo (Métricas ou Campanhas)
3. Selecionar mês/período
4. [Modo Campanhas] Upload de PDF com calendário de campanhas
5. IA gera a apresentação com base nos dados + prompt estruturado
6. Apresentação renderizada slide-a-slide dentro do UniqueHub
7. Alice revisa, edita se necessário, e apresenta na reunião
8. Salva no Supabase vinculada ao cliente para revisitar depois
9. Exportável como PDF

## Modo 1 - Métricas
Dados puxados automaticamente do sistema:
- Posts publicados no mês (tabela demands)
- Engajamento, alcance, seguidores (Meta API se disponível)
- Comparativo mês anterior
- Top conteúdos
- Growth Score do cliente

Slides: Abertura → Visão geral → Crescimento → Engajamento → Top conteúdos → Tráfego → Análise estratégica → Próximos passos

## Modo 2 - Campanhas
- Upload de PDF com calendário de campanhas
- IA lê o PDF e transforma em apresentação vendedora
Slides: Abertura → Visão estratégica → Campanha 1 → Campanha 2+ → Próximos passos

## Regras visuais
- Fundo escuro + LIME (#C8FF00), estilo agência premium
- Max 6 linhas/slide, frases curtas, números em destaque
- Tom positivo, narrativa de progresso

## Design
- Navegação prev/next, indicador de progresso, fullscreen mode
- Tabela Supabase: presentations (id, client_id, title, type, month, slides JSONB, created_by, created_at)
- IA: Claude API com system prompt da Alice
