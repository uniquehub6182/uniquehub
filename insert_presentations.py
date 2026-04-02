import sys

FILE = "/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx"
with open(FILE, "r") as f:
    content = f.read()

MARKER = '/* ═══════════════════════ FEED PLANNER (Instagram Simulator) ═══════════════════════ */'

COMPONENT = r'''/* ═══════════════════════ PRESENTATIONS PAGE ═══════════════════════ */
function PresentationsPage({ onBack, clients, user, demands }) {
  const isPDesktop = useIsDesktop();
  const { showToast, ToastEl } = useToast();
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list"); // list | create | viewer
  const [selClient, setSelClient] = useState(null);
  const [mode, setMode] = useState("metrics"); // metrics | campaigns
  const [selMonth, setSelMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfText, setPdfText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [currentPres, setCurrentPres] = useState(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [editSlide, setEditSlide] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  const LIME = "#C8FF00";
  const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const formatMonth = (m) => { const [y, mo] = (m||"").split("-"); return `${monthNames[parseInt(mo,10)-1]||""} ${y||""}`; };

  // Load presentations
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("presentations").select("*").order("created_at", { ascending: false });
      setPresentations(data || []);
      setLoading(false);
    })();
  }, []);

  // Extract text from uploaded PDF
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    // Read as text (basic extraction - for PDFs the AI will interpret the raw content)
    const reader = new FileReader();
    reader.onload = (ev) => {
      const arr = new Uint8Array(ev.target.result);
      // Simple text extraction from PDF binary
      let text = "";
      try {
        const str = new TextDecoder("utf-8", { fatal: false }).decode(arr);
        // Extract text between BT...ET blocks or parentheses
        const matches = str.match(/\(([^)]{2,})\)/g) || [];
        text = matches.map(m => m.slice(1,-1)).filter(t => t.length > 3 && !/^[\x00-\x1f]+$/.test(t)).join(" ");
        if (text.length < 50) text = str.replace(/[^\x20-\x7E\xC0-\xFF\n]/g, " ").replace(/\s{3,}/g, " ").trim().slice(0, 8000);
      } catch { text = "Não foi possível extrair texto do PDF"; }
      setPdfText(text.slice(0, 8000));
    };
    reader.readAsArrayBuffer(file);
  };

  // Gather metrics data for the selected client & month
  const gatherMetrics = () => {
    if (!selClient) return {};
    const [year, month] = selMonth.split("-").map(Number);
    const clientDemands = (demands || []).filter(d => d.client === selClient.name || d.client_id === selClient.id);
    const monthDemands = clientDemands.filter(d => {
      const dt = new Date(d.scheduled_date || d.created_at);
      return dt.getFullYear() === year && dt.getMonth() + 1 === month;
    });
    const published = monthDemands.filter(d => d.stage === "Publicado" || d.stage === "published");
    const approved = monthDemands.filter(d => d.stage === "Aprovado" || d.stage === "approved");
    const pending = monthDemands.filter(d => d.stage === "Aguardando" || d.stage === "pending" || d.stage === "Aprovação");
    // Previous month for comparison
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevDemands = clientDemands.filter(d => {
      const dt = new Date(d.scheduled_date || d.created_at);
      return dt.getFullYear() === prevYear && dt.getMonth() + 1 === prevMonth;
    });
    const prevPublished = prevDemands.filter(d => d.stage === "Publicado" || d.stage === "published");
    // Types breakdown
    const types = {};
    published.forEach(d => { const t = d.type || d.format || "Post"; types[t] = (types[t]||0) + 1; });

    return {
      clientName: selClient.name,
      month: formatMonth(selMonth),
      totalDemands: monthDemands.length,
      published: published.length,
      approved: approved.length,
      pending: pending.length,
      prevPublished: prevPublished.length,
      growth: prevPublished.length > 0 ? Math.round(((published.length - prevPublished.length) / prevPublished.length) * 100) : 0,
      types,
      topPosts: published.slice(0, 5).map(d => ({ title: d.title || d.caption?.slice(0,60) || "Post", type: d.type || "Post", date: d.scheduled_date })),
    };
  };

  // Generate presentation via AI
  const handleGenerate = async () => {
    if (!selClient) { showToast("Selecione um cliente", "error"); return; }
    if (mode === "campaigns" && !pdfText) { showToast("Faça upload do PDF de campanhas", "error"); return; }
    setGenerating(true);
    try {
      const aiKey = await supaGetSetting("anthropic_key");
      if (!aiKey) { showToast("Configure a chave da API Claude nas configurações", "error"); setGenerating(false); return; }

      const metrics = mode === "metrics" ? gatherMetrics() : null;
      const systemPrompt = `Você é um estrategista sênior de marketing digital e especialista em apresentações para clientes.
Sua função é transformar dados e planejamentos em apresentações claras, visuais, estratégicas e envolventes.

Regras obrigatórias:
- Não crie slides com muito texto
- Priorize frases curtas, números e palavras-chave
- Cada slide deve ter no máximo 6 linhas de conteúdo
- Evite parágrafos
- Use linguagem simples, direta e com tom positivo
- Mesmo em cenários negativos, traga uma narrativa de aprendizado e oportunidade
- A apresentação deve prender atenção e gerar confiança no cliente
- Estruture como se fosse uma apresentação de agência premium
- Sempre inclua títulos de slides mais estratégicos e menos genéricos

Responda APENAS com um JSON array de slides, cada um com: { "title": "...", "body": "...", "type": "text|metrics|highlight|cta" }
O body deve usar "\\n" para quebras de linha. NÃO inclua markdown, apenas texto puro.
Gere entre 8 e 14 slides.
NÃO inclua nada além do JSON array. Sem explicações, sem markdown fences.`;

      let userPrompt;
      if (mode === "metrics") {
        userPrompt = `Crie uma apresentação de RESULTADOS MENSAIS para o cliente "${metrics.clientName}" referente a ${metrics.month}.

Dados do mês:
- Posts publicados: ${metrics.published}
- Posts aprovados: ${metrics.approved}
- Posts pendentes: ${metrics.pending}
- Total de demandas: ${metrics.totalDemands}
- Mês anterior: ${metrics.prevPublished} publicados
- Crescimento: ${metrics.growth}%
- Tipos: ${JSON.stringify(metrics.types)}
- Top posts: ${JSON.stringify(metrics.topPosts)}

Estrutura sugerida: Abertura → Visão geral → Crescimento → Conteúdos produzidos → Top conteúdos → Análise estratégica → Próximos passos → Encerramento`;
      } else {
        userPrompt = `Crie uma apresentação de PLANEJAMENTO DE CAMPANHAS para o cliente "${selClient.name}" referente a ${formatMonth(selMonth)}.

Conteúdo do calendário de campanhas (extraído do PDF):
${pdfText}

Estrutura sugerida: Abertura → Visão estratégica do mês → Campanha 1 (detalhes) → Campanha 2+ → Calendário resumido → Investimento sugerido → Próximos passos → Encerramento`;
      }

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": aiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] })
      });
      const data = await resp.json();
      const text = (data.content || []).map(c => c.text || "").join("");
      // Parse JSON from response
      let slides;
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        slides = JSON.parse(clean);
      } catch {
        // Try to find JSON array in response
        const match = text.match(/\[[\s\S]*\]/);
        if (match) slides = JSON.parse(match[0]);
        else throw new Error("Resposta da IA não contém JSON válido");
      }
      if (!Array.isArray(slides) || slides.length === 0) throw new Error("Nenhum slide gerado");

      // Save to Supabase
      setSaving(true);
      const title = mode === "metrics"
        ? `Resultados · ${selClient.name} · ${formatMonth(selMonth)}`
        : `Campanhas · ${selClient.name} · ${formatMonth(selMonth)}`;
      const { data: saved, error } = await supabase.from("presentations").insert({
        client_id: selClient.id, title, type: mode, month: selMonth, slides, created_by: user?.id
      }).select().single();
      if (error) throw error;
      setPresentations(prev => [saved, ...prev]);
      setCurrentPres(saved);
      setSlideIdx(0);
      setView("viewer");
      showToast(`Apresentação gerada com ${slides.length} slides!`);
    } catch (err) {
      console.error("Generate error:", err);
      showToast(err.message || "Erro ao gerar apresentação", "error");
    } finally {
      setGenerating(false);
      setSaving(false);
    }
  };

  // Delete presentation
  const handleDelete = async (id) => {
    setDeleting(id);
    const { error } = await supabase.from("presentations").delete().eq("id", id);
    if (!error) {
      setPresentations(prev => prev.filter(p => p.id !== id));
      if (currentPres?.id === id) { setCurrentPres(null); setView("list"); }
      showToast("Apresentação removida");
    }
    setDeleting(null);
  };

  // Save edited slide
  const handleSaveSlide = async () => {
    if (!currentPres || editSlide === null) return;
    const newSlides = [...currentPres.slides];
    newSlides[editSlide] = { ...newSlides[editSlide], title: editTitle, body: editBody };
    const { error } = await supabase.from("presentations").update({ slides: newSlides, updated_at: new Date().toISOString() }).eq("id", currentPres.id);
    if (!error) {
      const updated = { ...currentPres, slides: newSlides };
      setCurrentPres(updated);
      setPresentations(prev => prev.map(p => p.id === updated.id ? updated : p));
      setEditSlide(null);
      showToast("Slide atualizado!");
    }
  };

  // ── Slide Renderer ──
  const renderSlide = (slide, idx, total) => {
    const isMetric = slide.type === "metrics" || slide.type === "highlight";
    const isCta = slide.type === "cta";
    return (
      <div style={{ width:"100%", aspectRatio: isPDesktop ? "16/9" : "4/3", background:"linear-gradient(135deg, #0D0D0D 0%, #1a1a2e 50%, #0D0D0D 100%)", borderRadius: fullscreen ? 0 : 20, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding: isPDesktop ? "60px 80px" : "40px 30px", position:"relative", overflow:"hidden", boxSizing:"border-box" }}>
        {/* Background accent */}
        <div style={{ position:"absolute", top:-100, right:-100, width:300, height:300, borderRadius:"50%", background:`${LIME}08`, filter:"blur(80px)" }} />
        <div style={{ position:"absolute", bottom:-50, left:-50, width:200, height:200, borderRadius:"50%", background:`${LIME}05`, filter:"blur(60px)" }} />
        {/* Slide number */}
        <div style={{ position:"absolute", top: isPDesktop ? 24 : 16, right: isPDesktop ? 32 : 20, fontSize:12, color:"rgba(255,255,255,0.3)", fontWeight:600 }}>{idx+1}/{total}</div>
        {/* Agency watermark */}
        <div style={{ position:"absolute", bottom: isPDesktop ? 24 : 16, left: isPDesktop ? 32 : 20, fontSize:10, color:"rgba(255,255,255,0.15)", fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>UniqueHub</div>
        {/* Content */}
        {idx === 0 ? (
          <>
            <div style={{ fontSize: isPDesktop ? 14 : 11, fontWeight:700, color:LIME, letterSpacing:2, textTransform:"uppercase", marginBottom:16 }}>{selClient?.name || currentPres?.title?.split("·")[1]?.trim() || "Cliente"}</div>
            <div style={{ fontSize: isPDesktop ? 36 : 24, fontWeight:900, color:"#fff", textAlign:"center", lineHeight:1.2, marginBottom:12 }}>{slide.title}</div>
            <div style={{ fontSize: isPDesktop ? 16 : 13, color:"rgba(255,255,255,0.6)", textAlign:"center", lineHeight:1.5, maxWidth:600, whiteSpace:"pre-line" }}>{slide.body}</div>
          </>
        ) : isCta ? (
          <>
            <div style={{ fontSize: isPDesktop ? 32 : 22, fontWeight:900, color:LIME, textAlign:"center", lineHeight:1.2, marginBottom:16 }}>{slide.title}</div>
            <div style={{ fontSize: isPDesktop ? 16 : 13, color:"rgba(255,255,255,0.7)", textAlign:"center", lineHeight:1.6, maxWidth:600, whiteSpace:"pre-line" }}>{slide.body}</div>
          </>
        ) : (
          <>
            <div style={{ alignSelf:"flex-start", marginBottom: isPDesktop ? 32 : 20, width:"100%" }}>
              <div style={{ display:"inline-block", background:`${LIME}15`, borderRadius:8, padding:"6px 14px", marginBottom:12 }}>
                <span style={{ fontSize:11, fontWeight:700, color:LIME, letterSpacing:1, textTransform:"uppercase" }}>{isMetric ? "Dados" : "Estratégia"}</span>
              </div>
              <div style={{ fontSize: isPDesktop ? 28 : 20, fontWeight:800, color:"#fff", lineHeight:1.2 }}>{slide.title}</div>
            </div>
            <div style={{ alignSelf:"flex-start", fontSize: isPDesktop ? 16 : 13, color:"rgba(255,255,255,0.8)", lineHeight:1.8, whiteSpace:"pre-line", width:"100%" }}>{slide.body}</div>
          </>
        )}
      </div>
    );
  };

  // ── VIEWER ──
  if (view === "viewer" && currentPres) {
    const slides = currentPres.slides || [];
    const slide = slides[slideIdx] || {};
    const canPrev = slideIdx > 0;
    const canNext = slideIdx < slides.length - 1;

    if (fullscreen) {
      return (
        <div style={{ position:"fixed", inset:0, zIndex:9999, background:"#000", display:"flex", flexDirection:"column" }}>
          {ToastEl}
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>
            {renderSlide(slide, slideIdx, slides.length)}
          </div>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, padding:"16px 0", background:"rgba(0,0,0,0.9)" }}>
            <button disabled={!canPrev} onClick={() => setSlideIdx(i => i-1)} style={{ width:44, height:44, borderRadius:12, border:"none", background: canPrev ? LIME : "rgba(255,255,255,0.1)", color: canPrev ? "#000" : "rgba(255,255,255,0.3)", cursor: canPrev ? "pointer" : "default", fontFamily:"inherit", fontSize:18, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            <span style={{ color:"rgba(255,255,255,0.5)", fontSize:13, fontWeight:600, minWidth:60, textAlign:"center" }}>{slideIdx+1} / {slides.length}</span>
            <button disabled={!canNext} onClick={() => setSlideIdx(i => i+1)} style={{ width:44, height:44, borderRadius:12, border:"none", background: canNext ? LIME : "rgba(255,255,255,0.1)", color: canNext ? "#000" : "rgba(255,255,255,0.3)", cursor: canNext ? "pointer" : "default", fontFamily:"inherit", fontSize:18, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
            <button onClick={() => setFullscreen(false)} style={{ marginLeft:24, padding:"10px 20px", borderRadius:12, border:"1px solid rgba(255,255,255,0.2)", background:"transparent", color:"#fff", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600 }}>Sair</button>
          </div>
        </div>
      );
    }

    return (
      <div className="pg" style={{ paddingBottom:120 }}>
        {ToastEl}
        <CollapseHeader icon={IC.presentations} label="Slides" title={currentPres.title || "Apresentação"} onBack={() => { setView("list"); setCurrentPres(null); }} collapsed={false} />
        <div style={{ padding:"0 16px" }}>
          {/* Toolbar */}
          <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
            <button onClick={() => setFullscreen(true)} style={{ padding:"8px 16px", borderRadius:10, border:`1px solid ${B.border}`, background:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.text, display:"flex", alignItems:"center", gap:6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg> Fullscreen</button>
            <button onClick={() => { setEditSlide(slideIdx); setEditTitle(slide.title || ""); setEditBody(slide.body || ""); }} style={{ padding:"8px 16px", borderRadius:10, border:`1px solid ${B.border}`, background:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.text, display:"flex", alignItems:"center", gap:6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Editar slide</button>
          </div>

          {/* Slide */}
          {renderSlide(slide, slideIdx, slides.length)}

          {/* Navigation */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, marginTop:16 }}>
            <button disabled={!canPrev} onClick={() => setSlideIdx(i => i-1)} style={{ width:44, height:44, borderRadius:12, border:`1px solid ${B.border}`, background: canPrev ? B.accent : "transparent", color: canPrev ? B.dark : B.muted, cursor: canPrev ? "pointer" : "default", fontFamily:"inherit", fontSize:20, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            {slides.map((_, i) => <div key={i} onClick={() => setSlideIdx(i)} style={{ width: i === slideIdx ? 24 : 8, height:8, borderRadius:4, background: i === slideIdx ? B.accent : `${B.muted}30`, cursor:"pointer", transition:"all .2s" }} />)}
            <button disabled={!canNext} onClick={() => setSlideIdx(i => i+1)} style={{ width:44, height:44, borderRadius:12, border:`1px solid ${B.border}`, background: canNext ? B.accent : "transparent", color: canNext ? B.dark : B.muted, cursor: canNext ? "pointer" : "default", fontFamily:"inherit", fontSize:20, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
          </div>

          {/* Slide thumbnails */}
          <div style={{ display:"flex", gap:8, overflowX:"auto", padding:"16px 0", marginTop:8 }}>
            {slides.map((s, i) => (
              <div key={i} onClick={() => setSlideIdx(i)} style={{ flexShrink:0, width: isPDesktop ? 160 : 120, aspectRatio:"16/9", borderRadius:10, background:"linear-gradient(135deg, #0D0D0D, #1a1a2e)", border: i === slideIdx ? `2px solid ${LIME}` : `1px solid ${B.border}`, cursor:"pointer", display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:8, overflow:"hidden" }}>
                <div style={{ fontSize:7, fontWeight:700, color:LIME, textTransform:"uppercase", letterSpacing:0.5, marginBottom:2, textAlign:"center", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", width:"100%" }}>{s.title}</div>
                <div style={{ fontSize:6, color:"rgba(255,255,255,0.4)", textAlign:"center", overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Edit modal */}
        {editSlide !== null && (
          <>
            <div onClick={() => setEditSlide(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9000 }} />
            <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:9001, background:B.bg, borderRadius:"20px 20px 0 0", padding:24, maxHeight:"70vh", overflow:"auto" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <span style={{ fontWeight:800, fontSize:16, color:B.text }}>Editar Slide {editSlide + 1}</span>
                <button onClick={() => setEditSlide(null)} style={{ background:"none", border:"none", cursor:"pointer", color:B.muted, fontSize:20 }}>✕</button>
              </div>
              <label style={{ fontSize:12, fontWeight:600, color:B.muted, marginBottom:4, display:"block" }}>Título</label>
              <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ width:"100%", padding:12, borderRadius:12, border:`1px solid ${B.border}`, background:B.bgCard, color:B.text, fontFamily:"inherit", fontSize:14, marginBottom:12, boxSizing:"border-box" }} />
              <label style={{ fontSize:12, fontWeight:600, color:B.muted, marginBottom:4, display:"block" }}>Conteúdo</label>
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={6} style={{ width:"100%", padding:12, borderRadius:12, border:`1px solid ${B.border}`, background:B.bgCard, color:B.text, fontFamily:"inherit", fontSize:14, resize:"vertical", marginBottom:16, boxSizing:"border-box" }} />
              <button onClick={handleSaveSlide} style={{ width:"100%", padding:14, borderRadius:14, border:"none", background:B.accent, color:B.dark, fontFamily:"inherit", fontSize:15, fontWeight:700, cursor:"pointer" }}>Salvar alteração</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── CREATE ──
  if (view === "create") {
    return (
      <div className="pg" style={{ paddingBottom:120 }}>
        {ToastEl}
        <CollapseHeader icon={IC.presentations} label="Nova" title="Nova Apresentação" onBack={() => setView("list")} collapsed={false} />
        <div style={{ padding:"0 16px" }}>
          {/* Client */}
          <label style={{ fontSize:12, fontWeight:700, color:B.muted, letterSpacing:0.5, textTransform:"uppercase", marginBottom:6, display:"block" }}>Cliente</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
            {(clients || []).filter(c => c.name && c.active !== false).map(c => (
              <button key={c.id} onClick={() => setSelClient(c)} style={{ padding:"10px 18px", borderRadius:12, border: selClient?.id === c.id ? `2px solid ${B.accent}` : `1.5px solid ${B.border}`, background: selClient?.id === c.id ? `${B.accent}15` : B.bgCard, color: selClient?.id === c.id ? B.accent : B.text, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight: selClient?.id === c.id ? 700 : 500, transition:"all .15s" }}>
                {c.name}
              </button>
            ))}
          </div>

          {/* Mode */}
          <label style={{ fontSize:12, fontWeight:700, color:B.muted, letterSpacing:0.5, textTransform:"uppercase", marginBottom:6, display:"block" }}>Tipo de Apresentação</label>
          <div style={{ display:"flex", gap:10, marginBottom:20 }}>
            {[{k:"metrics",l:"Métricas",d:"Resultados do mês com dados reais"},{k:"campaigns",l:"Campanhas",d:"Planejamento a partir de PDF"}].map(m => (
              <div key={m.k} onClick={() => setMode(m.k)} style={{ flex:1, padding:16, borderRadius:16, border: mode === m.k ? `2px solid ${B.accent}` : `1.5px solid ${B.border}`, background: mode === m.k ? `${B.accent}10` : B.bgCard, cursor:"pointer", transition:"all .15s" }}>
                <div style={{ fontSize:15, fontWeight:700, color: mode === m.k ? B.accent : B.text, marginBottom:4 }}>{m.l}</div>
                <div style={{ fontSize:11, color:B.muted }}>{m.d}</div>
              </div>
            ))}
          </div>

          {/* Month */}
          <label style={{ fontSize:12, fontWeight:700, color:B.muted, letterSpacing:0.5, textTransform:"uppercase", marginBottom:6, display:"block" }}>Mês de referência</label>
          <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)} style={{ width:"100%", padding:12, borderRadius:12, border:`1px solid ${B.border}`, background:B.bgCard, color:B.text, fontFamily:"inherit", fontSize:14, marginBottom:20, boxSizing:"border-box" }} />

          {/* PDF Upload (campaigns only) */}
          {mode === "campaigns" && (
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:700, color:B.muted, letterSpacing:0.5, textTransform:"uppercase", marginBottom:6, display:"block" }}>PDF do Calendário de Campanhas</label>
              <label style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:20, borderRadius:16, border:`2px dashed ${pdfFile ? B.accent : B.border}`, background: pdfFile ? `${B.accent}08` : "transparent", cursor:"pointer", transition:"all .15s" }}>
                <input type="file" accept=".pdf" onChange={handlePdfUpload} style={{ display:"none" }} />
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pdfFile ? B.accent : B.muted} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span style={{ fontSize:13, fontWeight:600, color: pdfFile ? B.accent : B.muted }}>{pdfFile ? pdfFile.name : "Selecionar PDF"}</span>
              </label>
              {pdfText && <div style={{ marginTop:8, padding:12, borderRadius:12, background:`${B.accent}06`, fontSize:11, color:B.muted, maxHeight:80, overflow:"auto" }}>Texto extraído: {pdfText.slice(0, 200)}...</div>}
            </div>
          )}

          {/* Generate button */}
          <button onClick={handleGenerate} disabled={generating || !selClient} style={{ width:"100%", padding:16, borderRadius:16, border:"none", background: !selClient ? B.border : "linear-gradient(135deg, #0D0D0D, #1a1a2e)", color: !selClient ? B.muted : LIME, fontFamily:"inherit", fontSize:16, fontWeight:800, cursor: selClient ? "pointer" : "default", display:"flex", alignItems:"center", justifyContent:"center", gap:10, opacity: generating ? 0.7 : 1, transition:"all .2s" }}>
            {generating ? (
              <><div style={{ width:18, height:18, border:"2px solid transparent", borderTopColor:LIME, borderRadius:"50%", animation:"spin 1s linear infinite" }} /> Gerando apresentação...</>
            ) : (
              <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={!selClient ? B.muted : LIME} strokeWidth="2" strokeLinecap="round"><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/><path d="M9 18h6"/><path d="M10 22h4"/></svg> Gerar com IA</>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── LIST ──
  const clientPresentations = presentations;
  return (
    <div className="pg" style={{ paddingBottom:120 }}>
      {ToastEl}
      <CollapseHeader icon={IC.presentations} label="Agência" title="Apresentações" onBack={onBack} collapsed={false} />
      <div style={{ padding:"0 16px" }}>
        {/* New button */}
        <button onClick={() => setView("create")} style={{ width:"100%", padding:16, borderRadius:16, border:`2px dashed ${B.accent}40`, background:`${B.accent}06`, cursor:"pointer", fontFamily:"inherit", fontSize:15, fontWeight:700, color:B.accent, display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:20, transition:"all .15s" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Apresentação
        </button>

        {loading ? (
          <div style={{ textAlign:"center", padding:40, color:B.muted }}>Carregando...</div>
        ) : clientPresentations.length === 0 ? (
          <div style={{ textAlign:"center", padding:40 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
            <div style={{ fontSize:15, fontWeight:700, color:B.text, marginBottom:4 }}>Nenhuma apresentação ainda</div>
            <div style={{ fontSize:13, color:B.muted }}>Crie sua primeira apresentação com IA para encantar seus clientes!</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {clientPresentations.map(p => {
              const cl = (clients || []).find(c => c.id === p.client_id);
              return (
                <div key={p.id} onClick={() => { setCurrentPres(p); setSlideIdx(0); setSelClient(cl || null); setView("viewer"); }} style={{ padding:16, borderRadius:16, background:B.bgCard, border:`1px solid ${B.border}`, cursor:"pointer", transition:"all .15s", position:"relative" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                        <span style={{ fontSize:9, fontWeight:700, padding:"3px 8px", borderRadius:6, background: p.type === "metrics" ? `${B.accent}15` : "#7C3AED15", color: p.type === "metrics" ? B.accent : "#7C3AED", textTransform:"uppercase", letterSpacing:0.5 }}>{p.type === "metrics" ? "Métricas" : "Campanhas"}</span>
                        <span style={{ fontSize:11, color:B.muted }}>{(p.slides || []).length} slides</span>
                      </div>
                      <div style={{ fontSize:14, fontWeight:700, color:B.text, marginBottom:4 }}>{p.title}</div>
                      <div style={{ fontSize:11, color:B.muted }}>{cl?.name || "—"} · {formatMonth(p.month)} · {new Date(p.created_at).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleDelete(p.id); }} disabled={deleting === p.id} style={{ width:32, height:32, borderRadius:8, border:`1px solid ${B.border}`, background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                      {deleting === p.id ? <div style={{ width:12, height:12, border:"2px solid transparent", borderTopColor:B.muted, borderRadius:"50%", animation:"spin 1s linear infinite" }} /> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

'''

if MARKER in content:
    content = content.replace(MARKER, COMPONENT + "\n" + MARKER, 1)
    with open(FILE, "w") as f:
        f.write(content)
    print("SUCCESS - PresentationsPage component inserted")
else:
    print("FAILED - FEED PLANNER marker not found")

import subprocess
result = subprocess.run(["wc", "-l", FILE], capture_output=True, text=True)
print(f"File lines: {result.stdout.strip()}")
