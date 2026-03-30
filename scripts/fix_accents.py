#!/usr/bin/env python3
import json, urllib.request

KEY = open("/Users/matheusbahiense/Desktop/uniquehub/.env.local").read().split("VITE_SUPABASE_ANON_KEY=")[1].split("\n")[0].strip()
URL = "https://kyoenyglyayfxtihlewb.supabase.co"

req = urllib.request.Request(f"{URL}/rest/v1/app_settings?key=eq.academy_courses&select=value",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
data = json.loads(urllib.request.urlopen(req).read())
raw = json.loads(data[0]["value"])
text = json.dumps(raw, ensure_ascii=False)

# Word-level replacements (order matters - longer/more specific first)
FIXES = [
    # Ã words
    ("negociacao", "negociação"), ("negociacoes", "negociações"),
    ("indicacao", "indicação"), ("indicacoes", "indicações"),
    ("precificacao", "precificação"),
    ("comunicacao", "comunicação"), ("comunicacoes", "comunicações"),
    ("apresentacao", "apresentação"), ("apresentacoes", "apresentações"),
    ("transformacao", "transformação"), ("transformacoes", "transformações"),
    ("reativacao", "reativação"), ("reativacoes", "reativações"),
    ("objecao", "objeção"), ("objecoes", "objeções"),
    ("decisao", "decisão"), ("decisoes", "decisões"),
    ("acao", "ação"), ("acoes", "ações"),
    ("informacao", "informação"), ("informacoes", "informações"),
    ("situacao", "situação"), ("situacoes", "situações"),
    ("relacao", "relação"), ("relacoes", "relações"),
    ("avaliacao", "avaliação"), ("avaliacoes", "avaliações"),
    ("segmentacao", "segmentação"),
    ("conversao", "conversão"), ("conversoes", "conversões"),
    ("aversao", "aversão"),
    ("concessao", "concessão"), ("concessoes", "concessões"),
    ("interacao", "interação"), ("interacoes", "interações"),
    ("interrupcao", "interrupção"), ("interrupcoes", "interrupções"),
    ("delegacao", "delegação"),
    ("ostentacao", "ostentação"),
    ("priorizacao", "priorização"),
    ("renovacao", "renovação"),
    ("automacao", "automação"),
    ("certificacao", "certificação"), ("certificacoes", "certificações"),
    ("premiacao", "premiação"), ("premiacoes", "premiações"),
    ("classificacao", "classificação"),
    ("comparacao", "comparação"),
    ("operacao", "operação"), ("operacoes", "operações"),
    ("publicacao", "publicação"), ("publicacoes", "publicações"),
    ("producao", "produção"),
    ("preparacao", "preparação"),
    ("satisfacao", "satisfação"),
    ("atencao", "atenção"),
    ("retencao", "retenção"),
    ("prevencao", "prevenção"),
    ("exclusao", "exclusão"),
    ("criacao", "criação"),
    ("escalacao", "escalação"),
    ("solucao", "solução"), ("solucoes", "soluções"),
    ("funcao", "função"), ("funcoes", "funções"),
    ("promocao", "promoção"), ("promocoes", "promoções"),
    ("educacao", "educação"),
    ("execucao", "execução"),
    ("geracao", "geração"),
    ("qualificacao", "qualificação"),
    ("assuncao", "assunção"),
    ("consequencia", "consequência"), ("consequencias", "consequências"),
    ("persistencia", "persistência"),
    ("inconveniencia", "inconveniência"),
    ("experiencia", "experiência"), ("experiencias", "experiências"),
    ("frequencia", "frequência"),
    ("emergencia", "emergência"),
    ("coerencia", "coerência"),
    ("ocorrencia", "ocorrência"), ("ocorrencias", "ocorrências"),
    ("tendencia", "tendência"), ("tendencias", "tendências"),
    ("referencia", "referência"), ("referencias", "referências"),
    ("audiencia", "audiência"),
    ("transparencia", "transparência"),
    ("concorrencia", "concorrência"),
    # É words
    ("voce", "você"), ("tambem", "também"), ("alem", "além"),
    ("ate", "até"), ("apos", "após"),
    ("tres", "três"),
    ("possivel", "possível"), ("possiveis", "possíveis"),
    ("previsivel", "previsível"),
    ("crivel", "crível"),
    ("disponivel", "disponível"), ("disponiveis", "disponíveis"),
    ("responsavel", "responsável"), ("responsaveis", "responsáveis"),
    ("saudavel", "saudável"),
    ("especifico", "específico"), ("especifica", "específica"),
    ("especificos", "específicos"), ("especificas", "específicas"),
    ("diagnostico", "diagnóstico"), ("diagnosticos", "diagnósticos"),
    ("estrategico", "estratégico"), ("estrategica", "estratégica"),
    ("estrategicos", "estratégicos"), ("estrategicas", "estratégicas"),
    ("automatico", "automático"), ("automatica", "automática"),
    ("basico", "básico"), ("basica", "básica"),
    ("unico", "único"), ("unica", "única"),
    ("publico", "público"), ("publica", "pública"),
    ("pratico", "prático"), ("pratica", "prática"),
    ("praticos", "práticos"), ("praticas", "práticas"),
    ("logica", "lógica"),
    ("tecnica", "técnica"), ("tecnicas", "técnicas"),
    ("tecnico", "técnico"),
    ("metrica", "métrica"), ("metricas", "métricas"),
    ("topico", "tópico"), ("topicos", "tópicos"),
    ("implicacao", "implicação"),
    ("proximo", "próximo"), ("proxima", "próxima"),
    ("proximos", "próximos"),
    ("minimo", "mínimo"), ("minima", "mínima"),
    ("maximo", "máximo"), ("maxima", "máxima"),
    ("numero", "número"), ("numeros", "números"),
    ("titulo", "título"),
    ("conteudo", "conteúdo"), ("conteudos", "conteúdos"),
    ("reuniao", "reunião"), ("reunioes", "reuniões"),
    ("visao", "visão"),
    ("padrao", "padrão"), ("padroes", "padrões"),
    ("nao", "não"),
    ("entao", "então"),
    ("sao", "são"),
    ("tambem", "também"),
    ("ja", "já"),
    ("so", "só"),
    ("pos", "pós"),
    ("pre", "pré"),
    ("esta", "está"),
    ("ai", "aí"),
    ("obrigacao", "obrigação"),
    ("rejeicao", "rejeição"),
    ("midia", "mídia"),
    ("valido", "válido"), ("valida", "válida"),
    # Ç words
    ("preco", "preço"), ("precos", "preços"),
    ("servico", "serviço"), ("servicos", "serviços"),
    ("negocio", "negócio"), ("negocios", "negócios"),
    ("inicio", "início"),
    ("exercicio", "exercício"), ("exercicios", "exercícios"),
    ("comercio", "comércio"),
    ("espaco", "espaço"),
    ("endereco", "endereço"),
    ("almoco", "almoço"),
    ("forca", "força"),
    ("confianca", "confiança"),
    ("mudanca", "mudança"), ("mudancas", "mudanças"),
    ("lideranca", "liderança"),
    ("diferenca", "diferença"),
    ("distancia", "distância"),
    ("importancia", "importância"),
    ("urgencia", "urgência"),
    ("influencia", "influência"),
    ("disfarçado", "disfarçado"),
    # Ê/Ô words  
    ("cerebro", "cérebro"),
    ("exito", "êxito"),
    # Other accent patterns
    ("mes", "mês"),
    ("cliente", "cliente"),  # already correct
    ("analise", "análise"),
    ("facil", "fácil"),
    ("dificil", "difícil"),
    ("util", "útil"),
    ("habito", "hábito"), ("habitos", "hábitos"),
    ("ultima", "última"), ("ultimas", "últimas"),
    ("ultimo", "último"), ("ultimos", "últimos"),
    ("obvio", "óbvio"),
    ("necessario", "necessário"), ("necessaria", "necessária"),
    ("contrario", "contrário"),
    ("voluntario", "voluntário"),
    ("calendario", "calendário"),
    ("beneficio", "benefício"), ("beneficios", "benefícios"),
    ("desperdicio", "desperdício"),
    ("orcamento", "orçamento"), ("orcamentos", "orçamentos"),
    ("financeiro", "financeiro"),  # already correct
    ("nivel", "nível"), ("niveis", "níveis"),
    ("duvida", "dúvida"), ("duvidas", "dúvidas"),
    ("periodo", "período"),
    ("medio", "médio"), ("media", "média"),
    ("serio", "sério"),
    ("rapido", "rápido"), ("rapida", "rápida"),
    ("recorrencia", "recorrência"),
    ("consciencia", "consciência"),
    ("eficiencia", "eficiência"),
]

import re

count = 0
for wrong, right in FIXES:
    if wrong == right:
        continue
    # Use word boundary regex to avoid partial matches
    # But be careful: we need case-insensitive for start of sentence
    pattern = re.compile(r'\b' + re.escape(wrong) + r'\b', re.IGNORECASE)
    
    def replace_match(m):
        global count
        original = m.group(0)
        # Preserve original capitalization
        if original[0].isupper():
            result = right[0].upper() + right[1:]
        else:
            result = right
        count += 1
        return result
    
    text = pattern.sub(replace_match, text)

courses_fixed = json.loads(text)
print(f"Total replacements: {count}")

# Upload
payload = json.dumps({"value": json.dumps(courses_fixed, ensure_ascii=False)}).encode("utf-8")
req2 = urllib.request.Request(
    f"{URL}/rest/v1/app_settings?key=eq.academy_courses",
    data=payload,
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
             "Content-Type": "application/json", "Prefer": "return=minimal"},
    method="PATCH"
)
resp = urllib.request.urlopen(req2)
print(f"Upload status: {resp.status}")
print("Done! All accents fixed.")
