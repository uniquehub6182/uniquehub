function ClientMatch4Biz({ onBack, user }) {
  const [accepted, setAccepted] = useState(() => { try { return localStorage.getItem("uh_m4b_accepted") === "1"; } catch { return false; } });
  const [tab, setTab] = useState("discover");
  const [credits, setCredits] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [matches, setMatches] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [myClient, setMyClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [swipeAnim, setSwipeAnim] = useState(null);
  const [showBuy, setShowBuy] = useState(false);
  const [showProfile, setShowProfile] = useState(null);
  const [buyStep, setBuyStep] = useState("packages"); /* packages | payment */
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [clientScores, setClientScores] = useState({});
  const [clientRanks, setClientRanks] = useState({});
  const { showToast, ToastEl } = useToast();

  /* ── Plan-based credits ── */
  const getCreditsForPlan = (monthly) => {
    const v = parseFloat(monthly) || 0;
    if (v >= 4480) return 9999;
    if (v >= 3480) return 30;
    if (v >= 2480) return 20;
    if (v >= 1480) return 10;
    return 10;
  };

  /* ── Load clients + matches + scores from Supabase ── */
  useEffect(() => {
    if (!supabase || !user?.email) { setLoading(false); return; }
    (async () => {
      try {
        const { data: cl } = await supabase.from("clients").select("*").eq("contact_email", user.email).maybeSingle();
        if (!cl) { setLoading(false); return; }
        setMyClient(cl);
        const planCredits = getCreditsForPlan(cl.monthly_value);
        try { const extra = parseInt(localStorage.getItem("uh_m4b_credits_" + cl.id) || "0"); setCredits(planCredits + extra); } catch { setCredits(planCredits); }
        const { data: clients } = await supabase.from("clients").select("id, name, *, logo_url, contact_name, contact_email, notes, start_date").neq("id", cl.id).eq("status", "ativo");
        if (clients) setAllClients(clients);
        const { data: m4b } = await supabase.from("match4biz").select("*").or("client_a_id.eq." + cl.id + ",client_b_id.eq." + cl.id);
        if (m4b) setMatches(m4b);
        /* Load gamification scores for all clients */
        try {
          const { data: scores } = await supabase.from("client_scores").select("client_id, points");
          if (scores) {
            const byClient = {};
            scores.forEach(s => { byClient[s.client_id] = (byClient[s.client_id] || 0) + Number(s.points); });
            setClientScores(byClient);
            const sorted = Object.entries(byClient).sort((a,b) => b[1] - a[1]);
            const ranks = {};
            sorted.forEach(([id], i) => { ranks[id] = i + 1; });
            setClientRanks(ranks);
          }
        } catch {}
      } catch(e) { console.warn("[M4B]", e); }
      setLoading(false);
    })();
  }, [user?.email]);

  const matchedIds = matches.map(m => m.client_a_id === myClient?.id ? m.client_b_id : m.client_a_id);
  const available = allClients.filter(c => !matchedIds.includes(c.id));
  const current = available[currentIdx % Math.max(available.length, 1)];
  const isUnlimited = credits >= 9999;
  const noCredits = !isUnlimited && credits < 10;

  const doAccept = () => { setAccepted(true); try { localStorage.setItem("uh_m4b_accepted", "1"); } catch {} };

  const handleLike = async () => {
    if (!current || !myClient) return;
    if (noCredits) { setShowBuy(true); setBuyStep("packages"); return; }
    setSwipeAnim("like");
    setTimeout(async () => {
      try {
        const existing = matches.find(m => (m.client_a_id === current.id && m.client_b_id === myClient.id) || (m.client_a_id === myClient.id && m.client_b_id === current.id));
        if (existing) {
          const myField = existing.client_a_id === myClient.id ? "client_a_confirmed" : "client_b_confirmed";
          await supabase.from("match4biz").update({ [myField]: true, status: "mutual" }).eq("id", existing.id);
          setMatches(prev => prev.map(m => m.id === existing.id ? { ...m, [myField]: true, status: "mutual" } : m));
          setCelebration(current); setTimeout(() => setCelebration(null), 3500);
        } else {
          const newMatch = { client_a_id: myClient.id, client_a_name: myClient.name, client_b_id: current.id, client_b_name: current.name, status: "pending", messages: [], created_by: user?.name || "Cliente", client_a_confirmed: true, client_b_confirmed: false };
          const saved = await supaCreateMatch(newMatch);
          if (saved) { setMatches(prev => [...prev, saved]); showToast("Match enviado!"); }
        }
      } catch(e) { console.warn("[M4B] Match save:", e); }
      if (!isUnlimited) {
        const newCredits = credits - 10;
        setCredits(newCredits);
        try { localStorage.setItem("uh_m4b_credits_" + myClient.id, String(Math.max(0, newCredits - getCreditsForPlan(myClient.monthly_value)))); } catch {}
      }
      setCurrentIdx(i => i + 1);
      setSwipeAnim(null);
    }, 350);
  };

  const handlePass = () => {
    if (!current) return;
    setSwipeAnim("pass");
    setTimeout(() => { setCurrentIdx(i => i + 1); setSwipeAnim(null); }, 300);
  };

  const getInitials = (name) => (name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const getColor = (name) => { const colors = ["#10B981","#3B82F6","#8B5CF6","#EC4899","#F59E0B","#EF4444","#06B6D4","#84CC16"]; let h = 0; for (let i = 0; i < (name||"").length; i++) h = ((h << 5) - h) + name.charCodeAt(i); return colors[Math.abs(h) % colors.length]; };
  const getSince = (d) => { if (!d) return ""; const y = new Date(d).getFullYear(); return "Desde " + y; };
  const getScore = (id) => Math.min(100, Math.round(clientScores[id] || 0));
  const getRank = (id) => clientRanks[id] || "—";
  const totalRanked = Object.keys(clientRanks).length || 1;

  const [chatMatch, setChatMatch] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [touchStartX, setTouchStartX] = useState(null);
  const [dragX, setDragX] = useState(0);
  const [celebration, setCelebration] = useState(null);
  const chatEndRef = useRef(null);
  const chatFileRef = useRef(null);
  const [vpH, setVpH] = useState(window.innerHeight);
  const mutualMatches = matches.filter(m => m.client_a_confirmed && m.client_b_confirmed);

  useEffect(() => { if (!chatMatch) return; const vv = window.visualViewport; if (!vv) return; const fn = () => { setVpH(vv.height); setTimeout(() => chatEndRef.current?.scrollIntoView({behavior:"smooth"}), 50); }; vv.addEventListener("resize", fn); return () => vv.removeEventListener("resize", fn); }, [chatMatch]);

  const onTouchStart = (e) => setTouchStartX(e.touches[0].clientX);
  const onTouchMove = (e) => { if (touchStartX === null) return; setDragX(e.touches[0].clientX - touchStartX); };
  const onTouchEnd = () => { if (Math.abs(dragX) > 80) { dragX > 0 ? handleLike() : handlePass(); } else setDragX(0); setTouchStartX(null); };

  const sendChatMsg = async (text, type = "text") => { if (!chatMatch || (!text?.trim() && type === "text")) return; const msg = { from: myClient?.id, fromName: myClient?.name, text: text?.trim() || "", type, ts: new Date().toISOString() }; const msgs = [...(chatMatch.messages || []), msg]; try { await supabase.from("match4biz").update({ messages: msgs }).eq("id", chatMatch.id); } catch (e) {} setMatches(p => p.map(m => m.id === chatMatch.id ? { ...m, messages: msgs } : m)); setChatMatch(p => ({ ...p, messages: msgs })); setChatInput(""); setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100); };
  const handleChatFile = async (e) => { const f = e.target.files?.[0]; if (!f || !supabase) return; const path = `m4b/${Date.now()}_${f.name}`; const { error } = await supabase.storage.from("demand-files").upload(path, f, { upsert: true }); if (error) { showToast("Erro no upload"); return; } const { data: u } = supabase.storage.from("demand-files").getPublicUrl(path); const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name); sendChatMsg(u.publicUrl, isImg ? "image" : "file"); e.target.value = ""; };
  const dealAction = async (a) => { if (!chatMatch) return; const sm = { close: "deal_closed", noclose: "deal_rejected", help: "agency_help" }; const mm = { close: "\u{1F91D} Negócio fechado!", noclose: "\u274C Negócio não fechado", help: "\u{1F3E2} Pediu ajuda da agência" }; await sendChatMsg(mm[a], "system"); try { await supabase.from("match4biz").update({ status: sm[a] }).eq("id", chatMatch.id); } catch (e) {} setMatches(p => p.map(m => m.id === chatMatch.id ? { ...m, status: sm[a] } : m)); setChatMatch(p => ({ ...p, status: sm[a] })); showToast(a === "close" ? "Parabéns! \u{1F389}" : a === "help" ? "Agência notificada" : "Atualizado"); };
  const getPartner = (m) => { const pid = m.client_a_id === myClient?.id ? m.client_b_id : m.client_a_id; const pn = m.client_a_id === myClient?.id ? m.client_b_name : m.client_a_name; return { id: pid, name: pn, ...(allClients.find(c => c.id === pid) || {}) }; };

  /* ═══ M4B STYLES ═══ */
  const m4bCSS = `
    @keyframes m4b-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
    @keyframes m4b-pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
    @keyframes m4b-shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    @keyframes m4b-glow { 0%,100%{box-shadow:0 0 20px ${B.accent}30} 50%{box-shadow:0 0 40px ${B.accent}60} }
    @keyframes m4b-confetti { 0%{transform:translateY(0) rotate(0deg);opacity:1} 100%{transform:translateY(400px) rotate(720deg);opacity:0} }
    .m4b-card { border-radius:28px; overflow:hidden; position:relative; transition:all .4s cubic-bezier(0.34,1.56,0.64,1); }
    .m4b-card:active { transform:scale(0.98) !important; }
    .m4b-action-btn { transition:all .15s ease; }
    .m4b-action-btn:active { transform:scale(0.85) !important; }
    .m4b-score-ring { animation:m4b-glow 3s ease-in-out infinite; }
    .m4b-tab { position:relative; overflow:hidden; }
    .m4b-tab::after { content:''; position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:0; height:3px; background:${B.accent}; border-radius:3px; transition:width .3s ease; }
    .m4b-tab[data-active="true"]::after { width:60%; }
    .m4b-overlay-enter { animation:m4b-overlay-in .4s ease forwards; }
    @keyframes m4b-overlay-in { from{opacity:0;backdrop-filter:blur(0)} to{opacity:1;backdrop-filter:blur(12px)} }
    .m4b-pkg-card { transition:all .2s ease; border:2px solid transparent; }
    .m4b-pkg-card:active { transform:scale(0.97); }
    .m4b-pkg-card[data-sel="true"] { border-color:${B.accent}; background:${B.accent}0A; }
  `;

  /* ═══ CELEBRATION ═══ */
  if (celebration) { const p = celebration; const cc = getColor(p.name); return (
    <div style={{ position:"fixed", inset:0, zIndex:999, background:"#000", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:"#fff" }}>
      <style dangerouslySetInnerHTML={{__html: m4bCSS + `
        .m4b-confetti-piece { position:absolute; width:8px; height:8px; border-radius:2px; animation:m4b-confetti 2.5s ease-out forwards; }
      `}} />
      {Array.from({length:30}).map((_,i) => <div key={i} className="m4b-confetti-piece" style={{ left:Math.random()*100+"%", top:-10, background:["#C8FF00","#10B981","#3B82F6","#EC4899","#F59E0B","#8B5CF6"][i%6], animationDelay:Math.random()*1.5+"s", animationDuration:(2+Math.random()*2)+"s", width:4+Math.random()*8, height:4+Math.random()*8 }} />)}
      <div style={{ display:"flex", alignItems:"center", marginBottom:32 }}>
        <div style={{ width:88, height:88, borderRadius:26, overflow:"hidden", border:"3px solid "+B.accent, zIndex:2, background:"#1A1D23" }}>{myClient?.logo_url ? <img src={myClient.logo_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <div style={{ width:"100%", height:"100%", background:B.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, fontWeight:900, color:"#0D0D0D" }}>{getInitials(myClient?.name)}</div>}</div>
        <div style={{ width:88, height:88, borderRadius:26, overflow:"hidden", border:"3px solid "+cc, marginLeft:-18, background:"#1A1D23" }}>{p.logo_url ? <img src={p.logo_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <div style={{ width:"100%", height:"100%", background:cc, display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, fontWeight:900, color:"#fff" }}>{getInitials(p.name)}</div>}</div>
      </div>
      <p style={{ fontSize:12, fontWeight:700, color:"#888", textTransform:"uppercase", letterSpacing:6, marginBottom:4 }}>É um</p>
      <h1 style={{ fontSize:52, fontWeight:900, margin:"0 0 8px", background:"linear-gradient(135deg, "+B.accent+", #10B981)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>Match!</h1>
      <p style={{ fontSize:14, color:"#999", marginTop:8, textAlign:"center", padding:"0 30px" }}>Você e <strong style={{ color:"#fff" }}>{p.name}</strong> demonstraram interesse mútuo</p>
      <button onClick={() => { setCelebration(null); setTab("matches"); }} style={{ marginTop:32, padding:"16px 48px", borderRadius:50, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:15, fontWeight:700, color:"#0D0D0D" }}>Conversar agora</button>
      <button onClick={() => setCelebration(null)} style={{ marginTop:14, background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"#666", textDecoration:"underline" }}>Continuar descobrindo</button>
    </div>
  ); }

  /* ═══ CHAT ═══ */
  if (chatMatch) { const p = getPartner(chatMatch); const cc = getColor(p.name); const msgs = chatMatch.messages || []; const closed = chatMatch.status === "deal_closed" || chatMatch.status === "deal_rejected"; return (
    <div style={{ position:"fixed", top:0, left:0, right:0, height:vpH, display:"flex", flexDirection:"column", background:B.bg, color:B.text, zIndex:50 }}>
      {ToastEl}<input ref={chatFileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" style={{ display:"none" }} onChange={handleChatFile} />
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", borderBottom:"1px solid "+B.border, flexShrink:0, background:B.bgCard }}>
        <button onClick={() => setChatMatch(null)} className="ib" style={{ width:36, height:36 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        {p.logo_url ? <img src={p.logo_url} style={{ width:36, height:36, borderRadius:12, objectFit:"cover" }} /> : <div style={{ width:36, height:36, borderRadius:12, background:cc+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:cc }}>{getInitials(p.name)}</div>}
        <div style={{ flex:1, minWidth:0 }}><p style={{ fontSize:14, fontWeight:700 }}>{p.name}</p><p style={{ fontSize:10, color:chatMatch.status==="deal_closed"?B.green:chatMatch.status==="agency_help"?"#6366F1":B.muted }}>{chatMatch.status==="deal_closed"?"Negócio fechado ✅":chatMatch.status==="agency_help"?"Agência participando":chatMatch.status==="deal_rejected"?"Não fechou":"Conectado"}</p></div>
      </div>
      {!closed && <div style={{ display:"flex", gap:6, padding:"8px 12px", borderBottom:"1px solid "+B.border, overflowX:"auto", scrollbarWidth:"none", flexShrink:0 }}>
        <button onClick={() => dealAction("close")} style={{ padding:"6px 12px", borderRadius:20, border:"1.5px solid "+B.green+"40", background:B.green+"06", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:600, color:B.green, whiteSpace:"nowrap", flexShrink:0 }}>🤝 Fechar Negócio</button>
        <button onClick={() => dealAction("noclose")} style={{ padding:"6px 12px", borderRadius:20, border:"1.5px solid #EF444440", background:"#EF444406", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:600, color:"#EF4444", whiteSpace:"nowrap", flexShrink:0 }}>❌ Não Fechar</button>
        <button onClick={() => dealAction("help")} style={{ padding:"6px 12px", borderRadius:20, border:"1.5px solid #6366F140", background:"#6366F106", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:600, color:"#6366F1", whiteSpace:"nowrap", flexShrink:0 }}>🏢 Pedir Ajuda</button>
      </div>}
      <div style={{ flex:1, minHeight:0, overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"12px 16px" }}>
        {msgs.length === 0 && <div style={{ textAlign:"center", padding:"40px 20px" }}><p style={{ fontSize:15, fontWeight:700 }}>Match! 🎉</p><p style={{ fontSize:12, color:B.muted, marginTop:6, lineHeight:1.5 }}>Comecem a conversar sobre a parceria.</p></div>}
        {msgs.map((m, i) => { const me = m.from === myClient?.id; const ag = m.from === "agency"; const sys = m.type === "system";
          if (sys) return <div key={i} style={{ textAlign:"center", margin:"12px 0" }}><span style={{ fontSize:10, color:B.muted, background:B.bg, padding:"4px 14px", borderRadius:20, border:"1px solid "+B.border }}>{m.text}</span></div>;
          return (<div key={i} style={{ marginBottom:8 }}>{ag && <p style={{ fontSize:9, fontWeight:700, color:"#6366F1", marginBottom:2 }}>🏢 {m.by || "Unique Marketing"}</p>}<div style={{ display:"flex", justifyContent:me?"flex-end":"flex-start" }}><div style={{ maxWidth:"78%", padding:m.type==="image"?"4px":"10px 14px", borderRadius:18, background:ag?"#6366F108":me?B.accent+"15":B.bgCard, border:"1px solid "+(ag?"#6366F120":me?B.accent+"25":B.border), borderBottomRightRadius:me?4:18, borderBottomLeftRadius:me?18:4 }}>
            {m.type === "image" && <img src={m.text} style={{ maxWidth:"100%", maxHeight:200, borderRadius:14, display:"block" }} />}
            {(m.type === "text" || !m.type) && <p style={{ fontSize:13, lineHeight:1.5, margin:0, wordBreak:"break-word" }}>{m.text}</p>}
            {m.type === "file" && <a href={m.text} target="_blank" rel="noopener noreferrer" style={{ display:"flex", alignItems:"center", gap:6, color:B.accent, fontSize:12, fontWeight:600 }}>📎 Arquivo</a>}
            <p style={{ fontSize:8, color:B.muted, marginTop:3, textAlign:"right" }}>{new Date(m.ts).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
          </div></div></div>); })}
        <div ref={chatEndRef} />
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px 12px", borderTop:"1px solid "+B.border, background:B.bgCard, flexShrink:0 }}>
        <button onClick={() => chatFileRef.current?.click()} className="ib" style={{ width:36, height:36 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg></button>
        <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMsg(chatInput); } }} placeholder="Mensagem..." className="tinput" style={{ flex:1, padding:"10px 14px", fontSize:14 }} />
        <button onClick={() => sendChatMsg(chatInput)} disabled={!chatInput.trim()} style={{ width:36, height:36, borderRadius:12, background:chatInput.trim()?B.accent:B.border, border:"none", cursor:chatInput.trim()?"pointer":"default", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={chatInput.trim()?"#0D0D0D":B.muted} strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg></button>
      </div>
    </div>
  ); }

  /* ═══ TERMS SCREEN ═══ */
  if (!accepted) return (
    <div className="app" style={{ background:"#000", color:"#fff" }}>
      <style dangerouslySetInnerHTML={{__html: m4bCSS}} />
      <Head title="Match4Biz" onBack={onBack} />
      <div className="content" style={{ padding:"0 16px" }}>
        <div style={{ textAlign:"center", padding:"24px 0 20px" }}>
          <div style={{ width:72, height:72, borderRadius:22, background:B.accent, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", animation:"m4b-float 3s ease-in-out infinite" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2.2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <h2 style={{ fontSize:24, fontWeight:900, marginBottom:6, letterSpacing:"-0.5px" }}>Match4Biz</h2>
          <p style={{ fontSize:13, color:"#888", lineHeight:1.5, maxWidth:280, margin:"0 auto" }}>Conecte-se com outros negócios e crie parcerias que geram resultados reais</p>
        </div>

        <div style={{ background:"#111", borderRadius:20, padding:"20px", marginBottom:12, border:"1px solid #222" }}>
          <p style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Como funciona</p>
          {[
            { ic:"🔍", t:"Descubra", d:"Veja perfis reais de empresas parceiras" },
            { ic:"💚", t:"Dê Match", d:"Use créditos para demonstrar interesse" },
            { ic:"🤝", t:"Conecte-se", d:"Match mútuo = chat liberado" },
            { ic:"💰", t:"Negocie", d:"Toda parceria acontece dentro da plataforma" },
          ].map((s,i) => (
            <div key={i} style={{ display:"flex", gap:14, padding:"12px 0", borderBottom:i<3?"1px solid #222":"none" }}>
              <span style={{ fontSize:20, flexShrink:0, width:32, height:32, borderRadius:10, background:"#1a1a1a", display:"flex", alignItems:"center", justifyContent:"center" }}>{s.ic}</span>
              <div><p style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{s.t}</p><p style={{ fontSize:11, color:"#777", lineHeight:1.4 }}>{s.d}</p></div>
            </div>
          ))}
        </div>

        <div style={{ background:"#111", borderRadius:20, padding:"20px", marginBottom:12, border:"1px solid "+B.accent+"25" }}>
          <p style={{ fontSize:13, fontWeight:700, color:B.accent, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={B.accent} stroke="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            Créditos por Plano
          </p>
          {[
            { plan:"Starter", credits:"10", matches:"1 match" },
            { plan:"Growth", credits:"20", matches:"2 matches" },
            { plan:"Scale", credits:"30", matches:"3 matches" },
            { plan:"Enterprise", credits:"∞", matches:"Ilimitado" },
          ].map((p,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:i<3?"1px solid #222":"none" }}>
              <span style={{ fontSize:12, fontWeight:600, color:"#ccc" }}>{p.plan}</span>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:13, fontWeight:800, color:B.accent }}>{p.credits}</span>
                <span style={{ fontSize:10, color:"#666", background:"#1a1a1a", padding:"2px 8px", borderRadius:6 }}>{p.matches}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:"#111", borderRadius:20, padding:"20px", marginBottom:16, border:"1px solid #F59E0B25" }}>
          <p style={{ fontSize:13, fontWeight:700, color:"#F59E0B", marginBottom:8 }}>⚠️ Termos de Uso</p>
          <ul style={{ fontSize:11, color:"#888", lineHeight:1.8, paddingLeft:16, margin:0 }}>
            <li>Toda negociação deve acontecer <strong style={{color:"#fff"}}>dentro da plataforma</strong></li>
            <li>Taxa de <strong style={{color:"#fff"}}>5% a 10%</strong> sobre parcerias fechadas</li>
            <li>A Unique Marketing atua como facilitadora</li>
            <li>Informações são confidenciais</li>
          </ul>
        </div>

        <button onClick={doAccept} style={{ width:"100%", padding:"16px 0", borderRadius:16, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:15, fontWeight:700, color:"#0D0D0D", marginBottom:30 }}>Aceitar e Começar</button>
      </div>
    </div>
  );

  /* ═══ PROFILE DETAIL ═══ */
  if (showProfile) {
    const p = showProfile;
    const col = getColor(p.name);
    const sc = getScore(p.id);
    const rk = getRank(p.id);
    const circumference = 2 * Math.PI * 42;
    const offset = circumference - (sc / 100) * circumference;
    return (
      <div className="app" style={{ background:"#000", color:"#fff" }}>
        <style dangerouslySetInnerHTML={{__html: m4bCSS}} />
        <Head title="" onBack={() => setShowProfile(null)} />
        <div className="content" style={{ padding:"0 16px" }}>
          {/* Hero area */}
          <div style={{ textAlign:"center", padding:"8px 0 20px", position:"relative" }}>
            {/* Score ring around avatar */}
            <div style={{ position:"relative", width:110, height:110, margin:"0 auto 14px" }}>
              <svg width="110" height="110" viewBox="0 0 110 110" style={{ position:"absolute", top:0, left:0, transform:"rotate(-90deg)" }}>
                <circle cx="55" cy="55" r="42" fill="none" stroke="#222" strokeWidth="4" />
                <circle cx="55" cy="55" r="42" fill="none" stroke={B.accent} strokeWidth="4" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition:"stroke-dashoffset 1s ease" }} />
              </svg>
              <div style={{ position:"absolute", top:9, left:9, width:92, height:92, borderRadius:28, overflow:"hidden", background:"#111" }}>
                {p.logo_url ? <img src={p.logo_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <div style={{ width:"100%", height:"100%", background:"linear-gradient(135deg, "+col+", "+col+"80)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:34, fontWeight:900, color:"#fff" }}>{getInitials(p.name)}</div>}
              </div>
              {/* Score badge */}
              <div style={{ position:"absolute", bottom:-4, right:-4, background:B.accent, color:"#0D0D0D", fontSize:12, fontWeight:900, padding:"4px 10px", borderRadius:12, boxShadow:"0 2px 8px rgba(0,0,0,.4)" }}>{sc}</div>
            </div>
            <h2 style={{ fontSize:22, fontWeight:900, marginBottom:4, letterSpacing:"-0.5px" }}>{p.name}</h2>
            <p style={{ fontSize:12, color:col, fontWeight:600 }}>{p.plan ? "Plano " + (p.plan.charAt(0).toUpperCase() + p.plan.slice(1)) : "Cliente Unique"} · {getSince(p.start_date)}</p>

            {/* Rank + Stats row */}
            <div style={{ display:"flex", justifyContent:"center", gap:20, marginTop:16 }}>
              <div style={{ textAlign:"center" }}>
                <p style={{ fontSize:22, fontWeight:900, color:B.accent }}>{rk}º</p>
                <p style={{ fontSize:10, color:"#666", fontWeight:600 }}>Ranking</p>
              </div>
              <div style={{ width:1, height:36, background:"#222" }} />
              <div style={{ textAlign:"center" }}>
                <p style={{ fontSize:22, fontWeight:900, color:"#fff" }}>{sc}</p>
                <p style={{ fontSize:10, color:"#666", fontWeight:600 }}>Growth Score</p>
              </div>
              <div style={{ width:1, height:36, background:"#222" }} />
              <div style={{ textAlign:"center" }}>
                <p style={{ fontSize:22, fontWeight:900, color:"#fff" }}>{getSince(p.start_date).replace("Desde ","")}</p>
                <p style={{ fontSize:10, color:"#666", fontWeight:600 }}>Membro desde</p>
              </div>
            </div>
          </div>

          {/* About */}
          {p.notes && <div style={{ background:"#111", borderRadius:18, padding:"16px 18px", marginBottom:12, border:"1px solid #222" }}>
            <p style={{ fontSize:11, fontWeight:700, color:"#666", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Sobre a empresa</p>
            <p style={{ fontSize:13, lineHeight:1.7, color:"#ccc" }}>{p.notes}</p>
          </div>}

          {/* Contact */}
          {p.contact_name && <div style={{ background:"#111", borderRadius:18, padding:"16px 18px", marginBottom:16, border:"1px solid #222" }}>
            <p style={{ fontSize:11, fontWeight:700, color:"#666", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Responsável</p>
            <p style={{ fontSize:14, fontWeight:600, color:"#fff" }}>{p.contact_name}</p>
          </div>}

          {/* Actions */}
          <div style={{ display:"flex", gap:10, marginBottom:30 }}>
            <button onClick={() => { setShowProfile(null); handlePass(); }} style={{ flex:1, padding:"15px 0", borderRadius:16, border:"2px solid #333", background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#999" }}>Pular</button>
            <button onClick={() => { setShowProfile(null); handleLike(); }} style={{ flex:1.2, padding:"15px 0", borderRadius:16, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#0D0D0D" }}>💚 Dar Match</button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══ BUY CREDITS MODAL ═══ */
  const PACKAGES = [
    { id:1, n:10, price:"R$ 100", raw:100, desc:"1 match", popular:false },
    { id:2, n:30, price:"R$ 250", raw:250, desc:"3 matches", save:"17%", popular:true },
    { id:3, n:50, price:"R$ 400", raw:400, desc:"5 matches", save:"20%", popular:false },
  ];

  const BuyOverlay = showBuy ? (
    <div className="m4b-overlay-enter" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", backdropFilter:"blur(12px)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={() => { setShowBuy(false); setBuyStep("packages"); setSelectedPkg(null); }}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:430, background:"#111", borderRadius:"28px 28px 0 0", padding:"20px 20px calc(24px + env(safe-area-inset-bottom,0px))", maxHeight:"85vh", overflowY:"auto" }}>
        <div style={{ width:40, height:4, borderRadius:2, background:"#333", margin:"0 auto 18px" }} />

        {buyStep === "packages" ? (<>
          <h3 style={{ fontSize:20, fontWeight:900, marginBottom:4, color:"#fff" }}>Comprar Créditos</h3>
          <p style={{ fontSize:12, color:"#666", marginBottom:20 }}>Cada 10 créditos = 1 match com outra empresa</p>

          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
            {PACKAGES.map(pkg => (
              <button key={pkg.id} className="m4b-pkg-card" data-sel={selectedPkg?.id === pkg.id ? "true" : "false"} onClick={() => setSelectedPkg(pkg)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"16px 18px", borderRadius:18, background:selectedPkg?.id===pkg.id ? B.accent+"0A" : "#1a1a1a", border:selectedPkg?.id===pkg.id ? "2px solid "+B.accent : "2px solid #222", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <p style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{pkg.n} créditos</p>
                    {pkg.popular && <span style={{ fontSize:9, fontWeight:700, background:B.accent, color:"#0D0D0D", padding:"2px 8px", borderRadius:8, textTransform:"uppercase" }}>Popular</span>}
                  </div>
                  <p style={{ fontSize:11, color:"#666", marginTop:2 }}>{pkg.desc}{pkg.save ? " · Economize "+pkg.save : ""}</p>
                </div>
                <p style={{ fontSize:18, fontWeight:900, color:B.accent }}>{pkg.price}</p>
              </button>
            ))}
          </div>

          <button disabled={!selectedPkg} onClick={() => setBuyStep("payment")} style={{ width:"100%", padding:"16px 0", borderRadius:16, background:selectedPkg ? B.accent : "#222", border:"none", cursor:selectedPkg?"pointer":"default", fontFamily:"inherit", fontSize:15, fontWeight:700, color:selectedPkg?"#0D0D0D":"#555" }}>Continuar</button>
          <button onClick={() => { setShowBuy(false); setBuyStep("packages"); }} style={{ width:"100%", padding:"12px 0", marginTop:8, background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"#666" }}>Aguardar próximo ciclo</button>
        </>) : (<>

          {/* Payment step */}
          <button onClick={() => setBuyStep("packages")} style={{ display:"flex", alignItems:"center", gap:6, background:"transparent", border:"none", cursor:"pointer", fontFamily:"inherit", color:"#888", fontSize:13, marginBottom:16, padding:0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg> Voltar
          </button>
          <h3 style={{ fontSize:20, fontWeight:900, marginBottom:4, color:"#fff" }}>Método de Pagamento</h3>
          <p style={{ fontSize:12, color:"#666", marginBottom:6 }}>{selectedPkg?.n} créditos · <strong style={{ color:B.accent }}>{selectedPkg?.price}</strong></p>
          <div style={{ background:"#1a1a1a", borderRadius:14, padding:"12px 16px", marginBottom:20, border:"1px solid #222" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:12, color:"#888" }}>{selectedPkg?.desc}</span>
              <span style={{ fontSize:14, fontWeight:800, color:"#fff" }}>{selectedPkg?.price}</span>
            </div>
          </div>

          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {/* PIX */}
            <button onClick={() => { showToast("Gerando QR Code PIX..."); setShowBuy(false); setBuyStep("packages"); setSelectedPkg(null); }} style={{ display:"flex", alignItems:"center", gap:14, width:"100%", padding:"16px 18px", borderRadius:18, background:"#1a1a1a", border:"2px solid #222", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
              <div style={{ width:44, height:44, borderRadius:14, background:"#00B88620", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#00B886" strokeWidth="2"><path d="M13.17 6l-3.63 3.63a1 1 0 000 1.41l3.63 3.63"/><path d="M10.83 18l3.63-3.63a1 1 0 000-1.41L10.83 9.33"/><rect x="2" y="2" width="20" height="20" rx="2"/></svg>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14, fontWeight:700, color:"#fff" }}>PIX</p>
                <p style={{ fontSize:11, color:"#666" }}>Aprovação instantânea</p>
              </div>
              <div style={{ background:"#00B88615", padding:"3px 10px", borderRadius:8 }}>
                <span style={{ fontSize:10, fontWeight:700, color:"#00B886" }}>Recomendado</span>
              </div>
            </button>

            {/* Boleto */}
            <button onClick={() => { showToast("Gerando boleto bancário..."); setShowBuy(false); setBuyStep("packages"); setSelectedPkg(null); }} style={{ display:"flex", alignItems:"center", gap:14, width:"100%", padding:"16px 18px", borderRadius:18, background:"#1a1a1a", border:"2px solid #222", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
              <div style={{ width:44, height:44, borderRadius:14, background:"#3B82F620", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="15" x2="7" y2="15.01"/><line x1="11" y1="15" x2="17" y2="15"/></svg>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14, fontWeight:700, color:"#fff" }}>Boleto Bancário</p>
                <p style={{ fontSize:11, color:"#666" }}>Compensação em 1-3 dias úteis</p>
              </div>
            </button>

            {/* Cartão */}
            <button onClick={() => { showToast("Redirecionando para pagamento..."); setShowBuy(false); setBuyStep("packages"); setSelectedPkg(null); }} style={{ display:"flex", alignItems:"center", gap:14, width:"100%", padding:"16px 18px", borderRadius:18, background:"#1a1a1a", border:"2px solid #222", cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
              <div style={{ width:44, height:44, borderRadius:14, background:"#8B5CF620", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14, fontWeight:700, color:"#fff" }}>Cartão de Crédito</p>
                <p style={{ fontSize:11, color:"#666" }}>Visa, Mastercard, Elo</p>
              </div>
            </button>
          </div>

          <p style={{ fontSize:10, color:"#555", textAlign:"center", marginTop:16, lineHeight:1.5 }}>Pagamento processado com segurança pela Asaas.<br/>Seus dados estão protegidos.</p>
        </>)}
      </div>
    </div>
  ) : null;

  /* ═══ MAIN VIEW ═══ */
  return (
    <div className="app" style={{ background:"#000", color:"#fff" }}>
      <style dangerouslySetInnerHTML={{__html: m4bCSS}} />
      {ToastEl}
      {BuyOverlay}
      <Head title="Match4Biz" onBack={onBack} right={
        <button onClick={() => { setShowBuy(true); setBuyStep("packages"); }} style={{ display:"flex", alignItems:"center", gap:5, padding:"6px 14px", borderRadius:12, background:noCredits?"#EF444420":"#1a1a1a", border:"1.5px solid "+(noCredits?"#EF444440":"#333"), cursor:"pointer", fontFamily:"inherit" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={noCredits?"#EF4444":B.accent} strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span style={{ fontSize:12, fontWeight:800, color:noCredits?"#EF4444":B.accent }}>{isUnlimited ? "∞" : credits}</span>
        </button>
      } />
      <div className="content" style={{ padding:"0 16px" }}>
        {/* Tabs */}
        <div style={{ display:"flex", gap:0, marginBottom:16, background:"#111", borderRadius:14, padding:3 }}>
          {[{k:"discover",l:"Descobrir"},{k:"matches",l:"Conexões ("+mutualMatches.length+")"}].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{ flex:1, padding:"11px 0", borderRadius:11, border:"none", background:tab===t.k?"#222":"transparent", color:tab===t.k?"#fff":"#666", fontSize:12, fontWeight:tab===t.k?700:500, cursor:"pointer", fontFamily:"inherit", transition:"all .2s ease" }}>{t.l}</button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:60 }}>
            <div style={{ width:40, height:40, border:"3px solid #222", borderTopColor:B.accent, borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 14px" }} />
            <p style={{ fontSize:13, color:"#666" }}>Buscando empresas...</p>
          </div>
        ) : tab === "discover" ? (<>
          {available.length > 0 && current ? (
            <div style={{ position:"relative" }}>
              {/* ═══ THE CARD ═══ */}
              <div className="m4b-card" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{
                background:"#111", border:"1px solid #222",
                transform: swipeAnim==="like" ? "translateX(120px) rotate(10deg) scale(0.92)" : swipeAnim==="pass" ? "translateX(-120px) rotate(-10deg) scale(0.92)" : dragX ? `translateX(${dragX}px) rotate(${dragX*0.05}deg)` : "none",
                opacity: swipeAnim ? 0.3 : 1,
                transition: swipeAnim || !dragX ? "all .4s cubic-bezier(0.34,1.56,0.64,1)" : "none",
              }}>
                {/* Top section with gradient bg */}
                <div style={{ height:140, background:"linear-gradient(135deg, "+getColor(current.name)+"15, "+getColor(current.name)+"05, #111)", position:"relative" }}>
                  {/* Swipe indicator overlays */}
                  {dragX > 40 && <div style={{ position:"absolute", top:16, left:16, background:B.accent+"20", border:"2px solid "+B.accent, borderRadius:12, padding:"6px 16px", zIndex:5, transform:"rotate(-15deg)" }}><span style={{ fontSize:14, fontWeight:900, color:B.accent }}>MATCH 💚</span></div>}
                  {dragX < -40 && <div style={{ position:"absolute", top:16, right:16, background:"#EF444420", border:"2px solid #EF4444", borderRadius:12, padding:"6px 16px", zIndex:5, transform:"rotate(15deg)" }}><span style={{ fontSize:14, fontWeight:900, color:"#EF4444" }}>PULAR ✕</span></div>}

                  {/* Avatar centered at bottom of gradient */}
                  <div style={{ position:"absolute", bottom:-40, left:"50%", transform:"translateX(-50%)" }}>
                    <div style={{ position:"relative", width:88, height:88 }}>
                      {/* Mini score ring */}
                      <svg width="88" height="88" viewBox="0 0 88 88" style={{ position:"absolute", top:0, left:0, transform:"rotate(-90deg)" }}>
                        <circle cx="44" cy="44" r="36" fill="none" stroke="#222" strokeWidth="3" />
                        <circle cx="44" cy="44" r="36" fill="none" stroke={B.accent} strokeWidth="3" strokeDasharray={2*Math.PI*36} strokeDashoffset={2*Math.PI*36 - (getScore(current.id)/100)*2*Math.PI*36} strokeLinecap="round" />
                      </svg>
                      <div style={{ position:"absolute", top:6, left:6, width:76, height:76, borderRadius:24, overflow:"hidden", background:"#1a1a1a" }}>
                        {current.logo_url ? <img src={current.logo_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <div style={{ width:"100%", height:"100%", background:"linear-gradient(135deg, "+getColor(current.name)+", "+getColor(current.name)+"80)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:900, color:"#fff" }}>{getInitials(current.name)}</div>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info section */}
                <div style={{ textAlign:"center", padding:"48px 20px 10px" }}>
                  <h3 style={{ fontSize:20, fontWeight:900, marginBottom:2, color:"#fff" }}>{current.name}</h3>
                  {current.contact_name && <p style={{ fontSize:12, color:"#777" }}>{current.contact_name}</p>}
                  <p style={{ fontSize:11, color:getColor(current.name), fontWeight:600, marginTop:4 }}>{current.plan ? "Plano " + (current.plan.charAt(0).toUpperCase() + current.plan.slice(1)) : "Cliente Unique"} · {getSince(current.start_date)}</p>
                </div>

                {/* Stats row */}
                <div style={{ display:"flex", justifyContent:"center", gap:24, padding:"12px 20px", marginBottom:4 }}>
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:18, fontWeight:900, color:B.accent }}>{getScore(current.id)}</p>
                    <p style={{ fontSize:9, color:"#555", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 }}>Score</p>
                  </div>
                  <div style={{ width:1, height:28, background:"#222", alignSelf:"center" }} />
                  <div style={{ textAlign:"center" }}>
                    <p style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{getRank(current.id)}º</p>
                    <p style={{ fontSize:9, color:"#555", fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 }}>Rank</p>
                  </div>
                </div>

                {/* Description */}
                {current.notes && <div style={{ padding:"0 20px 12px" }}>
                  <p style={{ fontSize:12, color:"#888", lineHeight:1.6, textAlign:"center" }}>{current.notes.length > 180 ? current.notes.substring(0,180)+"..." : current.notes}</p>
                </div>}

                {/* Action buttons */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14, padding:"10px 20px 6px" }}>
                  <button onClick={handlePass} className="m4b-action-btn" style={{ width:52, height:52, borderRadius:"50%", background:"#1a1a1a", border:"2px solid #333", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  <button onClick={() => setShowProfile(current)} className="m4b-action-btn" style={{ width:44, height:44, borderRadius:"50%", background:"#1a1a1a", border:"2px solid #333", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </button>
                  <button onClick={handleLike} className="m4b-action-btn m4b-score-ring" style={{ width:62, height:62, borderRadius:"50%", background:B.accent, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="#0D0D0D" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                  </button>
                </div>
                <p style={{ textAlign:"center", fontSize:10, color:"#555", padding:"6px 0 14px" }}>{available.length} empresa{available.length > 1 ? "s" : ""} disponíve{available.length > 1 ? "is" : "l"} · {isUnlimited ? "∞ créditos" : credits + " créditos"}</p>
              </div>

              {/* ═══ NO CREDITS FULL OVERLAY ═══ */}
              {noCredits && (
                <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(8px)", borderRadius:28, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", zIndex:10, padding:24 }}>
                  <div style={{ width:56, height:56, borderRadius:18, background:"#1a1a1a", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16, border:"2px solid #333" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  </div>
                  <h4 style={{ fontSize:18, fontWeight:900, color:"#fff", marginBottom:4 }}>Créditos esgotados</h4>
                  <p style={{ fontSize:12, color:"#888", textAlign:"center", lineHeight:1.5, marginBottom:20, maxWidth:240 }}>Compre mais créditos ou aguarde o próximo ciclo de pagamento para renovar</p>
                  <button onClick={() => { setShowBuy(true); setBuyStep("packages"); }} style={{ padding:"14px 36px", borderRadius:14, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#0D0D0D", marginBottom:10 }}>Comprar créditos</button>
                  <button onClick={() => showToast("Créditos renovam no próximo ciclo")} style={{ padding:"10px 20px", background:"transparent", border:"1.5px solid #333", borderRadius:12, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:"#888" }}>Aguardar renovação</button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign:"center", padding:40 }}>
              <div style={{ width:64, height:64, borderRadius:20, background:"#111", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", border:"1px solid #222" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              </div>
              <p style={{ fontSize:17, fontWeight:800, marginBottom:6, color:"#fff" }}>{allClients.length === 0 ? "Nenhuma empresa" : "Você já viu todos!"}</p>
              <p style={{ fontSize:13, color:"#777", lineHeight:1.5 }}>{allClients.length === 0 ? "Novas empresas aparecerão em breve." : "Confira seus matches ou aguarde novas empresas."}</p>
            </div>
          )}
        </>) : (<>

          {/* ═══ CONNECTIONS TAB ═══ */}
          {matches.length === 0 ? (
            <div style={{ textAlign:"center", padding:40 }}>
              <p style={{ fontSize:15, fontWeight:700, marginBottom:4 }}>Nenhum match ainda</p>
              <p style={{ fontSize:12, color:"#777" }}>Explore perfis na aba Descobrir!</p>
            </div>
          ) : (<>
            {mutualMatches.length > 0 && <>
              <p style={{ fontSize:10, fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:1.5, marginBottom:10 }}>Chat disponível</p>
              {mutualMatches.map(m => { const p = getPartner(m); const cc = getColor(p.name); const last = (m.messages||[]).filter(x=>x.type!=="system").slice(-1)[0]; return (
                <div key={m.id} onClick={() => setChatMatch(m)} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", borderRadius:18, background:"#111", border:"1px solid #222", marginBottom:8, cursor:"pointer" }}>
                  {p.logo_url ? <img src={p.logo_url} style={{ width:48, height:48, borderRadius:16, objectFit:"cover" }} /> : <div style={{ width:48, height:48, borderRadius:16, background:"linear-gradient(135deg, "+cc+", "+cc+"70)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:900, color:"#fff", flexShrink:0 }}>{getInitials(p.name)}</div>}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:3 }}>
                      <p style={{ fontSize:14, fontWeight:700 }}>{p.name}</p>
                      <span style={{ fontSize:9, fontWeight:700, padding:"3px 8px", borderRadius:8, background:m.status==="deal_closed"?B.green+"15":m.status==="agency_help"?"#6366F115":B.accent+"15", color:m.status==="deal_closed"?B.green:m.status==="agency_help"?"#6366F1":B.accent }}>{m.status==="deal_closed"?"Fechado ✅":m.status==="agency_help"?"Agência":"Ativo"}</span>
                    </div>
                    <p style={{ fontSize:11, color:"#666", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{last?(last.from===myClient?.id?"Você: ":"")+last.text.substring(0,40):"Toque para conversar"}</p>
                  </div>
                </div>); })}
            </>}
            {matches.filter(m=>!m.client_a_confirmed||!m.client_b_confirmed).length > 0 && <>
              <p style={{ fontSize:10, fontWeight:700, color:"#555", textTransform:"uppercase", letterSpacing:1.5, marginBottom:10, marginTop:mutualMatches.length>0?18:0 }}>Aguardando match</p>
              {matches.filter(m=>!m.client_a_confirmed||!m.client_b_confirmed).map(m => { const p = getPartner(m); const cc = getColor(p.name); return (
                <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:18, background:"#111", border:"1px solid #1a1a1a", marginBottom:8, opacity:0.5 }}>
                  <div style={{ width:44, height:44, borderRadius:14, background:cc+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, color:cc }}>{getInitials(p.name)}</div>
                  <div><p style={{ fontSize:13, fontWeight:600 }}>{p.name}</p><p style={{ fontSize:10, color:"#555" }}>Aguardando resposta...</p></div>
                </div>); })}
            </>}
          </>)}
        </>)}
        <div style={{ height:30 }} />
      </div>
    </div>
  );
}

