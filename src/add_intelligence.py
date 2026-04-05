#!/usr/bin/env python3
"""Add Intelligence Page (Radar de Concorrentes + Detector de Tendências) to UniqueHub"""
import re

PATH = '/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx'

with open(PATH, 'r') as f:
    content = f.read()

lines_before = content.count('\n') + 1
print(f"Before: {lines_before} lines")

# ═══════════════════════════════════════════════
# 1. Add "intel" icon to IC object
# ═══════════════════════════════════════════════
anchor1 = '  trending: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,'
intel_icon = '''
  intel: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>,'''
if 'intel: c =>' not in content:
    content = content.replace(anchor1, anchor1 + intel_icon)
    print("1. Added intel icon to IC")
else:
    print("1. Intel icon already exists")

# ═══════════════════════════════════════════════
# 2. Add "intel" pill to PILLS
# ═══════════════════════════════════════════════
anchor2 = "    match4biz: {l:\"Match4Biz\",   k:\"match4biz\"},"
intel_pill = '\n    intel:     {l:"Inteligência", k:"intel"},'
if 'intel:' not in content.split('const PILLS')[1].split('const ACTIONS')[0]:
    content = content.replace(anchor2, anchor2 + intel_pill)
    print("2. Added intel pill to PILLS")
else:
    print("2. Intel pill already exists")

# ═══════════════════════════════════════════════
# 3. Add "intel" to DPANEL_OPTS
# ═══════════════════════════════════════════════
anchor3 = '      notes:{l:"Bloco de Notas",icon:"notes"},'
intel_dpanel = '\n      intel:{l:"Inteligência de Mercado",icon:"intel"},'
if 'intel:{l:"Inteligência' not in content:
    content = content.replace(anchor3, anchor3 + intel_dpanel)
    print("3. Added intel to DPANEL_OPTS")
else:
    print("3. Intel DPANEL already exists")

# ═══════════════════════════════════════════════
# 4. Add "intel" icon to dpIco
# ═══════════════════════════════════════════════
anchor4 = "        notes:<svg"
intel_dpico = '        intel:<svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="18" y1="12" x2="22" y2="12"/></svg>,\n'
if 'intel:<svg' not in content:
    content = content.replace(anchor4, intel_dpico + anchor4)
    print("4. Added intel icon to dpIco")
else:
    print("4. Intel dpIco already exists")

# ═══════════════════════════════════════════════
# 5. Add route for sub === "intel" (agency)
# ═══════════════════════════════════════════════
anchor5 = '        {sub === "match4biz" && <Match4BizPage onBack={() => setSub(null)} clients={sharedClients} user={user} />}'
intel_route = '\n        {sub === "intel" && <IntelligencePage onBack={() => setSub(null)} clients={sharedClients} user={user} demands={sharedDemands} setDemands={setSharedDemands} />}'
if 'sub === "intel"' not in content:
    content = content.replace(anchor5, anchor5 + intel_route)
    print("5. Added intel route")
else:
    print("5. Intel route already exists")

# ═══════════════════════════════════════════════
# 6. Add IntelligencePage component (before CommentRepliesPage)
# ═══════════════════════════════════════════════
anchor6 = 'function CommentRepliesPage({ onBack, clients, user }) {'

INTEL_PAGE = r'''/* ═══════════════════════════════════════════════════════════════════════════════
   INTELIGÊNCIA DE MERCADO — Radar de Concorrentes + Detector de Tendências
═══════════════════════════════════════════════════════════════════════════════ */
function IntelligencePage({ onBack, clients, user, demands, setDemands }) {
  const isDesktop = useIsDesktop();
  const [tab, setTab] = useState("competitors"); // competitors | trends
  const { showToast, ToastEl } = useToast();

  /* ── COMPETITORS STATE ── */
  const [competitors, setCompetitors] = useState([]);
  const [compLoading, setCompLoading] = useState(false);
  const [selClient, setSelClient] = useState("");
  const [addModal, setAddModal] = useState(false);
  const [newComp, setNewComp] = useState({ name:"", instagram:"", segment:"" });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedComp, setExpandedComp] = useState(null);

  /* ── TRENDS STATE ── */
  const [trends, setTrends] = useState([]);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsCache, setTrendsCache] = useState(null);
  const [trendFilter, setTrendFilter] = useState("all");
  const [expandedTrend, setExpandedTrend] = useState(null);
  const [createPostModal, setCreatePostModal] = useState(null);
  const [selPostClient, setSelPostClient] = useState("");

  const CDATA = clients || [];
  const B = { text:"#1A1D23", muted:"#6B7280", bg:"#ECEEF2", card:"#fff", accent:LIME, brd:"rgba(0,0,0,0.06)", red:"#EF4444" };

  /* ── Load competitors from Supabase ── */
  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setCompLoading(true);
      const { data } = await supabase.from("app_settings").select("key,value").eq("key","competitor_profiles");
      if (data?.[0]?.value) { try { setCompetitors(JSON.parse(data[0].value)); } catch {} }
      /* Load trends cache */
      const { data: tc } = await supabase.from("app_settings").select("key,value").eq("key","intel_trends_cache");
      if (tc?.[0]?.value) {
        try {
          const cached = JSON.parse(tc[0].value);
          setTrendsCache(cached);
          if (cached.trends) setTrends(cached.trends);
        } catch {}
      }
      setCompLoading(false);
    })();
  }, []);

  /* ── Save competitors ── */
  const saveCompetitors = async (list) => {
    setCompetitors(list);
    if (!supabase) return;
    await supabase.from("app_settings").upsert({ key:"competitor_profiles", value:JSON.stringify(list) }, { onConflict:"key" });
  };

  /* ── Add competitor ── */
  const handleAddComp = () => {
    if (!newComp.name.trim() || !selClient) return showToast("Preencha nome e selecione um cliente","error");
    const comp = { id:Date.now().toString(), clientId:selClient, clientName:CDATA.find(c=>(c.supaId||c.id)===selClient)?.name||"", name:newComp.name.trim(), instagram:newComp.instagram.trim().replace("@",""), segment:newComp.segment.trim(), addedAt:new Date().toISOString(), lastAnalysis:null, analysisData:null };
    saveCompetitors([...competitors, comp]);
    setNewComp({ name:"", instagram:"", segment:"" });
    setAddModal(false);
    showToast("Concorrente adicionado!");
  };

  /* ── Delete competitor ── */
  const handleDeleteComp = (id) => {
    saveCompetitors(competitors.filter(c => c.id !== id));
    showToast("Removido");
  };

  /* ── Analyze competitor with AI ── */
  const analyzeCompetitor = async (comp) => {
    setAnalyzing(true);
    setExpandedComp(comp.id);
    try {
      const keys = await supaGetAIKeys();
      const clientObj = CDATA.find(c => (c.supaId||c.id) === comp.clientId);
      const prompt = `Analise o concorrente "${comp.name}" (Instagram: @${comp.instagram || "desconhecido"}, segmento: ${comp.segment || clientObj?.segment || "não informado"}) em comparação com o cliente "${comp.clientName}" (segmento: ${clientObj?.segment || "marketing digital"}).

Busque informações públicas atuais sobre esse concorrente usando web search.

Responda SOMENTE em JSON válido, sem markdown:
{
  "summary": "Resumo em 2 frases sobre o concorrente",
  "metrics": {
    "postFrequency": "ex: 4-5 posts/semana",
    "mainFormats": ["Reels","Carrossel","Stories"],
    "topHashtags": ["#tag1","#tag2","#tag3"],
    "estimatedEngagement": "ex: 2-4%",
    "followers": "ex: 15K",
    "tone": "ex: Informal e jovem"
  },
  "strengths": ["ponto forte 1","ponto forte 2","ponto forte 3"],
  "weaknesses": ["fraqueza 1","fraqueza 2"],
  "opportunities": ["oportunidade 1 para o cliente","oportunidade 2"],
  "actionItems": ["ação sugerida 1","ação sugerida 2","ação sugerida 3"]
}`;

      let result = null;
      if (keys.claude_key) {
        const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{"Content-Type":"application/json","x-api-key":keys.claude_key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}, body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:2000, messages:[{role:"user",content:prompt}] }) });
        const d = await r.json();
        const txt = d.content?.[0]?.text || "";
        try { result = JSON.parse(txt.replace(/```json|```/g,"").trim()); } catch { result = { summary: txt.slice(0,200), metrics:{}, strengths:[], weaknesses:[], opportunities:[], actionItems:[] }; }
      } else if (keys.gemini_key) {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key="+keys.gemini_key, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:2000} }) });
        const d = await r.json();
        const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
        try { result = JSON.parse(txt.replace(/```json|```/g,"").trim()); } catch { result = { summary: txt.slice(0,200), metrics:{}, strengths:[], weaknesses:[], opportunities:[], actionItems:[] }; }
      }
      if (result) {
        const updated = competitors.map(c => c.id === comp.id ? {...c, lastAnalysis: new Date().toISOString(), analysisData: result} : c);
        saveCompetitors(updated);
        setAnalysisResult(result);
        showToast("Análise concluída!");
      }
    } catch(e) { console.error(e); showToast("Erro na análise","error"); }
    setAnalyzing(false);
  };

  /* ── Fetch trends with AI ── */
  const fetchTrends = async () => {
    setTrendsLoading(true);
    try {
      const keys = await supaGetAIKeys();
      const segments = [...new Set(CDATA.map(c => c.segment).filter(Boolean))];
      const clientList = CDATA.map(c => `${c.name} (${c.segment||"geral"})`).join(", ");
      const prompt = `Você é um analista de tendências de marketing digital no Brasil. Busque tendências ATUAIS usando web search.

Clientes da agência: ${clientList || "diversos segmentos"}
Segmentos: ${segments.join(", ") || "marketing, gastronomia, tecnologia, saúde, beleza"}

Busque e retorne 8-12 tendências atuais divididas em categorias:
- viral: memes, challenges, áudios virais no TikTok/Reels/X
- news: notícias relevantes para marketing/negócios
- seasonal: datas comemorativas, eventos próximos
- local: tendências regionais do Brasil

Responda SOMENTE em JSON válido, sem markdown:
[
  {
    "id": "1",
    "type": "viral|news|seasonal|local",
    "title": "Título da tendência",
    "description": "Descrição em 2-3 frases",
    "platforms": ["instagram","tiktok","x"],
    "urgency": "high|medium|low",
    "whyItMatters": "Por que é relevante para agências",
    "postIdea": "Ideia concreta de como usar em post",
    "suggestedClients": ["Nome do cliente 1","Nome do cliente 2"],
    "hashtags": ["#tag1","#tag2","#tag3"],
    "source": "De onde vem (ex: Trending no X, Google Trends)"
  }
]`;

      let result = null;
      if (keys.claude_key) {
        const r = await fetch("https://api.anthropic.com/v1/messages", { method:"POST", headers:{"Content-Type":"application/json","x-api-key":keys.claude_key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"}, body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:3000, messages:[{role:"user",content:prompt}] }) });
        const d = await r.json();
        const txt = d.content?.[0]?.text || "";
        try { result = JSON.parse(txt.replace(/```json|```/g,"").trim()); } catch { result = []; }
      } else if (keys.gemini_key) {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key="+keys.gemini_key, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:3000} }) });
        const d = await r.json();
        const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || "";
        try { result = JSON.parse(txt.replace(/```json|```/g,"").trim()); } catch { result = []; }
      }
      if (result && Array.isArray(result)) {
        setTrends(result);
        const cache = { trends: result, updatedAt: new Date().toISOString() };
        setTrendsCache(cache);
        if (supabase) await supabase.from("app_settings").upsert({ key:"intel_trends_cache", value:JSON.stringify(cache) }, { onConflict:"key" });
        showToast(`${result.length} tendências encontradas!`);
      }
    } catch(e) { console.error(e); showToast("Erro ao buscar tendências","error"); }
    setTrendsLoading(false);
  };

  /* ── Create demand from trend ── */
  const createPostFromTrend = async (trend) => {
    if (!selPostClient) return showToast("Selecione um cliente","error");
    if (!supabase) return;
    const clientObj = CDATA.find(c => (c.supaId||c.id) === selPostClient);
    const demand = {
      client_id: selPostClient,
      title: `[Trend] ${trend.title}`,
      description: `${trend.postIdea}\n\n---\nFonte: ${trend.source||"Radar de Tendências"}\nHashtags: ${(trend.hashtags||[]).join(" ")}`,
      stage: "idea",
      format: "feed",
      created_by: user?.id,
      priority: trend.urgency === "high" ? "high" : "normal"
    };
    const { data, error } = await supabase.from("demands").insert(demand).select().single();
    if (error) return showToast("Erro ao criar demanda","error");
    if (demands && setDemands) setDemands([data, ...demands]);
    setCreatePostModal(null);
    setSelPostClient("");
    showToast(`Demanda criada para ${clientObj?.name||"cliente"}!`);
  };

  /* ── Filtered ── */
  const filteredComps = selClient ? competitors.filter(c => c.clientId === selClient) : competitors;
  const filteredTrends = trendFilter === "all" ? trends : trends.filter(t => t.type === trendFilter);
  const trendCounts = { all: trends.length, viral: trends.filter(t=>t.type==="viral").length, news: trends.filter(t=>t.type==="news").length, seasonal: trends.filter(t=>t.type==="seasonal").length, local: trends.filter(t=>t.type==="local").length };

  const TYPE_COLORS = { viral:"#EC4899", news:"#3B82F6", seasonal:"#10B981", local:"#F59E0B" };
  const TYPE_LABELS = { viral:"Viral", news:"Notícia", seasonal:"Sazonal", local:"Local" };
  const TYPE_ICONS = { viral:"🔥", news:"📰", seasonal:"📅", local:"📍" };
  const URG_LABELS = { high:"⚡ Urgente", medium:"📌 Esta semana", low:"🗓️ Duradouro" };
  const PLAT_ICONS = { instagram:"📸", tiktok:"🎵", x:"𝕏", youtube:"▶️", facebook:"📘", linkedin:"💼", threads:"🧵" };

  /* ── RENDER ── */
  const _dsk = isDesktop;
  const maxW = _dsk ? 1200 : undefined;

  return <div style={{minHeight:"100vh",background:B.bg,fontFamily:"'Inter',sans-serif"}}>
    {ToastEl}
    {/* Header */}
    <div style={{background:"#1A1D23",padding:_dsk?"28px 40px":"20px 16px",color:"#fff"}}>
      <div style={{maxWidth:maxW,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <button onClick={onBack} style={{background:"rgba(255,255,255,0.1)",border:"none",borderRadius:10,padding:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
          <div>
            <p style={{fontSize:11,fontWeight:600,letterSpacing:1.5,color:LIME,textTransform:"uppercase",marginBottom:2}}>Análise Estratégica</p>
            <h1 style={{fontSize:_dsk?26:20,fontWeight:800,letterSpacing:-0.5}}>Inteligência de Mercado</h1>
          </div>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",gap:4,background:"rgba(255,255,255,0.08)",borderRadius:12,padding:4}}>
          {[["competitors","🎯 Radar de Concorrentes"],["trends","📡 Detector de Tendências"]].map(([k,l]) => (
            <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:"10px 16px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:tab===k?700:500,background:tab===k?LIME:"transparent",color:tab===k?"#0D0D0D":"rgba(255,255,255,0.6)",transition:"all .2s"}}>{l}</button>
          ))}
        </div>
      </div>
    </div>

    <div style={{maxWidth:maxW,margin:"0 auto",padding:_dsk?"24px 40px":"16px"}}>

      {/* ═══════════════════════════════════════════════
          TAB: RADAR DE CONCORRENTES
      ═══════════════════════════════════════════════ */}
      {tab === "competitors" && <>
        {/* Toolbar */}
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16,alignItems:"center"}}>
          <select value={selClient} onChange={e=>setSelClient(e.target.value)} style={{padding:"8px 12px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.08)",background:"#fff",fontFamily:"inherit",fontSize:13,fontWeight:500,minWidth:180}}>
            <option value="">Todos os clientes</option>
            {CDATA.map(c => <option key={c.supaId||c.id} value={c.supaId||c.id}>{c.name}</option>)}
          </select>
          <div style={{flex:1}}/>
          <button onClick={()=>setAddModal(true)} style={{padding:"10px 20px",borderRadius:12,border:"none",background:LIME,color:"#0D0D0D",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Adicionar concorrente
          </button>
        </div>

        {/* Empty state */}
        {filteredComps.length === 0 && !compLoading && (
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{width:80,height:80,borderRadius:20,background:`${LIME}15`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:36}}>🎯</div>
            <p style={{fontSize:18,fontWeight:700,color:B.text,marginBottom:8}}>Nenhum concorrente cadastrado</p>
            <p style={{fontSize:14,color:B.muted,maxWidth:400,margin:"0 auto",lineHeight:1.6}}>Adicione perfis de concorrentes dos seus clientes para monitorar e gerar insights estratégicos com IA.</p>
          </div>
        )}

        {/* Competitors grid */}
        {filteredComps.length > 0 && (
          <div style={{display:"grid",gridTemplateColumns:_dsk?"repeat(auto-fill,minmax(360px,1fr))":"1fr",gap:12}}>
            {filteredComps.map(comp => {
              const isExp = expandedComp === comp.id;
              const ad = comp.analysisData;
              return <div key={comp.id} style={{background:"#fff",borderRadius:16,border:"1.5px solid rgba(0,0,0,0.06)",overflow:"hidden",transition:"all .2s"}}>
                {/* Card header */}
                <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
                  <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#667eea,#764ba2)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:16,flexShrink:0}}>{comp.name.charAt(0).toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:15,fontWeight:700,color:B.text}}>{comp.name}</p>
                    <p style={{fontSize:12,color:B.muted}}>{comp.instagram ? `@${comp.instagram}` : "Sem @"} · {comp.clientName}</p>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>analyzeCompetitor(comp)} disabled={analyzing} style={{padding:"6px 14px",borderRadius:8,border:"none",background:`${LIME}15`,color:"#1A1D23",fontFamily:"inherit",fontSize:11,fontWeight:700,cursor:"pointer"}}>{analyzing && expandedComp===comp.id ? "⏳":"🔍"} Analisar</button>
                    <button onClick={()=>handleDeleteComp(comp.id)} style={{padding:"6px 8px",borderRadius:8,border:"none",background:"rgba(239,68,68,0.08)",color:"#EF4444",fontFamily:"inherit",fontSize:11,cursor:"pointer"}}>✕</button>
                  </div>
                </div>
                {/* Segment tag */}
                {comp.segment && <div style={{padding:"0 20px 12px"}}><span style={{fontSize:10,fontWeight:600,background:`${LIME}15`,color:"#1A1D23",padding:"3px 10px",borderRadius:6}}>{comp.segment}</span></div>}
                {/* Analysis result */}
                {ad && <div style={{borderTop:"1px solid rgba(0,0,0,0.04)",padding:"16px 20px"}}>
                  <p style={{fontSize:13,color:B.muted,lineHeight:1.6,marginBottom:12}}>{ad.summary}</p>
                  {/* Metrics grid */}
                  {ad.metrics && <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:12}}>
                    {ad.metrics.postFrequency && <div style={{background:B.bg,borderRadius:10,padding:"8px 10px",textAlign:"center"}}><p style={{fontSize:10,color:B.muted,marginBottom:2}}>Frequência</p><p style={{fontSize:12,fontWeight:700}}>{ad.metrics.postFrequency}</p></div>}
                    {ad.metrics.estimatedEngagement && <div style={{background:B.bg,borderRadius:10,padding:"8px 10px",textAlign:"center"}}><p style={{fontSize:10,color:B.muted,marginBottom:2}}>Engajamento</p><p style={{fontSize:12,fontWeight:700}}>{ad.metrics.estimatedEngagement}</p></div>}
                    {ad.metrics.followers && <div style={{background:B.bg,borderRadius:10,padding:"8px 10px",textAlign:"center"}}><p style={{fontSize:10,color:B.muted,marginBottom:2}}>Seguidores</p><p style={{fontSize:12,fontWeight:700}}>{ad.metrics.followers}</p></div>}
                  </div>}
                  {/* Formats */}
                  {ad.metrics?.mainFormats && <div style={{marginBottom:10}}><p style={{fontSize:10,fontWeight:600,color:B.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Formatos</p><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{ad.metrics.mainFormats.map((f,i)=><span key={i} style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:"rgba(59,130,246,0.08)",color:"#3B82F6",fontWeight:600}}>{f}</span>)}</div></div>}
                  {/* Hashtags */}
                  {ad.metrics?.topHashtags && <div style={{marginBottom:10}}><p style={{fontSize:10,fontWeight:600,color:B.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Hashtags</p><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{ad.metrics.topHashtags.map((h,i)=><span key={i} style={{fontSize:11,padding:"3px 8px",borderRadius:6,background:"rgba(0,0,0,0.04)",color:B.text,fontWeight:500}}>{h}</span>)}</div></div>}
                  {/* Strengths/Weaknesses/Opportunities */}
                  <div style={{display:"grid",gridTemplateColumns:_dsk?"1fr 1fr":"1fr",gap:8,marginBottom:10}}>
                    {ad.strengths?.length>0 && <div style={{background:"rgba(16,185,129,0.06)",borderRadius:10,padding:"10px 12px"}}><p style={{fontSize:10,fontWeight:700,color:"#10B981",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>💪 Pontos Fortes</p>{ad.strengths.map((s,i)=><p key={i} style={{fontSize:12,color:B.text,marginBottom:3,lineHeight:1.4}}>• {s}</p>)}</div>}
                    {ad.weaknesses?.length>0 && <div style={{background:"rgba(239,68,68,0.06)",borderRadius:10,padding:"10px 12px"}}><p style={{fontSize:10,fontWeight:700,color:"#EF4444",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>⚠️ Fraquezas</p>{ad.weaknesses.map((w,i)=><p key={i} style={{fontSize:12,color:B.text,marginBottom:3,lineHeight:1.4}}>• {w}</p>)}</div>}
                  </div>
                  {ad.opportunities?.length>0 && <div style={{background:`${LIME}08`,borderRadius:10,padding:"10px 12px",marginBottom:10,borderLeft:`3px solid ${LIME}`}}><p style={{fontSize:10,fontWeight:700,color:"#1A1D23",textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>🚀 Oportunidades</p>{ad.opportunities.map((o,i)=><p key={i} style={{fontSize:12,color:B.text,marginBottom:3,lineHeight:1.4}}>• {o}</p>)}</div>}
                  {/* Action Items */}
                  {ad.actionItems?.length>0 && <div><p style={{fontSize:10,fontWeight:700,color:B.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>✅ Ações Sugeridas</p>{ad.actionItems.map((a,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}><span style={{width:20,height:20,borderRadius:6,background:`${LIME}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0,color:"#1A1D23"}}>{i+1}</span><p style={{fontSize:12,color:B.text,lineHeight:1.4}}>{a}</p></div>)}</div>}
                  <p style={{fontSize:10,color:B.muted,marginTop:8}}>Analisado em {new Date(comp.lastAnalysis).toLocaleDateString("pt-BR")} às {new Date(comp.lastAnalysis).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
                </div>}
              </div>;
            })}
          </div>
        )}

        {/* Add Modal */}
        {addModal && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setAddModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,padding:24,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{width:40,height:4,borderRadius:2,background:"rgba(0,0,0,0.1)",margin:"0 auto 16px"}}/>
            <h3 style={{fontSize:18,fontWeight:800,marginBottom:16}}>Adicionar Concorrente</h3>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:B.muted,marginBottom:4,display:"block"}}>Cliente *</label>
                <select value={selClient||""} onChange={e=>{setSelClient(e.target.value);}} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.1)",fontFamily:"inherit",fontSize:14}}>
                  <option value="">Selecione o cliente</option>
                  {CDATA.map(c=><option key={c.supaId||c.id} value={c.supaId||c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:B.muted,marginBottom:4,display:"block"}}>Nome do concorrente *</label>
                <input value={newComp.name} onChange={e=>setNewComp({...newComp,name:e.target.value})} placeholder="Ex: Empresa XYZ" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.1)",fontFamily:"inherit",fontSize:14,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:B.muted,marginBottom:4,display:"block"}}>@ Instagram</label>
                <input value={newComp.instagram} onChange={e=>setNewComp({...newComp,instagram:e.target.value})} placeholder="@usuario" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.1)",fontFamily:"inherit",fontSize:14,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{fontSize:12,fontWeight:600,color:B.muted,marginBottom:4,display:"block"}}>Segmento</label>
                <input value={newComp.segment} onChange={e=>setNewComp({...newComp,segment:e.target.value})} placeholder="Ex: Gastronomia, Moda, Tech" style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.1)",fontFamily:"inherit",fontSize:14,boxSizing:"border-box"}}/>
              </div>
              <button onClick={handleAddComp} style={{padding:"14px",borderRadius:12,border:"none",background:LIME,color:"#0D0D0D",fontFamily:"inherit",fontSize:15,fontWeight:700,cursor:"pointer",marginTop:8}}>Adicionar</button>
            </div>
          </div>
        </div>}
      </>}

      {/* ═══════════════════════════════════════════════
          TAB: DETECTOR DE TENDÊNCIAS
      ═══════════════════════════════════════════════ */}
      {tab === "trends" && <>
        {/* Action bar */}
        <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16,alignItems:"center"}}>
          <button onClick={fetchTrends} disabled={trendsLoading} style={{padding:"12px 24px",borderRadius:12,border:"none",background:"linear-gradient(135deg,#EC4899,#8B5CF6)",color:"#fff",fontFamily:"inherit",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,opacity:trendsLoading?0.7:1}}>
            {trendsLoading ? <span style={{display:"inline-block",width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTop:"2px solid #fff",borderRadius:"50%",animation:"spin 1s linear infinite"}}></span> : "📡"}
            {trendsLoading ? "Buscando..." : "Buscar Tendências Agora"}
          </button>
          <div style={{flex:1}}/>
          {trendsCache && <p style={{fontSize:11,color:B.muted}}>Atualizado {new Date(trendsCache.updatedAt).toLocaleDateString("pt-BR")} {new Date(trendsCache.updatedAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>}
        </div>

        {/* Filter tabs */}
        {trends.length > 0 && <div style={{display:"flex",gap:4,marginBottom:16,overflowX:"auto",paddingBottom:4}}>
          {[["all","📡 Todos"],["viral","🔥 Virais"],["news","📰 Notícias"],["seasonal","📅 Sazonais"],["local","📍 Locais"]].map(([k,l]) => (
            <button key={k} onClick={()=>setTrendFilter(k)} style={{padding:"8px 14px",borderRadius:10,border:trendFilter===k?`2px solid ${TYPE_COLORS[k]||LIME}`:"1.5px solid rgba(0,0,0,0.06)",background:trendFilter===k?`${TYPE_COLORS[k]||LIME}12`:"#fff",fontFamily:"inherit",fontSize:12,fontWeight:trendFilter===k?700:500,cursor:"pointer",whiteSpace:"nowrap",color:trendFilter===k?TYPE_COLORS[k]||"#1A1D23":B.muted}}>{l} ({trendCounts[k]||0})</button>
          ))}
        </div>}

        {/* Empty state */}
        {trends.length === 0 && !trendsLoading && (
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{width:80,height:80,borderRadius:20,background:"linear-gradient(135deg,rgba(236,72,153,0.1),rgba(139,92,246,0.1))",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:36}}>📡</div>
            <p style={{fontSize:18,fontWeight:700,color:B.text,marginBottom:8}}>Nenhuma tendência carregada</p>
            <p style={{fontSize:14,color:B.muted,maxWidth:400,margin:"0 auto",lineHeight:1.6}}>Clique em "Buscar Tendências Agora" para a IA identificar memes, notícias e oportunidades em tempo real.</p>
          </div>
        )}

        {/* Trends grid */}
        {filteredTrends.length > 0 && (
          <div style={{display:"grid",gridTemplateColumns:_dsk?"repeat(auto-fill,minmax(360px,1fr))":"1fr",gap:12}}>
            {filteredTrends.map((trend,idx) => {
              const tc = TYPE_COLORS[trend.type] || "#6B7280";
              const isExp = expandedTrend === idx;
              return <div key={idx} style={{background:"#fff",borderRadius:16,border:"1.5px solid rgba(0,0,0,0.06)",borderLeft:`4px solid ${tc}`,overflow:"hidden",transition:"all .2s",cursor:"pointer"}} onClick={()=>setExpandedTrend(isExp?null:idx)}>
                <div style={{padding:"16px 20px"}}>
                  {/* Type + urgency badges */}
                  <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                    <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:`${tc}15`,color:tc}}>{TYPE_ICONS[trend.type]} {TYPE_LABELS[trend.type]}</span>
                    <span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:6,background:trend.urgency==="high"?"rgba(239,68,68,0.08)":trend.urgency==="medium"?"rgba(245,158,11,0.08)":"rgba(107,114,128,0.08)",color:trend.urgency==="high"?"#EF4444":trend.urgency==="medium"?"#F59E0B":"#6B7280"}}>{URG_LABELS[trend.urgency]||"📌"}</span>
                  </div>
                  <p style={{fontSize:15,fontWeight:700,color:B.text,marginBottom:6}}>{trend.title}</p>
                  <p style={{fontSize:12,color:B.muted,lineHeight:1.5}}>{trend.description}</p>
                  {/* Platforms */}
                  {trend.platforms && <div style={{display:"flex",gap:4,marginTop:8}}>{trend.platforms.map((p,i)=><span key={i} style={{fontSize:12,padding:"2px 6px",borderRadius:4,background:"rgba(0,0,0,0.03)"}} title={p}>{PLAT_ICONS[p]||p}</span>)}</div>}
                  {trend.source && <p style={{fontSize:10,color:B.muted,marginTop:6}}>📍 {trend.source}</p>}

                  {/* Expanded content */}
                  {isExp && <div style={{marginTop:12,borderTop:"1px solid rgba(0,0,0,0.04)",paddingTop:12}} onClick={e=>e.stopPropagation()}>
                    {trend.whyItMatters && <div style={{background:"rgba(139,92,246,0.06)",borderRadius:10,padding:"10px 12px",marginBottom:8}}><p style={{fontSize:10,fontWeight:700,color:"#8B5CF6",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Por que importa</p><p style={{fontSize:12,color:B.text,lineHeight:1.5,fontStyle:"italic"}}>{trend.whyItMatters}</p></div>}
                    {trend.postIdea && <div style={{background:`${LIME}08`,borderRadius:10,padding:"10px 12px",marginBottom:8,borderLeft:`3px solid ${LIME}`}}><p style={{fontSize:10,fontWeight:700,color:"#1A1D23",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>💡 Ideia de post</p><p style={{fontSize:12,color:B.text,lineHeight:1.5}}>{trend.postIdea}</p></div>}
                    {trend.suggestedClients?.length > 0 && <div style={{marginBottom:8}}><p style={{fontSize:10,fontWeight:600,color:B.muted,marginBottom:4}}>Clientes sugeridos:</p><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{trend.suggestedClients.map((sc,i)=><span key={i} style={{fontSize:11,padding:"3px 10px",borderRadius:6,background:"rgba(139,92,246,0.1)",color:"#8B5CF6",fontWeight:600}}>{sc}</span>)}</div></div>}
                    {trend.hashtags?.length > 0 && <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>{trend.hashtags.map((h,i)=><span key={i} style={{fontSize:11,padding:"2px 8px",borderRadius:6,background:"rgba(0,0,0,0.04)",color:B.muted}}>{h}</span>)}</div>}
                    <button onClick={()=>{setCreatePostModal(trend);setSelPostClient("");}} style={{width:"100%",padding:"12px",borderRadius:10,border:"none",background:LIME,color:"#0D0D0D",fontFamily:"inherit",fontSize:13,fontWeight:700,cursor:"pointer"}}>✨ Criar post a partir desta tendência</button>
                  </div>}
                </div>
              </div>;
            })}
          </div>
        )}

        {/* Create post modal */}
        {createPostModal && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setCreatePostModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,padding:24}}>
            <div style={{width:40,height:4,borderRadius:2,background:"rgba(0,0,0,0.1)",margin:"0 auto 16px"}}/>
            <h3 style={{fontSize:16,fontWeight:800,marginBottom:4}}>Criar post a partir da tendência</h3>
            <p style={{fontSize:13,color:B.muted,marginBottom:16}}>{createPostModal.title}</p>
            {createPostModal.postIdea && <div style={{background:`${LIME}08`,borderRadius:10,padding:"10px 12px",marginBottom:16,borderLeft:`3px solid ${LIME}`}}><p style={{fontSize:12,color:B.text,lineHeight:1.5}}>{createPostModal.postIdea}</p></div>}
            <label style={{fontSize:12,fontWeight:600,color:B.muted,marginBottom:6,display:"block"}}>Para qual cliente?</label>
            <select value={selPostClient} onChange={e=>setSelPostClient(e.target.value)} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid rgba(0,0,0,0.1)",fontFamily:"inherit",fontSize:14,marginBottom:12}}>
              <option value="">Selecione</option>
              {CDATA.map(c=>{
                const isSuggested = (createPostModal.suggestedClients||[]).includes(c.name);
                return <option key={c.supaId||c.id} value={c.supaId||c.id}>{c.name}{isSuggested?" ⭐ Sugerido":""}</option>;
              })}
            </select>
            <button onClick={()=>createPostFromTrend(createPostModal)} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:LIME,color:"#0D0D0D",fontFamily:"inherit",fontSize:15,fontWeight:700,cursor:"pointer"}}>Criar demanda</button>
          </div>
        </div>}

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </>}

    </div>
  </div>;
}

'''

if 'function IntelligencePage' not in content:
    content = content.replace(anchor6, INTEL_PAGE + anchor6)
    print("6. Added IntelligencePage component")
else:
    print("6. IntelligencePage already exists")

# ═══════════════════════════════════════════════
# VERIFY & WRITE
# ═══════════════════════════════════════════════
assert 'function IntelligencePage' in content, "IntelligencePage not found!"
assert 'sub === "intel"' in content, "Intel route not found!"
assert 'intel:{l:"Inteligência' in content, "Intel DPANEL not found!"

with open(PATH, 'w') as f:
    f.write(content)

lines_after = content.count('\n') + 1
print(f"\nAfter: {lines_after} lines (added {lines_after - lines_before})")
print("SUCCESS!")
