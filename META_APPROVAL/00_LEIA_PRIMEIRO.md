# 🎯 META APP REVIEW — LEIA PRIMEIRO

## 🚨 Estratégia atualizada (mais segura, mais rápida)

**Antes:** plano original era ter o app em inglês via `?lang=en`.
**Agora:** vamos gravar em **pt-BR** e adicionar **captions em inglês** via Loom.

### Por quê mudei a estratégia
- `?lang=en` no app estava com bugs de DOM walker que travavam o app
- Mexer mais em código = mais risco de quebrar produção
- Loom faz tradução automática de captions com 1 clique
- A Meta **aceita** vídeo em outro idioma desde que tenha captions em inglês claros

### Como vai funcionar
1. Você grava o screencast em **português normalmente** (UI em pt-BR mesmo)
2. Sobe no Loom
3. Loom gera transcrição automática
4. Você clica "Translate to English" → captions inglês embutidos
5. Exporta e submete

**Tempo total estimado:** 2 vídeos × 30min cada (15min gravar + 15min editar/legendar) = 1h

---

## 📁 Arquivos nesta pasta

| Arquivo | Pra que serve |
|---|---|
| `00_LEIA_PRIMEIRO.md` | Este arquivo. Resumão estratégico. |
| `01_PERMISSION_USAGE_TEXTS.md` | Textos em **inglês** pra colar no campo "How are you using" do Meta. **NÃO MUDA.** |
| `02_VIDEO_SCRIPTS.md` | Roteiro detalhado do que filmar passo a passo. **Em pt-BR agora**. |
| `03_RECORDING_CHECKLIST.md` | Checklist pré-gravação + processo de submissão. |
| `04_LOOM_CAPTIONS_GUIDE.md` | **NOVO** — Como adicionar captions em inglês no Loom. |

---

## ⏱️ Plano de execução em 1 dia

### Manhã (2h)
- [ ] Ler `01_PERMISSION_USAGE_TEXTS.md`
- [ ] Atualizar campo "How are you using" no Meta dos 2 apps com os textos em inglês
- [ ] Salvar (ainda não submeter)

### Tarde (2h)
- [ ] Setup conforme `03_RECORDING_CHECKLIST.md`:
  - Conta de teste Instagram Business pronta
  - Conta de teste Facebook + Page pronta
  - Cliente "Demo Client" criado no UniqueHub
  - Loom instalado/logado
- [ ] Gravar Vídeo 1 (Instagram, ~5min) seguindo `02_VIDEO_SCRIPTS.md`
- [ ] Gravar Vídeo 2 (Facebook, ~7min) seguindo `02_VIDEO_SCRIPTS.md`

### Noite (1h)
- [ ] Adicionar captions em inglês conforme `04_LOOM_CAPTIONS_GUIDE.md`
- [ ] Exportar MP4 dos 2 vídeos
- [ ] Subir os vídeos no Meta App Review
- [ ] Submeter ambos os apps

### Próximos 3-7 dias
- Aguardar resposta da Meta
- Se aprovado: 🎉
- Se rejeitado: me chama com o feedback novo

---

## ⚠️ Pontos críticos de não-falha

1. **OAuth consent screen DEVE ficar visível 3 segundos** — esse é o frame mais importante. O reviewer precisa ver claramente quais permissões estão sendo pedidas.

2. **Cada permissão precisa ser USADA visivelmente no vídeo** — não basta pedir; tem que mostrar o resultado da chamada API.

3. **URL bar visível** — o reviewer precisa confirmar que é o app real (`uniquehub.com.br`).

4. **Captions em inglês claros** — explicando cada elemento da UI quando ele aparece.

5. **Sem cortes/edição abrupta** — gravar idealmente em uma tomada só.

---

## 🆘 Se travar em algum ponto

Me manda:
1. Screenshot de onde travou
2. Qual passo do roteiro estava
3. Mensagem de erro se houver

Eu desentupo na hora.
