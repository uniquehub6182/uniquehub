# 🎬 Guia: Captions em inglês no Loom (passo a passo)

> Este guia mostra como adicionar legendas em **inglês** num vídeo gravado em pt-BR usando o Loom (free tier).

---

## 1. Gravação

Use o **Loom Desktop App** (recomendado, mais qualidade) ou a extensão Chrome:

- 📥 Download: https://www.loom.com/download
- Login com sua conta (free tier serve, até 5min por vídeo na conta gratuita — se passar, considera pagar 1 mês ou usar OBS)

**Configurações de gravação:**
- Capture: **Screen + Cam** (cam pode estar desligada)
- Quality: **HD** (1080p)
- Audio: **Mic on** (narrar o que está fazendo em pt-BR ajuda na transcrição)

**Importante:** narrar em pt-BR durante a gravação dá uma transcrição muito melhor depois.

---

## 2. Após gravar

O Loom abre o player com seu vídeo. Você verá:

- Botão **Edit Video**
- Botão **Share**
- Aba **Settings** → **Captions**

---

## 3. Gerar captions automáticos

1. Clica em **CC (Closed Captions)** ou em **Settings → Captions**
2. Clica **"Generate captions"** (Loom transcreve automaticamente em pt-BR)
3. Aguarda 1-2 minutos enquanto processa

---

## 4. Traduzir captions pra inglês

1. Com os captions gerados, clica em **"Translate captions"**
2. Escolhe **English (US)** como idioma destino
3. Loom traduz com IA (Google Translate / similar)
4. Aguarda 30s

---

## 5. Revisar e ajustar

**MUITO IMPORTANTE:** revise os captions traduzidos. A IA do Loom é boa mas erra termos técnicos.

**Termos a conferir manualmente:**
- "Cliente" → deve virar **"Client"** (não "customer")
- "Página do Facebook" → **"Facebook Page"** (capitalizado)
- "Conta do Instagram" → **"Instagram account"**
- "Conectar" → **"Connect"** (não "link")
- "Aprovar" → **"Approve"** (não "accept")
- "Agendar" → **"Schedule"** (não "appointment")
- "Publicar" → **"Publish"** (não "post" como verbo)
- "Inbox Social" → **"Social Inbox"**
- Termos da Meta API: manter em inglês mesmo (ex: `pages_show_list`, `read_insights`)

Use o editor de captions do Loom pra corrigir frase por frase.

---

## 6. Burn-in das captions (importante)

A Meta precisa ver os captions **embutidos no vídeo** (não como track separado).

No Loom:
1. Settings → **Default captions** → toggle **ON** (sempre mostrar)
2. Antes de exportar, garante que captions estão visíveis no preview

Alternativa: baixar o vídeo + arquivo `.srt` e fazer burn-in com **HandBrake** (free):
1. HandBrake: https://handbrake.fr/
2. Open source: vídeo do Loom
3. Subtitles tab: importa o `.srt`
4. Marca **"Burn In"** ✅
5. Format: MP4 H.264
6. Start Encode

---

## 7. Exportar / baixar o vídeo

No Loom:
1. Botão **Download** (ícone de seta pra baixo)
2. Escolhe **MP4** + **HD 1080p**
3. Confirma que captions estão visíveis no arquivo baixado

**Tamanho do arquivo:** o Meta tem limite de **100MB**. Se passar:
- Comprime com **HandBrake** (Preset: "Web → Discord Tiny" → ajusta qualidade pra ficar ~80MB)
- OU: corta partes desnecessárias da gravação

---

## 8. Validação final antes de submeter

Antes de subir no Meta, abre o MP4 e confere:

- [ ] Captions em inglês aparecem do início ao fim
- [ ] Captions são legíveis (fonte grande, fundo escuro)
- [ ] URL bar (`uniquehub.com.br`) visível em momentos chave
- [ ] OAuth consent screen aparece por 3+ segundos
- [ ] Cada permissão tem demonstração visual da API funcionando

---

## 🆘 Plano B se Loom travar

Se o Loom não funcionar bem ou as captions ficarem ruins, alternativas grátis:

1. **DaVinci Resolve** (free) — captions manuais, melhor qualidade
2. **Kapwing** (free tier) — interface web, fácil
3. **CapCut Desktop** (free) — auto-captions + tradução

Tutorial rápido pra cada um, se precisar, me chama.

---

## 📝 Exemplo de captions ideais

Quando filmar a tela do OAuth do Facebook (frame mais importante):

```
[Caption: "Step 3: Connecting to Facebook through Meta OAuth"]
[Caption: "Facebook is requesting these specific permissions:"]
[Caption: "- pages_show_list (to list user's Pages)"]
[Caption: "- pages_read_user_content (to read Page posts)"]
[Caption: "- pages_read_engagement (to read comments)"]
[Caption: "- read_insights (to read Page metrics)"]
[Caption: "- business_management (to read Business Manager)"]
[Pause 3s on this screen]
[Caption: "User clicks Continue to authorize"]
```

Esse padrão de captions explícitos torna o vídeo aprovável.
