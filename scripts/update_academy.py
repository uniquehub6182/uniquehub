#!/usr/bin/env python3
import json, urllib.request

KEY = open("/Users/matheusbahiense/Desktop/uniquehub/.env.local").read().split("VITE_SUPABASE_ANON_KEY=")[1].split("\n")[0].strip()
URL = "https://kyoenyglyayfxtihlewb.supabase.co"

req = urllib.request.Request(f"{URL}/rest/v1/app_settings?key=eq.academy_courses&select=value",
    headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
data = json.loads(urllib.request.urlopen(req).read())
courses = json.loads(data[0]["value"])

CSS = '<style>.lbox{border-radius:12px;padding:16px;margin:12px 0}.lbox-green{background:#ECFDF5;border:1px solid #A7F3D0}.lbox-blue{background:#EFF6FF;border:1px solid #BFDBFE}.lbox-yellow{background:#FFFBEB;border:1px solid #FDE68A}.lbox-red{background:#FEF2F2;border:1px solid #FECACA}.lbox-purple{background:#F5F3FF;border:1px solid #DDD6FE}.lbox-gray{background:#F9FAFB;border:1px solid #E5E7EB}.lbox h4{margin:0 0 8px;font-size:14px;font-weight:800}.lbox p,.lbox li{font-size:13px;line-height:1.7;margin:4px 0}.lbox ul{padding-left:18px;margin:8px 0}'
CSS += '.lstep{display:flex;gap:12px;margin:10px 0;align-items:flex-start}.lstep-n{width:28px;height:28px;border-radius:50%;background:#C8FF00;color:#0D0D0D;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex-shrink:0}.lstep-t{flex:1;font-size:13px;line-height:1.6}'
CSS += '.lcheck{display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:13px;line-height:1.5}.lnocheck{display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:13px;line-height:1.5;color:#991B1B}'
CSS += '.lkey{display:flex;gap:8px;align-items:flex-start;margin:6px 0;font-size:13px;line-height:1.5}'
CSS += '.lquote{border-left:4px solid #C8FF00;padding:12px 16px;margin:12px 0;background:#C8FF0008;font-style:italic;font-size:13px;line-height:1.6;border-radius:0 8px 8px 0}'
CSS += '.lstat{display:inline-flex;flex-direction:column;align-items:center;padding:12px 16px;border-radius:12px;background:#F9FAFB;border:1px solid #E5E7EB;text-align:center;min-width:80px}'
CSS += '.lstat-val{font-size:22px;font-weight:900;color:#10B981}.lstat-label{font-size:9px;color:#6B7280;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px}'
CSS += '.lsep{height:1px;background:#E5E7EB;margin:16px 0}'
CSS += '.ltag{display:inline-block;padding:3px 10px;border-radius:6px;font-size:10px;font-weight:700;margin:2px}.ltag-green{background:#D1FAE5;color:#065F46}.ltag-blue{background:#DBEAFE;color:#1E40AF}.ltag-red{background:#FEE2E2;color:#991B1B}.ltag-yellow{background:#FEF3C7;color:#92400E}</style>'

def B(c,t,b): return f'<div class="lbox lbox-{c}"><h4>{t}</h4>{b}</div>'
def S(items):
    h=""
    for i,x in enumerate(items,1): h+=f'<div class="lstep"><div class="lstep-n">{i}</div><div class="lstep-t">{x}</div></div>'
    return h
def CK(items): return "".join(f'<div class="lcheck">✅ {x}</div>' for x in items)
def NK(items): return "".join(f'<div class="lnocheck">❌ {x}</div>' for x in items)
def KY(items): return "".join(f'<div class="lkey">💡 {x}</div>' for x in items)
def Q(t): return f'<div class="lquote">{t}</div>'
def ST(items):
    h='<div style="display:flex;gap:10px;flex-wrap:wrap;margin:12px 0">'
    for v,l in items: h+=f'<div class="lstat"><span class="lstat-val">{v}</span><span class="lstat-label">{l}</span></div>'
    return h+'</div>'
def SEP(): return '<div class="lsep"></div>'

def set_content(course_id, lesson_id, html):
    for c in courses:
        if c["id"] == course_id:
            for l in c["lessons"]:
                if l["id"] == lesson_id:
                    l["content"] = CSS + html
                    return


# ═══ CURSO 5001: Gatilhos Mentais (8 aulas) ═══

set_content(5001, 50011, f"""
<p>Nosso cerebro toma <strong>95% das decisoes no automatico</strong>. Os gatilhos mentais sao atalhos que ativam esse modo, acelerando a decisao de compra.</p>
{ST([("95%","Decisoes automaticas"),("0.3s","Tempo da 1a impressao"),("70%","Compras por emocao")])}
{SEP()}
{B("blue","Como o cerebro decide comprar?",S([
    "<strong>Cerebro reptiliano</strong> - Avalia risco vs. recompensa em milissegundos. Decide primeiro.",
    "<strong>Sistema limbico</strong> - Processa emocoes. Se a oferta gera desejo ou medo de perder, ele ativa.",
    "<strong>Neocortex</strong> - Racionaliza. So entra DEPOIS. O cliente acha que pensou, mas ja tinha decidido."
]))}
{SEP()}
{B("yellow","Exemplos reais no dia a dia",
  "<p><strong>Amazon:</strong> 'Apenas 2 em estoque' ativa escassez + urgencia ao mesmo tempo.</p>"
  "<p><strong>Apple:</strong> Filas enormes no lancamento criam prova social massiva.</p>"
  "<p><strong>Nubank:</strong> Comecou com convites exclusivos, gerando desejo e curiosidade.</p>"
)}
{B("green","Ponto-chave",KY([
  "O cliente NAO compra pelo produto. Ele compra pela <strong>emocao</strong> que o produto promete.",
  "Se voce entende como o cerebro funciona, para de empurrar venda e comeca a <strong>facilitar a decisao</strong>."
]))}
""")

set_content(5001, 50012, f"""
<p>Escassez e Urgencia geram acao imediata. Quando algo esta acabando ou o tempo se esgotando, o cerebro entra em <strong>modo de aversao a perda</strong>.</p>
{ST([("2x","Medo de perder vs desejo de ganhar"),("6x","Aumento de conversao")])}
{SEP()}
{B("red","Principio da aversao a perda",
  "<p>Daniel Kahneman (Nobel de Economia) provou: <strong>a dor de perder R$ 100 e 2x maior que a alegria de ganhar R$ 100</strong>. Por isso, 'ultimas vagas' funciona melhor que 'vagas disponiveis'.</p>"
)}
{B("blue","Tipos de Escassez",S([
  "<strong>De quantidade</strong> - 'Ultimas 3 unidades' / 'Restam 2 vagas'. Use quando o estoque e REALMENTE limitado.",
  "<strong>De acesso</strong> - 'Exclusivo para os primeiros 50'. Use para lancar produtos novos.",
  "<strong>De edicao</strong> - 'Versao limitada' / 'So nesta temporada'. Para produtos sazonais."
]))}
{B("blue","Tipos de Urgencia",S([
  "<strong>Por data</strong> - 'Ate sexta-feira'. O prazo PRECISA ser real.",
  "<strong>Por evento</strong> - 'Antes do reajuste de abril' / 'Enquanto durar o estoque'.",
  "<strong>Por bonus</strong> - 'Quem fechar esta semana ganha X de brinde'. O brinde some depois."
]))}
{SEP()}
{B("red","ERROS que destroem credibilidade",NK([
  "'Ultimas unidades!' toda semana. O cliente percebe e perde confianca.",
  "Prorrogar o prazo depois de dizer que acabou. Mata a urgencia pra sempre.",
  "Criar escassez de algo que claramente nao e escasso."
]))}
{B("green","Templates prontos para usar",
  '<p><strong>WhatsApp:</strong> "Oi [nome], a condicao especial que conversamos vence na sexta. Depois, o valor volta ao normal. Quer garantir?"</p>'
  '<p><strong>Instagram:</strong> "ULTIMAS HORAS | Condicao exclusiva pra quem fechar hoje. Amanha o valor muda."</p>'
)}
""")

print("5001 lessons 1-2 done")

set_content(5001, 50013, f"""
<p>Quando <strong>90% das pessoas olham avaliacoes antes de comprar</strong>, quem nao tem prova social perde a venda antes de comecar.</p>
{ST([("90%","Olham avaliacoes"),("72%","Confiam em reviews online"),("4.2+","Nota minima pra confiar")])}
{SEP()}
{B("blue","3 tipos de prova social",S([
  "<strong>Depoimentos individuais</strong> - Nome, foto, resultado concreto. 'Aumentei 40% as vendas em 60 dias' vale mais que 'recomendo!'",
  "<strong>Numeros e dados</strong> - '+500 clientes atendidos', '98% de satisfacao'. Quanto mais especifico, mais crivel.",
  "<strong>Midia e logos</strong> - Empresas que voce atendeu, veiculos que te mencionaram, certificacoes."
]))}
{B("green","Script para coletar depoimentos poderosos","<p>Envie estas 3 perguntas para seus melhores clientes:</p>"+S([
  '"Como estava sua situacao ANTES de trabalhar comigo?"',
  '"O que mudou de concreto DEPOIS? (numeros, resultados)"',
  '"O que diria para alguem considerando contratar esse servico?"'
])+"<p>Essas 3 respostas geram um depoimento com narrativa completa: problema, transformacao e recomendacao.</p>")}
{B("yellow","Dica: organize por objecao",
  "<p>Objecao 'ta caro' -> depoimento sobre retorno do investimento</p>"
  "<p>Objecao 'nao funciona' -> depoimento com resultados em numeros</p>"
  "<p>Objecao 'nao tenho tempo' -> depoimento de cliente ocupado que conseguiu</p>"
)}
""")

set_content(5001, 50014, f"""
<p>Autoridade e reciprocidade constroem a base para vendas recorrentes. Trabalham no medio e longo prazo.</p>
{SEP()}
{B("purple","Construindo autoridade sem ser arrogante",S([
  "<strong>Compartilhe dados e pesquisas</strong> - Cite fontes, mostre numeros. Quem cita dados demonstra estudo.",
  "<strong>Mostre bastidores</strong> - Seu processo, ferramentas, decisoes. Transparencia gera confianca.",
  "<strong>Ensine de graca</strong> - Quando ensina algo valioso sem cobrar, o cliente pensa 'se o gratis e tao bom, imagina o pago'.",
  "<strong>Use certificacoes</strong> - Mencione de forma natural, sem ostentacao."
]))}
{B("green","Reciprocidade: dar primeiro",KY([
  "Envie um diagnostico gratuito antes de oferecer a consultoria",
  "Mande um artigo relevante pro negocio do prospect sem pedir nada",
  "Ofereca amostra, periodo de teste ou demonstracao real",
  "De feedback genuino sobre o negocio dele, nao um pitch disfarçado"
]))}
{Q("Quando voce entrega valor ANTES de pedir a venda, o cliente sente uma obrigacao natural de retribuir. Isso e reciprocidade.")}
""")

print("5001 lessons 3-4 done")

set_content(5001, 50015, f"""
<p>O preco NUNCA e caro ou barato sozinho. Ele e sempre <strong>relativo a uma referencia</strong>. A ancoragem controla QUAL referencia o cliente usa.</p>
{SEP()}
{B("blue","A estrategia dos 3 pacotes",S([
  "<strong>Premium (ancora alta)</strong> - O mais completo e caro. Existe pra fazer o intermediario parecer bom negocio. Ex: R$ 3.500/mes",
  "<strong>Recomendado</strong> - Melhor custo-beneficio. 60-70% dos clientes fecham aqui. Ex: R$ 2.200/mes",
  "<strong>Basico (ancora baixa)</strong> - Limitado demais pra ser atraente. Ex: R$ 1.200/mes"
])+Q("Sempre apresente do mais caro pro mais barato. O cerebro ancora no primeiro numero que ve."))}
{B("yellow","Ancorando no prejuizo",
  '<p>Em vez de justificar SEU preco, mostre quanto o cliente PERDE sem sua solucao:</p>'
  '<p>"Voce perde em media 5 clientes por mes por falta de follow-up. Com ticket de R$ 800, sao R$ 4.000/mes perdidos. Meu servico custa R$ 1.500 - voce recupera com 2 clientes."</p>'
)}
{B("purple","Cases reais",
  "<p><strong>Dentista:</strong> De 'limpeza R$ 150' para 3 pacotes. Ticket medio foi de R$ 150 para R$ 480.</p>"
  "<p><strong>Consultora RH:</strong> De R$ 200/hora para projeto fixo de R$ 15.000 entregando o mesmo trabalho.</p>"
)}
""")

set_content(5001, 50016, f"""
<p>Dados convencem, mas historias VENDEM. O cerebro humano processa narrativas <strong>22x melhor</strong> do que fatos isolados.</p>
{ST([("22x","Memorabilidade de historias vs dados"),("65%","Lembram da historia"),("5%","Lembram da estatistica")])}
{SEP()}
{B("blue","Framework: Antes - Conflito - Transformacao",S([
  "<strong>ANTES</strong> - Descreva a situacao do cliente antes de encontrar voce. Dores, frustracao, prejuizo.",
  "<strong>CONFLITO</strong> - O momento de virada. O que fez ele buscar solucao? Qual era o risco de nao agir?",
  "<strong>TRANSFORMACAO</strong> - Resultados concretos. Numeros, emocoes, mudanca de vida/negocio."
]))}
{B("green","Exemplo pratico",
  '<p><strong>Errado:</strong> "Oferecemos consultoria financeira com 15 anos de experiencia."</p>'
  '<p><strong>Certo:</strong> "O Carlos tinha uma oficina mecanica que faturava R$ 40 mil/mes mas nao sobrava nada. Em 90 dias, reorganizamos o financeiro e ele passou a guardar R$ 8 mil/mes sem mudar o faturamento. Hoje ele esta reformando a oficina com dinheiro proprio."</p>'
)}
{Q("Toda venda e uma historia onde o cliente e o heroi e voce e o guia que o ajuda a vencer.")}
""")

print("5001 lessons 5-6 done")

set_content(5001, 50017, f"""
<p>Quando alguem diz um 'sim' pequeno, fica psicologicamente comprometido a dizer 'sim' grande. Principio do <strong>Compromisso e Coerencia</strong> de Cialdini.</p>
{SEP()}
{B("blue","Micro-compromissos estrategicos",S([
  "<strong>Perguntas que levam a 'sim'</strong> - 'Voce concorda que perder clientes por falta de follow-up e um problema?' (sim) 'E se eu te mostrasse como resolver isso em 30 dias?' (sim) 'Vamos agendar 20 minutos pra eu te mostrar como?' (sim!)",
  "<strong>Acoes gratuitas que comprometem</strong> - Diagnosticos, testes, formularios de interesse. Quem preenche ja se comprometeu.",
  "<strong>Formularios como ferramenta de venda</strong> - Pesquisas de interesse nao sao so pra coletar dados, sao pra criar compromisso.",
  "<strong>Tecnica do Pe na Porta</strong> - Peca algo pequeno primeiro (uma opiniao, um feedback), depois avance para o pedido grande (a venda)."
]))}
{B("green","Na pratica",
  '<p><strong>Exemplo restaurante:</strong> "Voce gostaria de experimentar nossa sobremesa premiada?" (sim) "Quer a versao com calda extra?" (sim) Resultado: vendeu o item mais caro do cardapio.</p>'
  '<p><strong>Exemplo consultor:</strong> "Posso te mandar um checklist gratuito?" (sim) "Quer que eu revise o resultado com voce?" (sim) "Vamos estruturar um plano completo?" (sim = venda fechada)</p>'
)}
""")

set_content(5001, 50018, f"""
<p>Agora que voce conhece os gatilhos, e hora de <strong>combina-los em scripts prontos</strong>. Cada script abaixo usa 2-3 gatilhos simultaneamente.</p>
{SEP()}
{B("green","10 Scripts prontos para usar",S([
  '<strong>Prospeccao fria (WhatsApp)</strong><br>"Oi [nome], vi que voce trabalha com [area]. Fiz um diagnostico rapido e identifiquei 3 oportunidades que podem aumentar seu faturamento. Posso te mandar? Sem compromisso." <em>(Reciprocidade + Curiosidade)</em>',
  '<strong>Follow-up sem resposta</strong><br>"[Nome], sei que a rotina e corrida. So queria avisar que reservei sua condicao especial ate sexta, depois nao consigo manter. Se fizer sentido, me avisa." <em>(Urgencia + Exclusividade)</em>',
  '<strong>Proposta com ancoragem</strong><br>"Temos 3 formatos: o Completo (R$ X), o Profissional (R$ Y) que e o mais escolhido, e o Essencial (R$ Z). Qual faz mais sentido pra voce?" <em>(Ancoragem + Prova Social)</em>',
  '<strong>Resposta pra "ta caro"</strong><br>"Entendo. Me diz: quanto voce estima que perde por mes sem resolver [problema]? Geralmente meus clientes calculam entre R$ X e R$ Y. O investimento se paga em [tempo]." <em>(Ancoragem no prejuizo + Prova Social)</em>',
  '<strong>Reativacao de cliente sumido</strong><br>"Oi [nome], lembrei de voce porque acabei de ajudar um cliente do mesmo setor a [resultado concreto]. Achei que poderia te interessar. Posso te contar como fizemos?" <em>(Prova Social + Reciprocidade)</em>'
]))}
{B("yellow","Dica final",KY([
  "Nunca use mais de 3 gatilhos por mensagem. Fica artificial.",
  "Adapte o tom ao seu publico. Esses scripts sao base, personalize!",
  "Teste e meça. O que funciona pra um negocio pode nao funcionar pra outro."
]))}
""")

print("5001 COMPLETE (8 lessons)")

# ═══ CURSO 5002: Recuperar Clientes (6 aulas) ═══

set_content(5002, 50021, f"""
<p>Antes de recuperar, voce precisa entender <strong>POR QUE</strong> perdeu. Em 70% dos casos nao e preco.</p>
{ST([("70%","Nao e por preco"),("5min","Tempo maximo de resposta"),("80%","Somem por falta de follow-up")])}
{SEP()}
{B("blue","5 motivos reais por que clientes somem",S([
  "<strong>Voce demorou pra responder</strong> e ele fechou com outro. No WhatsApp, mais de 5 minutos ja e demora.",
  "<strong>Ele nao entendeu o valor</strong>, so viu preco. Sua apresentacao falhou.",
  "<strong>A experiencia foi confusa</strong> ou burocratica. Muitas etapas, pouca clareza.",
  "<strong>Ele simplesmente esqueceu</strong>. Sem follow-up, voce desapareceu da mente dele.",
  "<strong>Algo mudou na vida dele</strong>. Orcamento apertou, prioridade mudou, timing errado."
]))}
{B("green","Diagnostico rapido",
  "<p>Pra cada cliente perdido, pergunte: 'De 1 a 5, qual desses motivos se aplica?' Isso define qual estrategia usar na recuperacao.</p>"
)}
""")

set_content(5002, 50022, f"""
<p>Existe uma linha entre persistencia e inconveniencia. Aqui esta o <strong>Calendario de Follow-up Perfeito</strong>:</p>
{SEP()}
{B("blue","Sequencia ideal de follow-up",S([
  "<strong>Dia 1 (apos contato):</strong> Mensagem de agradecimento + resumo do que conversaram",
  "<strong>Dia 3:</strong> Envie conteudo de valor relacionado ao problema dele (artigo, dado, dica)",
  "<strong>Dia 7:</strong> Check-in casual. 'Oi [nome], surgiu alguma duvida sobre o que conversamos?'",
  "<strong>Dia 14:</strong> Nova abordagem com angulo diferente. Um case de sucesso parecido, por exemplo.",
  "<strong>Dia 30:</strong> Ultima tentativa com oferta especial ou nova condicao."
]))}
{Q("Regra de ouro: cada follow-up precisa agregar algo novo. Nunca mande 'Oi, viu meu orcamento?'")}
{B("red","O que NUNCA fazer",NK([
  "Mandar a mesma mensagem repetida 3 vezes",
  "Ligar sem avisar num horario inconveniente",
  "Fazer pressao emocional ('preciso muito dessa venda')",
  "Falar mal do concorrente se ele fechou com outro"
]))}
""")

set_content(5002, 50023, f"""
<p>8 scripts de reativacao testados e aprovados. Cada um funciona melhor pra um tipo de situacao.</p>
{SEP()}
{B("green","Scripts de reativacao",S([
  '<strong>O Curioso</strong><br>"Oi [nome], descobri algo sobre [area dele] que pode mudar sua estrategia. Posso te mandar?" <em>Funciona porque gera curiosidade irresistivel.</em>',
  '<strong>O Valor</strong><br>"[Nome], fiz um [checklist/guia/diagnostico] sobre [tema relevante]. Lembrei de voce. Posso enviar?" <em>Entrega valor sem pedir nada.</em>',
  '<strong>O Exclusivo</strong><br>"Oi [nome], estou com uma condicao especial so pra quem ja conversou comigo antes. Valida ate [data]. Interesse?" <em>Exclusividade + Urgencia.</em>',
  '<strong>O Honesto</strong><br>"[Nome], notei que nao avancamos na epoca. Sem problema! Mas fiquei curioso: o que pesou na decisao? Me ajuda a melhorar." <em>Humildade desarma.</em>',
  '<strong>O Social</strong><br>"Oi [nome], acabei de entregar um projeto pro [empresa similar] e o resultado foi [X]. Lembrei da nossa conversa. Quer saber como fizemos?" <em>Prova social + Curiosidade.</em>'
]))}
""")

print("5002 lessons 1-3 done")

set_content(5002, 50024, f"""
<p>Perdeu o cliente pro concorrente? <strong>68% dos que trocam de fornecedor se arrependem nos primeiros 6 meses.</strong></p>
{ST([("68%","Se arrependem em 6 meses"),("40%","Voltariam se abordados"),("3x","Mais barato reconquistar do que conquistar novo")])}
{SEP()}
{B("blue","Estrategia de reconquista",S([
  "<strong>Monitore sinais de insatisfacao</strong> - Reclamacoes nas redes, mudancas de tom, feedback publico negativo.",
  "<strong>Espere o momento certo</strong> - Nao aborde na semana que ele saiu. Espere 60-90 dias.",
  "<strong>Nunca fale mal do concorrente</strong> - 'Estou feliz que voce encontrou uma boa opcao. Se precisar, estou aqui.'",
  "<strong>Oferta de retorno</strong> - Condicoes especiais de 'bem-vindo de volta' sao muito eficazes."
]))}
{B("green","Case real",
  "<p>Empresa de TI perdeu 15 clientes em 6 meses. Aplicou essas tecnicas: email personalizado no dia 90 + ligacao no dia 100 + oferta especial no dia 120. <strong>Resultado: 12 de 15 clientes voltaram.</strong></p>"
)}
""")

set_content(5002, 50025, f"""
<p>O melhor follow-up e o que voce <strong>nao precisa fazer</strong> porque o cliente nunca sumiu.</p>
{SEP()}
{B("green","Sistema Anti-Sumico",S([
  "<strong>Calendario de touchpoints</strong> - Check-ins programados a cada 30/60/90 dias ANTES que o cliente esfrie.",
  "<strong>Conteudo de valor automatico</strong> - Envie novidades, dicas e insights relevantes pro negocio dele regularmente.",
  "<strong>Pesquisa NPS trimestral</strong> - 'De 0 a 10, quanto nos indicaria?' Detecta insatisfacao antes que vire cancelamento.",
  "<strong>Programa de indicacao</strong> - Clientes engajados indicam e ficam. E uma via de mao dupla.",
  "<strong>Comunicacao de novidades</strong> - Faca o cliente sentir que esta evoluindo COM voce."
]))}
{B("yellow","Template de CRM manual",
  "<p>Se voce nao tem sistema, use uma planilha com 4 colunas:</p>"
  "<p><strong>Cliente</strong> | <strong>Ultimo contato</strong> | <strong>Proximo touchpoint</strong> | <strong>Status</strong></p>"
  "<p>Revise toda segunda-feira. Quem tem 'proximo touchpoint' esta semana, recebe contato.</p>"
)}
""")

set_content(5002, 50026, f"""
<p>Plano de 30 dias para reativar <strong>no minimo 10 clientes inativos</strong>. 100% pratico.</p>
{SEP()}
{B("blue","Semana 1: Mapeamento",
  "<p>Liste todos os clientes que nao compram ha mais de 90 dias. Classifique cada um:</p>"+CK([
  "Potencial alto + motivo claro = prioridade 1",
  "Potencial medio + sem motivo aparente = prioridade 2",
  "Potencial baixo ou motivo irrecuperavel = descartar por agora"
]))}
{B("green","Semana 2: Primeira onda",
  "<p>Envie a primeira mensagem de reativacao (scripts da Aula 3) para os prioridade 1 e 2. <strong>Registre quem respondeu.</strong></p>"
)}
{B("yellow","Semana 3: Segunda abordagem",
  "<p>Para quem NAO respondeu: mude o angulo. Se mandou 'O Curioso', agora mande 'O Social'. Para quem respondeu: agende reuniao/chamada.</p>"
)}
{B("purple","Semana 4: Fechamento",
  "<p>Terceira tentativa para os restantes com oferta especial. Foque energia em fechar com quem demonstrou interesse. <strong>Meta: 10 reativacoes.</strong></p>"
)}
{ST([("10+","Meta de reativacoes"),("30","Dias de execucao"),("3","Ondas de contato")])}
""")

print("5002 COMPLETE (6 lessons)")

# ═══ CURSO 5003: Atendimento que Vende (5 aulas) ═══

set_content(5003, 50031, f"""
<p>No digital, voce nao tem aperto de mao. Tem a <strong>primeira mensagem</strong>. E ela decide tudo.</p>
{ST([("5min","Tempo maximo de resposta no WhatsApp"),("80%","Vendas perdidas no atendimento"),("3s","Pra causar primeira impressao")])}
{SEP()}
{B("red","Mensagens que AFASTAM o cliente",NK([
  "'Ola, tudo bem? Em que posso ajudar?' (generica demais, nao gera conversa)",
  "'Segue nosso catalogo em PDF' (sem entender o que ele quer)",
  "'Vou verificar e retorno' (e nunca retorna)",
  "Demora de horas pra responder a primeira mensagem"
]))}
{B("green","Mensagens que ENGAJAM",CK([
  "'Oi [nome]! Vi que voce se interessou por [produto]. O que te chamou atencao?' (personalizada + gera conversa)",
  "'Que bom ter voce aqui, [nome]! Pra te indicar o melhor caminho, me conta: [pergunta especifica]?'",
  "'[Nome], recebi sua mensagem! Vou te ajudar. Primeiro: qual e seu principal objetivo com [servico]?'"
]))}
""")

set_content(5003, 50032, f"""
<p>O cliente diz que quer A, mas na verdade precisa de B. A tecnica <strong>SPIN Selling</strong> simplificada te ajuda a descobrir.</p>
{SEP()}
{B("blue","SPIN Selling em 4 passos",S([
  "<strong>S - Situacao</strong>: Entenda o contexto. 'Me conta como funciona seu processo de vendas hoje?'",
  "<strong>P - Problema</strong>: Identifique a dor. 'Qual o maior desafio que voce enfrenta hoje com isso?'",
  "<strong>I - Implicacao</strong>: Mostre o custo. 'Quanto voce estima que isso te custa por mes?'",
  "<strong>N - Need-payoff</strong>: Ele diz que precisa. 'Se voce conseguisse resolver isso, qual seria o impacto no seu negocio?'"
]))}
{Q("O segredo e fazer o CLIENTE dizer que precisa da solucao. Voce so faz as perguntas certas.")}
{B("green","15 perguntas poderosas (adapte ao seu negocio)",
  "<p>1. 'Qual seu maior desafio hoje com [area]?'</p>"
  "<p>2. 'O que ja tentou pra resolver?'</p>"
  "<p>3. 'Como isso impacta no dia a dia da empresa?'</p>"
  "<p>4. 'Se pudesse mudar UMA coisa, o que seria?'</p>"
  "<p>5. 'Quanto tempo/dinheiro voce estima que perde com esse problema?'</p>"
)}
""")

set_content(5003, 50033, f"""
<p>Toda objecao e um <strong>pedido de mais informacao disfarçado</strong>. Nao e um 'nao', e um 'me convenca'.</p>
{SEP()}
{B("yellow","As 5 objecoes mais comuns (com respostas)",S([
  '<strong>"Ta caro"</strong><br>Nunca justifique o preco. Mude pra valor: "Entendo. Me conta: quanto voce perde por mes sem resolver [problema]? Geralmente o investimento se paga em [tempo]."',
  '<strong>"Vou pensar"</strong><br>"Claro! Pra te ajudar a pensar: qual parte ficou em duvida? Posso esclarecer agora mesmo."',
  '<strong>"Preciso falar com meu socio"</strong><br>"Perfeito! Quer que eu prepare um resumo pros pontos que ele vai perguntar? Assim facilita a conversa de voces."',
  '<strong>"Manda orcamento por email"</strong><br>"Mando sim! Mas antes: o que e mais importante pra voce? Assim personalizo a proposta e nao fica generico."',
  '<strong>"Conheço alguem que faz mais barato"</strong><br>"E normal ter opcoes. Me diz: alem do preco, o que mais pesa na sua decisao? Qualidade? Prazo? Suporte?"'
]))}
{B("green","Regra de ouro",KY(["Objecao = oportunidade de conversa. Cada 'nao' te aproxima do 'sim' se voce souber ouvir."]))}
""")

print("5003 lessons 1-3 done")

set_content(5003, 50034, f"""
<p>A venda nao acaba quando o cliente paga. Ela <strong>COMECA</strong>. Pos-venda bem feito gera recompra, indicacao e blindagem contra concorrente.</p>
{SEP()}
{B("green","Sequencia de pos-venda em 4 mensagens",S([
  "<strong>Dia 1 (pos-compra):</strong> Mensagem de boas-vindas. 'Seja bem-vindo! Estamos animados em trabalhar com voce. Qualquer duvida, estou aqui.'",
  "<strong>Dia 7:</strong> Check-in de satisfacao. 'Oi [nome], como esta sendo a experiencia ate agora? Tudo fluindo bem?'",
  "<strong>Dia 15:</strong> Pedido de avaliacao. 'Sua opiniao e super importante. Pode me dar um feedback rapido sobre como tem sido?'",
  "<strong>Dia 30:</strong> Oferta complementar. 'Baseado no que conversamos, acho que [servico X] pode complementar bem. Quer saber mais?'"
]))}
{B("yellow","Case real",
  "<p>Empresa de software implementou apenas essas 4 mensagens automaticas. <strong>Resultado: +40% de recompra em 90 dias.</strong> O segredo nao e a mensagem, e o fato de ALGUEM se importar em perguntar.</p>"
)}
""")

set_content(5003, 50035, f"""
<p>Nesta aula voce constroi seu <strong>Manual de Atendimento</strong> completo. Template pronto pra preencher.</p>
{SEP()}
{B("blue","6 secoes do manual",S([
  "<strong>Tom e linguagem</strong> - Como sua empresa fala? Formal, descontraida, tecnica? Defina e documente.",
  "<strong>20 respostas padrao</strong> - As 20 perguntas mais frequentes com respostas prontas e personalizaveis.",
  "<strong>Fluxo de atendimento</strong> - Do primeiro contato ao pos-venda: cada etapa com responsavel e prazo.",
  "<strong>Regras de tempo</strong> - WhatsApp: 5min. Email: 2h. DM: 1h. Telefone: retornar no mesmo dia.",
  "<strong>Protocolo de escalacao</strong> - Quando e como passar o atendimento pra outro nivel ou pessoa.",
  "<strong>Checklist de qualidade</strong> - Antes de enviar: tem nome do cliente? Tom esta certo? Respondeu a pergunta?"
]))}
{Q("Um bom manual de atendimento nao engessa. Ele liberta. Porque ninguem perde tempo pensando no basico e foca no que realmente importa: a relacao com o cliente.")}
""")

print("5003 COMPLETE (5 lessons)")

# ═══ CURSO 5004: Negociacao Inteligente (5 aulas) ═══

set_content(5004, 50041, f"""
<p>O maior inimigo da sua negociacao e <strong>voce mesmo</strong>. A maioria oferece desconto ANTES do cliente pedir.</p>
{ST([("62%","Dao desconto sem o cliente pedir"),("35%","Receita perdida em descontos desnecessarios")])}
{SEP()}
{B("red","Sindromes que fazem voce vender barato",NK([
  "Sindrome do impostor: 'Sera que meu trabalho vale isso mesmo?'",
  "Medo da rejeicao: 'Se eu cobrar mais, ele nao vai fechar'",
  "Comparacao com mercado: 'O concorrente cobra menos'",
  "Ansiedade: oferecer desconto no primeiro sinal de hesitacao"
]))}
{B("green","Reprogramacao de mentalidade",CK([
  "Calcule o valor REAL que voce entrega (economiza X, gera Y, evita Z)",
  "Compare com o custo de NAO ter seu servico",
  "Lembre: dar desconto treina o cliente a SEMPRE pedir desconto",
  "Pergunte: 'Se eu fosse meu proprio cliente, pagaria esse preco?' Se sim, mantenha."
]))}
""")

set_content(5004, 50042, f"""
<p>Negociadores amadores improvisam. <strong>Profissionais se preparam.</strong> 80% da negociacao acontece antes da reuniao.</p>
{SEP()}
{B("blue","Checklist de preparacao",S([
  "<strong>Pesquise o cliente</strong> - Faturamento estimado, concorrentes, dores publicas, redes sociais.",
  "<strong>Defina seu BATNA</strong> - Melhor Alternativa se nao fechar. Se voce tem outras opcoes, negocia melhor.",
  "<strong>Estabeleca 3 faixas</strong> - Ideal (o que voce quer), Aceitavel (minimo bom), Limite (abaixo disso, nao vale).",
  "<strong>Prepare 3 concessoes</strong> - Coisas que custam pouco pra voce mas valem muito pro cliente.",
  "<strong>Antecipe 5 objecoes</strong> - E prepare respostas pra cada uma."
]))}
{Q("Preencha esse checklist em 15 minutos antes de qualquer reuniao. E o investimento de tempo com maior retorno que existe.")}
""")

print("5004 lessons 1-2 done")

set_content(5004, 50043, f"""
<p>7 tecnicas de negociacao que funcionam em qualquer contexto. Cada uma com exemplos praticos.</p>
{SEP()}
{B("blue","Tecnicas essenciais",S([
  "<strong>Espelhamento</strong> - Repita as ultimas palavras do cliente. Ele se sente ouvido e continua falando. 'Entao voce precisa de mais agilidade...' 'Isso, agilidade e fundamental porque...'",
  "<strong>Rotulo emocional</strong> - 'Parece que o mais importante pra voce e seguranca.' Mostra empatia e faz ele confirmar a prioridade.",
  "<strong>Silencio estrategico</strong> - Depois de apresentar o preco, CALE-SE e espere. O primeiro que fala, perde.",
  "<strong>Concessao condicional</strong> - 'Consigo fazer X SE voce fechar ate sexta.' Nunca de nada de graca.",
  "<strong>Reenquadramento</strong> - De custo mensal para custo por dia. 'R$ 2.400/mes' vira 'R$ 80/dia, menos que um almoco de negocios.'",
  "<strong>Ancoragem alta</strong> - Sempre apresente o pacote mais caro primeiro.",
  "<strong>Pergunta reversa</strong> - 'Como eu posso fazer isso funcionar pra voce?' Transfere a negociacao pro cliente."
]))}
""")

set_content(5004, 50044, f"""
<p>O momento do fechamento e onde <strong>60% dos vendedores travam</strong>. 5 tecnicas pra ouvir o 'sim'.</p>
{SEP()}
{B("green","5 tecnicas de fechamento",S([
  '<strong>Fechamento por alternativa</strong> - "Prefere o pacote A ou B?" Nunca pergunte "quer contratar?"',
  '<strong>Fechamento por resumo</strong> - Recapitule tudo que ele ganha e pergunte "faz sentido pra voce?"',
  '<strong>Fechamento por urgencia</strong> - "Essa condicao vale ate sexta porque o fornecedor reajusta depois."',
  '<strong>Fechamento por assuncao</strong> - Trate como fechado: "Vou preparar o contrato pra comecarmos segunda."',
  '<strong>Fechamento por consequencia</strong> - "Se comecarmos agora, em 60 dias voce ja vai ter X resultado."'
]))}
{B("yellow","Quando usar cada um",
  "<p>Cliente decidido mas indeciso sobre opcao -> <strong>Alternativa</strong></p>"
  "<p>Cliente que ja disse varios 'sim' pequenos -> <strong>Assuncao</strong></p>"
  "<p>Cliente que procrastina -> <strong>Urgencia</strong></p>"
  "<p>Cliente analitico que precisa de logica -> <strong>Resumo</strong></p>"
  "<p>Cliente emocional que quer resultado -> <strong>Consequencia</strong></p>"
)}
""")

set_content(5004, 50045, f"""
<p>Negociar por texto e diferente. Voce perde tom de voz, expressao facial e timing.</p>
{SEP()}
{B("blue","Regras do digital",S([
  "<strong>Se tem mais de 3 idas e vindas, ligue.</strong> Texto vira pingue-pongue e perde forca.",
  "<strong>Use audio no WhatsApp</strong> pra humanizar sem ser informal. Maximo 1 minuto.",
  "<strong>Formatacao importa</strong> - Negrito nos beneficios, listas pra valores, espaco entre blocos.",
  "<strong>Nunca mande proposta sem contexto</strong> - 'Segue orcamento' frio nao funciona. Recapitule antes."
]))}
{B("green","5 templates de fechamento por WhatsApp",
  '<p>1. "Oi [nome], recapitulando: [beneficio 1], [beneficio 2] e [beneficio 3] por [valor]. Faz sentido pra voce? Se sim, ja preparo tudo pra comecarmos!"</p>'
  '<p>2. "[Nome], pensei na nossa conversa e consigo incluir [bonus] se fecharmos ate [data]. O que acha?"</p>'
  '<p>3. "Vi que voce ficou interessado no [pacote]. Nesse formato, o investimento e de [valor diluido] por dia. Quer seguir?"</p>'
)}
""")

print("5004 COMPLETE (5 lessons)")

# ═══ CURSO 5005: Gestao do Tempo (5 aulas) ═══

set_content(5005, 50051, f"""
<p>Voce e <strong>ocupado</strong> ou <strong>produtivo</strong>? 90% dos empreendedores confundem os dois.</p>
{ST([("80%","Do tempo em tarefas que nao geram receita"),("20%","Das atividades geram 80% dos resultados"),("14h","Media de horas trabalhadas sem resultado")])}
{SEP()}
{B("red","Atividades que PARECEM importantes mas nao sao",NK([
  "Responder emails e mensagens o dia todo (reativo, nao produtivo)",
  "Reunioes sem pauta definida (perda de tempo coletiva)",
  "Apagar incendios que poderiam ser prevenidos com processo",
  "Fazer tarefas operacionais que deveriam ser delegadas"
]))}
{B("green","Exercicio: audite sua ultima semana",
  "<p>Classifique cada hora trabalhada em 3 categorias:</p>"+S([
  '<strong>Gerou receita</strong> - Prospeccao, reuniao de vendas, fechamento, entrega ao cliente',
  '<strong>Gerou valor</strong> - Planejamento, estrategia, melhoria de processo, desenvolvimento',
  '<strong>Poderia ser eliminada ou delegada</strong> - Operacional repetitivo, tarefas que outro poderia fazer'
])+"<p>Se mais de 50% esta na categoria 3, voce tem um problema serio de priorizacao.</p>"
)}
""")

set_content(5005, 50052, f"""
<p>A <strong>Matriz de Eisenhower</strong> adaptada pra empreendedores: 4 quadrantes que mudam seu dia.</p>
{SEP()}
{B("red","Urgente + Importante (CRISE)",
  "<p>Faca agora, mas questione: <strong>por que virou urgente?</strong> Se sempre esta apagando incendio, falta planejamento.</p>"
)}
{B("green","Importante + NAO Urgente (OURO)",
  "<p>AQUI esta o ouro. Planejamento, estrategia, relacionamentos, saude. E o que voce sempre adia e nunca faz. <strong>Agende blocos fixos pra isso.</strong></p>"
)}
{B("yellow","Urgente + NAO Importante (DELEGUE)",
  "<p>Emails que precisam de resposta, telefone tocando, tarefas administrativas. <strong>Delegue ou automatize.</strong></p>"
)}
{B("gray","Nem Urgente + Nem Importante (ELIMINE)",
  "<p>Redes sociais sem proposito, reunioes desnecessarias, perfeccionismo em detalhes irrelevantes. <strong>Corte sem do.</strong></p>"
)}
{Q("Template: toda segunda-feira, gaste 10 minutos classificando suas tarefas da semana nesses 4 quadrantes. Faca o quadrante verde PRIMEIRO.")}
""")

set_content(5005, 50053, f"""
<p>CEOs das maiores empresas do mundo usam <strong>Time Blocking</strong>: dividir o dia em blocos dedicados.</p>
{SEP()}
{B("blue","Seu dia ideal em blocos",S([
  "<strong>Bloco Estrategico (2h pela manha)</strong> - Trabalho profundo sem interrupcao. Celular no silencioso. Nada de email.",
  "<strong>Bloco de Comunicacao (1h)</strong> - Responda TODAS as mensagens, emails e ligacoes de uma vez. Lote!",
  "<strong>Bloco de Reunioes (2h)</strong> - Concentre todas as reunioes num unico periodo. Nao espalhe pelo dia.",
  "<strong>Bloco Operacional (2h)</strong> - Tarefas do dia a dia, processos, entregas.",
  "<strong>Bloco de Revisao (30min no fim)</strong> - Revise o dia e prepare o seguinte. O que ficou pendente?"
]))}
{B("green","Como proteger seus blocos",CK([
  "Coloque no calendario como 'reuniao' pra ninguem agendar em cima",
  "Avise a equipe: 'Das 8h as 10h estou focado, me procure so se for urgente'",
  "Use fone de ouvido como sinal visual de 'nao interrompa'"
]))}
""")

print("5005 lessons 1-3 done")

set_content(5005, 50054, f"""
<p>Se voce e o unico que consegue fazer tudo, <strong>voce nao tem um negocio, tem um emprego</strong>.</p>
{SEP()}
{B("blue","Framework de delegacao em 4 niveis",S([
  "<strong>Nivel 1: Observa</strong> - A pessoa acompanha voce fazendo. Aprende observando.",
  "<strong>Nivel 2: Executa com supervisao</strong> - Ela faz, voce revisa. Corrige na hora.",
  "<strong>Nivel 3: Executa e reporta</strong> - Ela faz sozinha e te conta depois. Voce so acompanha.",
  "<strong>Nivel 4: Autonomia total</strong> - Ela decide e executa. Voce so ve o resultado."
]))}
{B("red","3 erros fatais da delegacao",NK([
  "Delegar sem contexto: 'Faz isso aqui' sem explicar o porque e o resultado esperado",
  "Delegar sem prazo: 'Quando puder' vira 'nunca'",
  "Delegar sem acompanhamento: jogar a tarefa e sumir ate o prazo"
]))}
{B("green","Exercicio pratico",
  "<p>Liste 10 tarefas que voce faz toda semana e classifique:</p>"+CK([
  "So eu posso fazer (estrategia, decisoes-chave, relacionamento premium)",
  "Alguem pode aprender (com treinamento de 1-2 semanas)",
  "Ja deveria estar delegado (operacional, repetitivo, documentavel)"
]))}
""")

set_content(5005, 50055, f"""
<p>3 rituais que transformam sua produtividade. <strong>Consistencia supera intensidade.</strong></p>
{SEP()}
{B("green","Ritual Diario (15 minutos pela manha)",CK([
  "Revisar metas do dia: quais sao as 3 prioridades?",
  "Checar calendario: quais compromissos tenho?",
  "Uma pergunta: 'Se eu so pudesse fazer UMA coisa hoje, qual seria?'"
]))}
{B("blue","Ritual Semanal (30 minutos)",
  "<p><strong>Segunda:</strong> Planejar a semana. O que precisa acontecer? Quem e responsavel?</p>"
  "<p><strong>Sexta:</strong> Revisar resultados. O que funcionou? O que precisa mudar?</p>"
)}
{B("purple","Ritual Mensal (1 hora)",CK([
  "Revisar metas do mes: bati? Por que sim/nao?",
  "Financeiro: como foi o faturamento? Pipeline?",
  "O que funcionou e devo repetir?",
  "O que nao funcionou e devo parar?"
]))}
{B("yellow","Bonus: Power Hour",
  "<p>1 hora por semana dedicada EXCLUSIVAMENTE a pensar no FUTURO do negocio. Nao no dia a dia. Nao em problemas. So no futuro. Onde voce quer estar em 6 meses? O que precisa mudar?</p>"
)}
""")

print("5005 COMPLETE (5 lessons)")

# ═══ MENTORIA 6001: Diagnostico Comercial (3 sessoes) ═══

set_content(6001, 60011, f"""
<p>Vamos construir juntos o <strong>mapa completo de como as vendas acontecem</strong> na sua empresa.</p>
{SEP()}
{B("blue","Mapeando seu funil",S([
  "<strong>Topo:</strong> De onde vem os leads? Redes sociais, indicacao, trafego pago, eventos?",
  "<strong>Meio:</strong> Quantos viram contatos reais? Quantos recebem proposta?",
  "<strong>Fundo:</strong> Quantos fecham? Qual o ticket medio? Qual o ciclo de venda?"
]))}
{ST([("100","Leads/mes (exemplo)"),("30","Viram contato"),("10","Recebem proposta"),("3","Fecham")])}
{B("green","Exercicio guiado",
  "<p>Preencha com seus numeros reais dos ultimos 3 meses. Se voce nao tem esses numeros, essa e a <strong>primeira coisa que precisa resolver</strong>.</p>"
  "<p>Use uma planilha simples: Lead -> Contato -> Proposta -> Fechamento. Acompanhe semanalmente.</p>"
)}
""")

set_content(6001, 60012, f"""
<p>Com o funil mapeado, vamos identificar <strong>onde esta o dinheiro que voce deixa na mesa</strong>.</p>
{SEP()}
{B("red","6 gargalos mais comuns",S([
  "<strong>Geracao de leads</strong> - Trafego existe mas nao vira contato. Problema no CTA ou na oferta.",
  "<strong>Qualificacao</strong> - Muitos curiosos, poucos compradores. Falta filtro.",
  "<strong>Follow-up</strong> - Leads esquecidos por falta de processo. O mais comum!",
  "<strong>Proposta</strong> - Apresentacao fraca que nao comunica valor.",
  "<strong>Fechamento</strong> - Medo de fechar, falta de tecnica, demora.",
  "<strong>Pos-venda</strong> - Vende uma vez e nunca mais. Zero recorrencia."
]))}
{B("green","Para cada gargalo identificado",CK([
  "Defina uma acao imediata (o que fazer ESTA semana)",
  "Estabeleca um responsavel (quem vai executar)",
  "Marque um prazo (quando tem que estar pronto)",
  "Defina como medir (qual numero vai mudar)"
]))}
""")

set_content(6001, 60013, f"""
<p>Saindo com um plano executavel de <strong>12 semanas para resultados concretos</strong>.</p>
{SEP()}
{B("green","Semanas 1-4: Consertar o gargalo principal",
  "<p>Foque no que esta sangrando mais dinheiro AGORA. Uma coisa de cada vez. Se o problema e follow-up, implemente um sistema simples de CRM. Se e proposta, refaca sua apresentacao.</p>"
)}
{B("blue","Semanas 5-8: Processos e pos-venda",
  "<p>Com o gargalo principal resolvido, implemente: sequencia de follow-up padronizada, pos-venda automatico em 4 mensagens, pesquisa de satisfacao.</p>"
)}
{B("purple","Semanas 9-12: Escalar e testar",
  "<p>Escale o que funcionou. Teste novos canais. Revise numeros e ajuste. Neste ponto voce ja tem um processo previsivel.</p>"
)}
{ST([("12","Semanas de execucao"),("3","Fases do plano"),("1","Gargalo por vez")])}
""")

print("6001 COMPLETE (3 sessions)")

# ═══ MENTORIA 6002: Maquina de Indicacoes (3 sessoes) ═══

set_content(6002, 60021, f"""
<p>Clientes por indicacao ja chegam com <strong>confianca emprestada</strong>, o que acelera todo o processo de vendas.</p>
{ST([("4x","Mais rapido de converter"),("25%","Ticket maior"),("37%","Maior retencao")])}
{SEP()}
{B("blue","Por que as pessoas indicam (e por que NAO indicam)",
  "<p><strong>Indicam porque:</strong> Reconhecimento, reciprocidade, orgulho de ajudar amigos.</p>"
  "<p><strong>NAO indicam porque:</strong> Medo de se comprometer, nao sabem como fazer, ninguem nunca pediu.</p>"
)}
{B("green","Diagnostico rapido",
  "<p>Quantas vendas vieram por indicacao nos ultimos 6 meses? Se for menos de 30% do total, ha uma oportunidade enorme sendo ignorada.</p>"
)}
""")

set_content(6002, 60022, f"""
<p>Passo a passo para criar um <strong>programa de indicacao estruturado</strong> em 1 hora.</p>
{SEP()}
{B("green","5 passos do programa",S([
  "<strong>Defina o incentivo</strong> - Desconto, brinde, comissao ou reconhecimento publico. Nem sempre precisa ser dinheiro.",
  "<strong>Crie o momento certo</strong> - Peca logo apos uma entrega bem-sucedida. Nunca antes.",
  "<strong>Facilite ao maximo</strong> - O cliente precisa conseguir indicar em menos de 30 segundos.",
  "<strong>Comunique com clareza</strong> - Mensagem simples, sem burocracia, sem termos complexos.",
  "<strong>Agradeca SEMPRE</strong> - Mesmo que a indicacao nao vire cliente. O gesto importa."
]))}
{B("yellow","Template de pedido de indicacao",
  '<p>"Oi [nome], que bom que o [resultado] esta funcionando bem! Tenho um pedido: voce conhece mais 2 ou 3 pessoas que poderiam se beneficiar disso? Pode me passar o contato ou mandar meu numero pra eles. Como agradecimento, [incentivo]."</p>'
)}
""")

set_content(6002, 60023, f"""
<p>A diferenca entre receber indicacoes de vez em quando e ter um <strong>sistema previsivel</strong>.</p>
{SEP()}
{B("blue","Escalando indicacoes",S([
  "<strong>Automatize o pedido</strong> - Inclua no fluxo de pos-venda. Dia 30: 'Conhece alguem que precisa?'",
  "<strong>Rede de parceiros</strong> - Outros profissionais que atendem o mesmo publico. Indicacao mutua.",
  "<strong>Eventos e conteudo</strong> - Convide clientes pra eventos exclusivos. Eles trazem amigos naturalmente.",
  "<strong>Meca e otimize</strong> - Taxa de indicacao, conversao de indicados, LTV de clientes indicados."
]))}
{ST([("3-5","Indicacoes qualificadas/mes (meta)"),("60","Dias pra atingir"),("30%","Do faturamento vindo de indicacao")])}
""")

print("6002 COMPLETE (3 sessions)")

# ═══ MENTORIA 6003: Precificacao Estrategica (3 sessoes) ═══

set_content(6003, 60031, f"""
<p>Calcule o custo <strong>REAL</strong> do que voce vende. A maioria descobre que esta trabalhando por menos que um funcionario ganharia.</p>
{SEP()}
{B("red","Formula do preco minimo",
  "<p><strong>Custo fixo + Custo variavel + Margem de lucro + Margem de negociacao = Preco MINIMO</strong></p>"
  "<p>Inclua: seu tempo (hora real, nao a que voce acha), impostos, ferramentas, desgaste, custo de oportunidade.</p>"
)}
{B("yellow","Exercicio revelador",
  "<p>Calcule: Quanto voce faturou no ultimo mes? Quantas horas trabalhou? Divida. Esse e seu ganho real por hora. Compare com o salario de um funcionario na sua area. Se e menor, voce esta pagando pra trabalhar.</p>"
)}
{ST([("R$/h","Seu ganho real por hora"),("vs","Mercado CLT"),("=","Sua decisao")])}
""")

set_content(6003, 60032, f"""
<p>Parar de vender servico avulso e criar <strong>pacotes que aumentam ticket medio</strong>.</p>
{SEP()}
{B("green","Estrategia dos 3 pacotes",S([
  "<strong>Bronze (ancora baixa)</strong> - Basico, limitado. Existe pra fazer o Silver parecer bom negocio.",
  "<strong>Silver (o que voce quer vender)</strong> - Melhor custo-beneficio. 60-70% dos clientes escolhem esse.",
  "<strong>Gold (ancora alta)</strong> - Premium, completo. Pra quem quer o melhor e pra ancorar o Silver."
]))}
{B("yellow","Como apresentar",
  "<p>Sempre do mais caro pro mais barato. O cerebro ancora no primeiro numero.</p>"
  "<p>Destaque o Silver como 'Mais escolhido' ou 'Recomendado'. Prova social na hora.</p>"
)}
""")

set_content(6003, 60033, f"""
<p>O medo de reajustar preco paralisa muitos negocios. Vamos resolver isso.</p>
{SEP()}
{B("blue","4 momentos certos de aumentar preco",S([
  "<strong>Na renovacao</strong> - Momento natural de reajuste. O cliente ja espera.",
  "<strong>Na melhoria do servico</strong> - Adicionou valor? Cobra mais.",
  "<strong>Na mudanca de posicionamento</strong> - Subindo de nivel? O preco acompanha.",
  "<strong>Na inflacao</strong> - Custos subiram? Repasse. E justo."
]))}
{B("green","Como comunicar o aumento",
  '<p>"Oi [nome], quero te avisar com antecedencia: a partir de [data], nossos valores serao reajustados. Como voce e cliente, mantenho a condicao atual por mais [X meses]. Apos isso, o novo valor sera [Y]."</p>'
)}
{B("yellow","Case real",
  "<p>Empresa aumentou 35% o preco. Perdeu 2 de 40 clientes. <strong>Resultado: faturamento 30% maior com menos trabalho.</strong> Se NENHUM cliente reclamar, voce aumentou pouco.</p>"
)}
""")

print("6003 COMPLETE (3 sessions)")

# ═══ GUIA 7001: Como Usar o UniqueHub (4 aulas) ═══

set_content(7001, 70011, f"""
<p>Bem-vindo ao UniqueHub! Conhca cada secao da plataforma.</p>
{SEP()}
{B("blue","Suas secoes principais",S([
  "<strong>Dashboard</strong> - Visao geral: metricas, aprovacoes pendentes, Growth Score e resumo do mes.",
  "<strong>Conteudo</strong> - Todos os posts criados pela agencia com status em tempo real.",
  "<strong>Chat</strong> - Conversa direta com a equipe da agencia. Rapido e organizado.",
  "<strong>Agenda</strong> - Reunioes, gravacoes e datas importantes.",
  "<strong>Configuracoes</strong> - Personalize cores, tema e notificacoes."
]))}
{B("green","Dica",KY([
  "O app funciona como um site no celular. Adicione a tela inicial pra acesso rapido!",
  "Todas as notificacoes chegam em tempo real. Fique de olho!"
]))}
""")

set_content(7001, 70012, f"""
<p>Quando a agencia envia conteudo pra aprovacao, veja como revisar e responder.</p>
{SEP()}
{B("green","Passo a passo",S([
  "Abra a aba <strong>Conteudo</strong>. Posts pendentes aparecem com status 'Aguardando aprovacao'.",
  "Clique no post pra ver: arte/video em tamanho real, legenda, hashtags e data sugerida.",
  "Escolha: <strong>APROVAR</strong> (sera publicado na data), <strong>SOLICITAR AJUSTES</strong> (escreva o que mudar) ou <strong>REPROVAR</strong> (com justificativa)."
]))}
{Q("Quanto mais rapido voce aprova, mais fluido e o calendario de publicacoes.")}
{B("yellow","Dicas pra dar bom feedback",CK([
  "Seja especifico: 'O verde ficou apagado' e melhor que 'nao gostei'",
  "Se gostar mas quiser pequeno ajuste, aprove e peca a mudanca no proximo",
  "Reserve 10 minutos por dia pra revisar pendencias"
]))}
""")

set_content(7001, 70013, f"""
<p>Entenda o que cada numero significa nos seus relatorios.</p>
{SEP()}
{B("blue","Metricas principais",S([
  "<strong>Alcance</strong> - Quantas pessoas viram seus conteudos. Quanto maior, mais visibilidade.",
  "<strong>Engajamento</strong> - (curtidas + comentarios + saves + compartilhamentos) / alcance. Acima de 3% = saudavel.",
  "<strong>Salvamentos</strong> - A metrica mais valiosa. Indica conteudo util que o publico quer rever.",
  "<strong>Compartilhamentos</strong> - Indica relevancia. O publico achou valioso o suficiente pra mostrar a outros."
]))}
{B("green","O que realmente importa",KY([
  "NAO se preocupe com curtidas. E a metrica MENOS importante.",
  "Foque em salvamentos e compartilhamentos. Sao os indicadores de conteudo de qualidade."
]))}
""")

set_content(7001, 70014, f"""
<p>O Growth Score mede o quao ativo voce esta com o marketing da sua empresa. Nota de <strong>0 a 100</strong>.</p>
{SEP()}
{B("green","5 pilares do Growth Score",S([
  "<strong>Execucao</strong> - Aprovar conteudos no prazo.",
  "<strong>Estrategia</strong> - Participar de reunioes e briefings.",
  "<strong>Educacao</strong> - Assistir aulas da Academy.",
  "<strong>Ecossistema</strong> - Fazer networking no Match4Biz.",
  "<strong>Crescimento</strong> - Resultados reais das metricas."
]))}
{ST([("80+","Score ideal"),("3x","Crescimento medio vs score abaixo de 50")])}
{Q("Empresas com score acima de 80 crescem em media 3x mais rapido. Nao e coincidencia: e alinhamento entre voce e a estrategia.")}
""")

print("7001 COMPLETE (4 lessons)")

# ═══ GUIA 7002: Como Tirar o Maximo da Agencia (4 aulas) ═══

set_content(7002, 70021, f"""
<p>Expectativas alinhadas sao a base de uma parceria produtiva.</p>
{SEP()}
{B("green","O que a agencia FAZ",CK([
  "Estrategia de conteudo e planejamento editorial",
  "Criacao de artes, videos e copys",
  "Gestao de redes sociais e publicacoes",
  "Relatorios de performance e insights",
  "Consultoria de marketing e posicionamento"
]))}
{B("red","O que a agencia NAO FAZ",NK([
  "Vender por voce (marketing atrai, voce fecha)",
  "Criar demanda do zero pra um produto sem mercado",
  "Substituir o relacionamento com seus clientes"
]))}
{Q("O sucesso e via de mao dupla: a agencia precisa da sua expertise no negocio e voce precisa da expertise da agencia em marketing. Trate como parceria estrategica.")}
""")

set_content(7002, 70022, f"""
<p>A qualidade do conteudo e <strong>diretamente proporcional a qualidade do briefing</strong>.</p>
{SEP()}
{B("blue","O que incluir em todo briefing",S([
  "<strong>Objetivo</strong> - O que voce quer com esse conteudo? Vender, educar, engajar?",
  "<strong>Publico</strong> - Pra quem e? Cliente final, parceiro, mercado em geral?",
  "<strong>Tom</strong> - Serio, descontraido, tecnico, inspiracional?",
  "<strong>Referencias</strong> - Posts que voce gostou, concorrentes que admira."
]))}
{B("green","Materiais que ajudam MUITO",CK([
  "Fotos dos bastidores, do produto, da equipe",
  "Perguntas frequentes dos seus clientes (cada pergunta e um post!)",
  "Resultados e cases pra usar como prova social",
  "Novidades, lancamentos, eventos"
]))}
""")

set_content(7002, 70023, f"""
<p>Cada dia que um post fica parado esperando aprovacao e um dia sem resultado.</p>
{ST([("40%","Mais posts publicados pra quem aprova em menos de 24h"),("10min","Tempo ideal por dia pra revisar")])}
{SEP()}
{B("green","Dicas praticas",CK([
  "Reserve 10 minutos por dia pra revisar conteudos pendentes",
  "Se tiver duvida, aprove e peca ajuste no proximo. Melhor publicar do que ficar sem postar.",
  "Use o chat do UniqueHub pra duvidas rapidas em vez de acumular pra reuniao"
]))}
{Q("O calendario editorial e planejado com antecedencia. Atrasos criam efeito domino que prejudica toda a estrategia do mes.")}
""")

set_content(7002, 70024, f"""
<p>Relatorios nao sao pra ficar bonito na reuniao. Sao pra <strong>tomar decisoes</strong>.</p>
{SEP()}
{B("blue","O que olhar e o que fazer",S([
  "<strong>Engajamento caindo?</strong> Hora de testar novos formatos (Reels, Carrosseis).",
  "<strong>Alcance subindo mas vendas nao?</strong> Conteudo esta atraindo publico errado. Reajustar segmentacao.",
  "<strong>Horarios de pico mudaram?</strong> Ajustar o calendario de publicacoes."
]))}
{B("green","Perguntas pra fazer na reuniao mensal",CK([
  "'Qual conteudo performou melhor e por que?'",
  "'O que vamos testar de diferente no proximo mes?'",
  "'Precisam de algo de mim pra melhorar os resultados?'"
]))}
{Q("A melhor pergunta que voce pode fazer a agencia: 'O que EU posso fazer pra ajudar os resultados melhorarem?'")}
""")

print("7002 COMPLETE (4 lessons)")

# ═══ UPLOAD TO SUPABASE ═══
print("\n=== SUMMARY ===")
total_lessons = 0
total_with_content = 0
for c in courses:
    lessons_with = sum(1 for l in c["lessons"] if l.get("content"))
    total_lessons += len(c["lessons"])
    total_with_content += lessons_with
    print(f"  {c['id']}: {c['title']} - {lessons_with}/{len(c['lessons'])} aulas com conteudo rico")

print(f"\nTotal: {total_with_content}/{total_lessons} aulas com conteudo HTML")
print("\nUploading to Supabase...")

payload = json.dumps({"value": json.dumps(courses, ensure_ascii=False)}).encode("utf-8")
req2 = urllib.request.Request(
    f"{URL}/rest/v1/app_settings?key=eq.academy_courses",
    data=payload,
    headers={
        "apikey": KEY,
        "Authorization": f"Bearer {KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    },
    method="PATCH"
)
resp = urllib.request.urlopen(req2)
print(f"Status: {resp.status}")
print("DONE! All courses updated with rich HTML content.")
