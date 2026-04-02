import sys
FILE = "/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx"
with open(FILE, "r") as f:
    lines = f.readlines()

# Find component boundaries
start = None
end = None
for i, line in enumerate(lines):
    if 'function PresentationsPage(' in line:
        start = i
    if start and i > start and line.strip() == '}' and not any(c in line for c in ['//', '/*']):
        # Check if next line is blank or comment
        if i + 1 < len(lines) and (lines[i+1].strip() == '' or 'FEED PLANNER' in lines[i+1]):
            end = i
            break

print(f"Component found: lines {start+1} to {end+1}")

NEW_COMPONENT = r'''function PresentationsPage({ onBack, clients, user, demands }) {
  const isPDesktop = useIsDesktop();
  const { showToast, ToastEl } = useToast();
  const TOP = isPDesktop ? 70 : `calc(env(safe-area-inset-top, 0px) + 60px)`;
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("list");
  const [selClient, setSelClient] = useState(null);
  const [mode, setMode] = useState("metrics");
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
  const [filterClient, setFilterClient] = useState("all");

  const LIME = "#C8FF00";
  const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const formatMonth = (m) => { const [y, mo] = (m||"").split("-"); return `${monthNames[parseInt(mo,10)-1]||""} ${y||""}`; };

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("presentations").select("*").order("created_at", { ascending: false });
      setPresentations(data || []);
      setLoading(false);
    })();
  }, []);

  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const arr = new Uint8Array(ev.target.result);
      let text = "";
      try {
        const str = new TextDecoder("utf-8", { fatal: false }).decode(arr);
        const matches = str.match(/\(([^)]{2,})\)/g) || [];
        text = matches.map(m => m.slice(1,-1)).filter(t => t.length > 3 && !/^[\x00-\x1f]+$/.test(t)).join(" ");
        if (text.length < 50) text = str.replace(/[^\x20-\x7E\xC0-\xFF\n]/g, " ").replace(/\s{3,}/g, " ").trim().slice(0, 8000);
      } catch { text = "Não foi possível extrair texto do PDF"; }
      setPdfText(text.slice(0, 8000));
    };
    reader.readAsArrayBuffer(file);
  };

  const gatherMetrics = () => {
    if (!selClient) return {};
    const [year, month] = selMonth.split("-").map(Number);
    const clientDemands = (demands || []).filter(d => d.client === selClient.name || d.client_id === selClient.id);
    const monthDemands = clientDemands.filter(d => { const dt = new Date(d.scheduled_date || d.created_at); return dt.getFullYear() === year && dt.getMonth() + 1 === month; });
    const published = monthDemands.filter(d => d.stage === "Publicado" || d.stage === "published");
    const approved = monthDemands.filter(d => d.stage === "Aprovado" || d.stage === "approved");
    const pending = monthDemands.filter(d => d.stage === "Aguardando" || d.stage === "pending" || d.stage === "Aprovação");
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevDemands = clientDemands.filter(d => { const dt = new Date(d.scheduled_date || d.created_at); return dt.getFullYear() === prevYear && dt.getMonth() + 1 === prevMonth; });
    const prevPublished = prevDemands.filter(d => d.stage === "Publicado" || d.stage === "published");
    const types = {}; published.forEach(d => { const t = d.type || d.format || "Post"; types[t] = (types[t]||0) + 1; });
    return { clientName: selClient.name, month: formatMonth(selMonth), totalDemands: monthDemands.length, published: published.length, approved: approved.length, pending: pending.length, prevPublished: prevPublished.length, growth: prevPublished.length > 0 ? Math.round(((published.length - prevPublished.length) / prevPublished.length) * 100) : 0, types, topPosts: published.slice(0, 5).map(d => ({ title: d.title || d.caption?.slice(0,60) || "Post", type: d.type || "Post", date: d.scheduled_date })) };
  };

  const handleGenerate = async () => {
    if (!selClient) { showToast("Selecione um cliente", "error"); return; }
    if (mode === "campaigns" && !pdfText) { showToast("Faça upload do PDF de campanhas", "error"); return; }
    setGenerating(true);
    try {
      const aiKey = await supaGetSetting("anthropic_key");
      if (!aiKey) { showToast("Configure a chave da API Claude nas configurações", "error"); setGenerating(false); return; }
      const metrics = mode === "metrics" ? gatherMetrics() : null;
      const systemPrompt = `Você é um estrategista sênior de marketing digital e especialista em apresentações para clientes.\nSua função é transformar dados e planejamentos em apresentações claras, visuais, estratégicas e envolventes.\n\nRegras obrigatórias:\n- Não crie slides com muito texto\n- Priorize frases curtas, números e palavras-chave\n- Cada slide deve ter no máximo 6 linhas de conteúdo\n- Evite parágrafos\n- Use linguagem simples, direta e com tom positivo\n- Mesmo em cenários negativos, traga uma narrativa de aprendizado e oportunidade\n- A apresentação deve prender atenção e gerar confiança no cliente\n- Estruture como se fosse uma apresentação de agência premium\n- Sempre inclua títulos de slides mais estratégicos e menos genéricos\n\nResponda APENAS com um JSON array de slides, cada um com: { "title": "...", "body": "...", "type": "text|metrics|highlight|cta" }\nO body deve usar "\\n" para quebras de linha. NÃO inclua markdown, apenas texto puro.\nGere entre 8 e 14 slides.\nNÃO inclua nada além do JSON array. Sem explicações, sem markdown fences.`;
      let userPrompt;
      if (mode === "metrics") {
        userPrompt = `Crie uma apresentação de RESULTADOS MENSAIS para o cliente "${metrics.clientName}" referente a ${metrics.month}.\n\nDados do mês:\n- Posts publicados: ${metrics.published}\n- Posts aprovados: ${metrics.approved}\n- Posts pendentes: ${metrics.pending}\n- Total de demandas: ${metrics.totalDemands}\n- Mês anterior: ${metrics.prevPublished} publicados\n- Crescimento: ${metrics.growth}%\n- Tipos: ${JSON.stringify(metrics.types)}\n- Top posts: ${JSON.stringify(metrics.topPosts)}\n\nEstrutura sugerida: Abertura → Visão geral → Crescimento → Conteúdos produzidos → Top conteúdos → Análise estratégica → Próximos passos → Encerramento`;
      } else {
        userPrompt = `Crie uma apresentação de PLANEJAMENTO DE CAMPANHAS para o cliente "${selClient.name}" referente a ${formatMonth(selMonth)}.\n\nConteúdo do calendário de campanhas (extraído do PDF):\n${pdfText}\n\nEstrutura sugerida: Abertura → Visão estratégica do mês → Campanha 1 (detalhes) → Campanha 2+ → Calendário resumido → Investimento sugerido → Próximos passos → Encerramento`;
      }
      const resp = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": aiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 4000, system: systemPrompt, messages: [{ role: "user", content: userPrompt }] }) });
      const data = await resp.json();
      const text = (data.content || []).map(c => c.text || "").join("");
      let slides;
      try { const clean = text.replace(/```json|```/g, "").trim(); slides = JSON.parse(clean); }
      catch { const match = text.match(/\[[\s\S]*\]/); if (match) slides = JSON.parse(match[0]); else throw new Error("Resposta da IA não contém JSON válido"); }
      if (!Array.isArray(slides) || slides.length === 0) throw new Error("Nenhum slide gerado");
      setSaving(true);
      const title = mode === "metrics" ? `Resultados · ${selClient.name} · ${formatMonth(selMonth)}` : `Campanhas · ${selClient.name} · ${formatMonth(selMonth)}`;
      const { data: saved, error } = await supabase.from("presentations").insert({ client_id: selClient.id, title, type: mode, month: selMonth, slides, created_by: user?.id }).select().single();
      if (error) throw error;
      setPresentations(prev => [saved, ...prev]);
      setCurrentPres(saved); setSlideIdx(0); setView("viewer");
      showToast(`Apresentação gerada com ${slides.length} slides!`);
    } catch (err) { console.error("Generate error:", err); showToast(err.message || "Erro ao gerar apresentação", "error"); }
    finally { setGenerating(false); setSaving(false); }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    const { error } = await supabase.from("presentations").delete().eq("id", id);
    if (!error) { setPresentations(prev => prev.filter(p => p.id !== id)); if (currentPres?.id === id) { setCurrentPres(null); setView("list"); } showToast("Apresentação removida"); }
    setDeleting(null);
  };

  const handleSaveSlide = async () => {
    if (!currentPres || editSlide === null) return;
    const newSlides = [...currentPres.slides];
    newSlides[editSlide] = { ...newSlides[editSlide], title: editTitle, body: editBody };
    const { error } = await supabase.from("presentations").update({ slides: newSlides, updated_at: new Date().toISOString() }).eq("id", currentPres.id);
    if (!error) { const updated = { ...currentPres, slides: newSlides }; setCurrentPres(updated); setPresentations(prev => prev.map(p => p.id === updated.id ? updated : p)); setEditSlide(null); showToast("Slide atualizado!"); }
  };

  // ── Slide Renderer ──
  const renderSlide = (slide, idx, total) => {
    const isMetric = slide.type === "metrics" || slide.type === "highlight";
    const isCta = slide.type === "cta";
    return (
      <div style={{ width:"100%", aspectRatio: isPDesktop ? "16/9" : "4/3", background:"linear-gradient(135deg, #0D0D0D 0%, #1a1a2e 50%, #0D0D0D 100%)", borderRadius: fullscreen ? 0 : 20, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding: isPDesktop ? "60px 80px" : "40px 30px", position:"relative", overflow:"hidden", boxSizing:"border-box" }}>
        <div style={{ position:"absolute", top:-100, right:-100, width:300, height:300, borderRadius:"50%", background:`${LIME}08`, filter:"blur(80px)" }} />
        <div style={{ position:"absolute", bottom:-50, left:-50, width:200, height:200, borderRadius:"50%", background:`${LIME}05`, filter:"blur(60px)" }} />
        <div style={{ position:"absolute", top: isPDesktop ? 24 : 16, right: isPDesktop ? 32 : 20, fontSize:12, color:"rgba(255,255,255,0.3)", fontWeight:600 }}>{idx+1}/{total}</div>
        <div style={{ position:"absolute", bottom: isPDesktop ? 24 : 16, left: isPDesktop ? 32 : 20, fontSize:10, color:"rgba(255,255,255,0.15)", fontWeight:700, letterSpacing:1, textTransform:"uppercase" }}>UniqueHub</div>
        {idx === 0 ? (<>
          <div style={{ fontSize: isPDesktop ? 14 : 11, fontWeight:700, color:LIME, letterSpacing:2, textTransform:"uppercase", marginBottom:16 }}>{selClient?.name || currentPres?.title?.split("·")[1]?.trim() || "Cliente"}</div>
          <div style={{ fontSize: isPDesktop ? 36 : 24, fontWeight:900, color:"#fff", textAlign:"center", lineHeight:1.2, marginBottom:12 }}>{slide.title}</div>
          <div style={{ fontSize: isPDesktop ? 16 : 13, color:"rgba(255,255,255,0.6)", textAlign:"center", lineHeight:1.5, maxWidth:600, whiteSpace:"pre-line" }}>{slide.body}</div>
        </>) : isCta ? (<>
          <div style={{ fontSize: isPDesktop ? 32 : 22, fontWeight:900, color:LIME, textAlign:"center", lineHeight:1.2, marginBottom:16 }}>{slide.title}</div>
          <div style={{ fontSize: isPDesktop ? 16 : 13, color:"rgba(255,255,255,0.7)", textAlign:"center", lineHeight:1.6, maxWidth:600, whiteSpace:"pre-line" }}>{slide.body}</div>
        </>) : (<>
          <div style={{ alignSelf:"flex-start", marginBottom: isPDesktop ? 32 : 20, width:"100%" }}>
            <div style={{ display:"inline-block", background:`${LIME}15`, borderRadius:8, padding:"6px 14px", marginBottom:12 }}><span style={{ fontSize:11, fontWeight:700, color:LIME, letterSpacing:1, textTransform:"uppercase" }}>{isMetric ? "Dados" : "Estratégia"}</span></div>
            <div style={{ fontSize: isPDesktop ? 28 : 20, fontWeight:800, color:"#fff", lineHeight:1.2 }}>{slide.title}</div>
          </div>
          <div style={{ alignSelf:"flex-start", fontSize: isPDesktop ? 16 : 13, color:"rgba(255,255,255,0.8)", lineHeight:1.8, whiteSpace:"pre-line", width:"100%" }}>{slide.body}</div>
        </>)}
      </div>
    );
  };

  // ── Shared: Presentation Card ──
  const renderPresCard = (p) => {
    const cl = (clients || []).find(c => c.id === p.client_id);
    return (
      <div key={p.id} onClick={() => { setCurrentPres(p); setSlideIdx(0); setSelClient(cl || null); setView("viewer"); }} style={{ padding: isPDesktop ? 18 : 16, borderRadius:16, background:B.bgCard, border:`1px solid ${B.border}`, cursor:"pointer", transition:"all .15s" }}>
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
  };

  // Filtered presentations
  const filtered = filterClient === "all" ? presentations : presentations.filter(p => { const cl = (clients||[]).find(c=>c.id===p.client_id); return cl?.name === filterClient; });
  const clientNames = [...new Set(presentations.map(p => { const cl = (clients||[]).find(c=>c.id===p.client_id); return cl?.name || "—"; }).filter(n => n !== "—"))].sort();
  const metricsCount = presentations.filter(p => p.type === "metrics").length;
  const campaignsCount = presentations.filter(p => p.type === "campaigns").length;

'''

with open("/Users/matheusbahiense/Desktop/uniquehub/new_pres_component.txt", "w") as f:
    f.write(NEW_COMPONENT)

print(f"Part 1 saved. Component start={start+1}, end={end+1}")
