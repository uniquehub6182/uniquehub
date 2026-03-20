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
  const { showToast, ToastEl } = useToast();

  /* ── Plan-based credits ── */
  const getCreditsForPlan = (monthly) => {
    const v = parseFloat(monthly) || 0;
    if (v >= 4480) return 9999; /* unlimited */
    if (v >= 3480) return 30;
    if (v >= 2480) return 20;
    if (v >= 1480) return 10;
    return 0;
  };

  /* ── Load clients + matches from Supabase ── */
  useEffect(() => {
    if (!supabase || !user?.email) { setLoading(false); return; }
    (async () => {
      try {
        const { data: cl } = await supabase.from("clients").select("*").eq("contact_email", user.email).maybeSingle();
        if (!cl) { setLoading(false); return; }
        setMyClient(cl);
        /* Credits from plan */
        const planCredits = getCreditsForPlan(cl.monthly);
        /* Check purchased credits */
        try { const extra = parseInt(localStorage.getItem("uh_m4b_credits_" + cl.id) || "0"); setCredits(planCredits + extra); } catch { setCredits(planCredits); }
        /* Load all other active clients */
        const { data: clients } = await supabase.from("clients").select("id, name, plan, monthly, status, logo_url, contact_name, contact_email, notes, start_date").neq("id", cl.id).eq("status", "ativo");
        if (clients) setAllClients(clients);
        /* Load existing matches */
        const { data: m4b } = await supabase.from("match4biz").select("*").or("client_a_id.eq." + cl.id + ",client_b_id.eq." + cl.id);
        if (m4b) setMatches(m4b);
      } catch(e) { console.warn("[M4B]", e); }
      setLoading(false);
    })();
  }, [user?.email]);

  const matchedIds = matches.map(m => m.client_a_id === myClient?.id ? m.client_b_id : m.client_a_id);
  const available = allClients.filter(c => !matchedIds.includes(c.id));
  const current = available[currentIdx % Math.max(available.length, 1)];
  const isUnlimited = credits >= 9999;

  const doAccept = () => { setAccepted(true); try { localStorage.setItem("uh_m4b_accepted", "1"); } catch {} };

  const handleLike = async () => {
    if (!current || !myClient) return;
    if (!isUnlimited && credits < 10) { setShowBuy(true); return; }
    setSwipeAnim("like");
    setTimeout(async () => {
      /* Save match to Supabase */
      try {
        const newMatch = { client_a_id: myClient.id, client_a_name: myClient.name, client_b_id: current.id, client_b_name: current.name, status: "pending", messages: [], created_by: user?.name || "Cliente" };
        const saved = await supaCreateMatch(newMatch);
        if (saved) setMatches(prev => [...prev, saved]);
      } catch(e) { console.warn("[M4B] Match save:", e); }
      if (!isUnlimited) {
        const newCredits = credits - 10;
        setCredits(newCredits);
        try { localStorage.setItem("uh_m4b_credits_" + myClient.id, String(Math.max(0, newCredits - getCreditsForPlan(myClient.monthly)))); } catch {}
      }
      setCurrentIdx(i => i + 1);
      setSwipeAnim(null);
      showToast("Match enviado! Aguarde a confirmação.");
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

  /* ═══ TERMS SCREEN ═══ */
  if (!accepted) return (
    <div className="app" style={{ background:B.bg, color:B.text }}>
      <Head title="Match4Biz" onBack={onBack} />
      <div className="content" style={{ padding:"0 16px" }}>
        <div style={{ textAlign:"center", padding:"20px 0 16px" }}>
          <div style={{ width:80, height:80, borderRadius:24, background:"linear-gradient(135deg, #BBF246 0%, #8BC34A 100%)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", boxShadow:"0 8px 32px rgba(187,242,70,0.3)" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <h2 style={{ fontSize:22, fontWeight:900, marginBottom:4 }}>Match4Biz</h2>
          <p style={{ fontSize:13, color:B.muted, lineHeight:1.5 }}>Conecte-se com outros negócios e crie parcerias estratégicas</p>
        </div>
        <Card style={{ marginBottom:12 }}>
          <p style={{ fontSize:14, fontWeight:700, marginBottom:10 }}>Como funciona</p>
          {[
            { ic:"\uD83D\uDD0D", t:"Descubra", d:"Veja perfis de outras empresas parceiras da agência" },
            { ic:"\u2764\uFE0F", t:"Dê Match", d:"Use seus créditos para demonstrar interesse em uma parceria" },
            { ic:"\uD83E\uDD1D", t:"Conecte-se", d:"Quando ambos demonstram interesse, a conexão é feita" },
            { ic:"\uD83D\uDCB0", t:"Negocie", d:"Toda negociação deve acontecer dentro da plataforma" },
          ].map((s,i) => (
            <div key={i} style={{ display:"flex", gap:12, padding:"10px 0", borderBottom:i<3?"1px solid "+B.border:"none" }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{s.ic}</span>
              <div><p style={{ fontSize:13, fontWeight:700 }}>{s.t}</p><p style={{ fontSize:11, color:B.muted, lineHeight:1.4 }}>{s.d}</p></div>
            </div>
          ))}
        </Card>
        <Card style={{ marginBottom:12, background:B.accent+"08", border:"1.5px solid "+B.accent+"20" }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.accent, marginBottom:6 }}>Créditos por Plano</p>
          {[
            { plan:"R$ 1.480/mês", credits:"10 créditos", matches:"1 match" },
            { plan:"R$ 2.480/mês", credits:"20 créditos", matches:"2 matches" },
            { plan:"R$ 3.480/mês", credits:"30 créditos", matches:"3 matches" },
            { plan:"R$ 4.480/mês", credits:"Ilimitado", matches:"\u221E matches" },
          ].map((p,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<3?"1px solid "+B.border:"none" }}>
              <span style={{ fontSize:12, fontWeight:600 }}>{p.plan}</span>
              <div style={{ textAlign:"right" }}><span style={{ fontSize:12, fontWeight:700, color:B.accent }}>{p.credits}</span><span style={{ fontSize:10, color:B.muted, marginLeft:6 }}>{p.matches}</span></div>
            </div>
          ))}
          <p style={{ fontSize:10, color:B.muted, marginTop:8 }}>Créditos extras: R$ 100 por 10 créditos (1 match)</p>
        </Card>
        <Card style={{ marginBottom:16, background:(B.orange||"#F59E0B")+"08", border:"1.5px solid "+(B.orange||"#F59E0B")+"20" }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.orange||"#F59E0B", marginBottom:6 }}>Termos de Uso</p>
          <p style={{ fontSize:11, color:B.muted, lineHeight:1.6 }}>Ao utilizar o Match4Biz, você concorda que:</p>
          <ul style={{ fontSize:11, color:B.muted, lineHeight:1.8, paddingLeft:16, margin:"6px 0 0" }}>
            <li>Toda negociação de parceria deve acontecer <strong style={{color:B.text}}>inteiramente dentro da plataforma</strong></li>
            <li>Será cobrada uma <strong style={{color:B.text}}>taxa de 5% a 10%</strong> sobre o valor da parceria fechada</li>
            <li>A Unique Marketing atua como facilitadora e mediadora das conexões</li>
            <li>Informações compartilhadas são confidenciais e de uso exclusivo da negociação</li>
          </ul>
        </Card>
        <button onClick={doAccept} style={{ width:"100%", padding:"16px 0", borderRadius:16, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:15, fontWeight:700, color:"#0D0D0D", marginBottom:30 }}>Aceitar Termos e Começar</button>
      </div>
    </div>
  );

  /* ═══ PROFILE DETAIL MODAL ═══ */
  if (showProfile) {
    const p = showProfile;
    const col = getColor(p.name);
    return (
      <div className="app" style={{ background:B.bg, color:B.text }}>
        <Head title="" onBack={() => setShowProfile(null)} />
        <div className="content" style={{ padding:"0 16px" }}>
          <div style={{ textAlign:"center", padding:"10px 0 20px" }}>
            {p.logo_url ? <img src={p.logo_url} alt="" style={{ width:90, height:90, borderRadius:24, objectFit:"cover", border:"3px solid "+col, margin:"0 auto 12px", display:"block" }} /> : <div style={{ width:90, height:90, borderRadius:24, background:"linear-gradient(135deg, "+col+"30, "+col+"10)", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", fontSize:32, fontWeight:900, color:col }}>{getInitials(p.name)}</div>}
            <h2 style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>{p.name}</h2>
            <p style={{ fontSize:12, color:B.muted }}>{p.plan ? "Plano " + (p.plan.charAt(0).toUpperCase() + p.plan.slice(1)) : "Cliente Unique"} · {getSince(p.start_date)}</p>
          </div>
          {p.contact_name && <Card style={{ marginBottom:10 }}><p className="sl" style={{ marginBottom:6 }}>Responsável</p><p style={{ fontSize:14, fontWeight:600 }}>{p.contact_name}</p></Card>}
          {p.notes && <Card style={{ marginBottom:10 }}><p className="sl" style={{ marginBottom:6 }}>Sobre a empresa</p><p style={{ fontSize:13, lineHeight:1.6, color:B.muted }}>{p.notes}</p></Card>}
          <div style={{ display:"flex", gap:8, marginTop:16 }}>
            <button onClick={() => { setShowProfile(null); handlePass(); }} style={{ flex:1, padding:"14px 0", borderRadius:14, border:"1.5px solid "+(B.red||"#EF4444")+"30", background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:B.red||"#EF4444" }}>Pular</button>
            <button onClick={() => { setShowProfile(null); handleLike(); }} style={{ flex:1, padding:"14px 0", borderRadius:14, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#0D0D0D" }}>Dar Match</button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══ BUY CREDITS MODAL ═══ */
  const BuyModal = showBuy ? (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={() => setShowBuy(false)}>
      <div onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:430, background:B.bgCard, borderRadius:"24px 24px 0 0", padding:"20px 20px calc(20px + env(safe-area-inset-bottom,0px))" }}>
        <div style={{ width:40, height:4, borderRadius:2, background:B.border, margin:"0 auto 16px" }} />
        <h3 style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Comprar Créditos</h3>
        <p style={{ fontSize:12, color:B.muted, marginBottom:16 }}>Cada 10 créditos = 1 match</p>
        {[
          { n:10, price:"R$ 100", desc:"1 match", popular:false },
          { n:30, price:"R$ 250", desc:"3 matches · Economize 17%", popular:true },
          { n:50, price:"R$ 400", desc:"5 matches · Economize 20%", popular:false },
        ].map((p,i) => (
          <button key={i} onClick={() => { showToast("Redirecionando para pagamento..."); setShowBuy(false); }} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"14px 16px", borderRadius:14, border:p.popular?"2px solid "+B.accent:"1.5px solid "+B.border, background:p.popular?B.accent+"08":"transparent", cursor:"pointer", fontFamily:"inherit", marginBottom:8, textAlign:"left" }}>
            <div><p style={{ fontSize:14, fontWeight:700 }}>{p.n} créditos</p><p style={{ fontSize:11, color:B.muted }}>{p.desc}</p></div>
            <div style={{ textAlign:"right" }}><p style={{ fontSize:16, fontWeight:800, color:B.accent }}>{p.price}</p>{p.popular && <span style={{ fontSize:9, fontWeight:700, background:B.accent, color:"#0D0D0D", padding:"2px 8px", borderRadius:6 }}>POPULAR</span>}</div>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  /* ═══ MAIN VIEW ═══ */
  return (
    <div className="app" style={{ background:B.bg, color:B.text }}>
      {ToastEl}
      {BuyModal}
      <Head title="Match4Biz" onBack={onBack} right={
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={() => setShowBuy(true)} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 12px", borderRadius:10, background:B.accent+"15", border:"1px solid "+B.accent+"30", cursor:"pointer", fontFamily:"inherit" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            <span style={{ fontSize:12, fontWeight:700, color:B.accent }}>{isUnlimited ? "\u221E" : credits}</span>
          </button>
        </div>
      } />
      <div className="content" style={{ padding:"0 16px" }}>
        {/* Tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          {[{k:"discover",l:"Descobrir"},{k:"matches",l:"Meus Matches ("+matches.length+")"}].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{ flex:1, padding:"10px 0", borderRadius:12, border:tab===t.k?"none":"1.5px solid "+B.border, background:tab===t.k?B.accent:"transparent", color:tab===t.k?"#0D0D0D":B.muted, fontSize:12, fontWeight:tab===t.k?700:500, cursor:"pointer", fontFamily:"inherit" }}>{t.l}</button>
          ))}
        </div>

        {loading ? (
          <Card style={{ textAlign:"center", padding:40 }}><div style={{ width:36, height:36, border:"3px solid "+B.border, borderTopColor:B.accent, borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 12px" }} /><p style={{ fontSize:13, color:B.muted }}>Buscando empresas...</p></Card>
        ) : tab === "discover" ? (<>
          {available.length > 0 && current ? (
            <div style={{ borderRadius:24, overflow:"hidden", background:B.bgCard, border:"1px solid "+B.border, boxShadow:"0 4px 24px rgba(0,0,0,0.06)", transform:swipeAnim==="like"?"translateX(100px) rotate(8deg) scale(0.95)":swipeAnim==="pass"?"translateX(-100px) rotate(-8deg) scale(0.95)":"none", opacity:swipeAnim?0.5:1, transition:"all .35s cubic-bezier(0.34,1.56,0.64,1)" }}>
              {/* Header gradient */}
              <div style={{ height:120, background:"linear-gradient(135deg, "+getColor(current.name)+"25, "+getColor(current.name)+"08, transparent)", position:"relative", display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
                <div style={{ transform:"translateY(40px)" }}>
                  {current.logo_url ? <img src={current.logo_url} alt="" style={{ width:80, height:80, borderRadius:22, objectFit:"cover", border:"3px solid "+B.bgCard, boxShadow:"0 4px 16px rgba(0,0,0,0.1)" }} /> : <div style={{ width:80, height:80, borderRadius:22, background:"linear-gradient(135deg, "+getColor(current.name)+", "+getColor(current.name)+"90)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:900, color:"#fff", border:"3px solid "+B.bgCard, boxShadow:"0 4px 16px rgba(0,0,0,0.1)" }}>{getInitials(current.name)}</div>}
                </div>
                {!isUnlimited && credits < 10 && <div style={{ position:"absolute", inset:0, background:B.bg+"CC", backdropFilter:"blur(4px)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", borderRadius:"24px 24px 0 0" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                  <p style={{ fontSize:13, fontWeight:700, marginTop:8 }}>Créditos esgotados</p>
                  <button onClick={() => setShowBuy(true)} style={{ marginTop:8, padding:"8px 20px", borderRadius:10, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, color:"#0D0D0D" }}>Comprar créditos</button>
                </div>}
              </div>
              {/* Profile info */}
              <div style={{ textAlign:"center", padding:"48px 20px 16px" }}>
                <h3 style={{ fontSize:20, fontWeight:900, marginBottom:2 }}>{current.name}</h3>
                {current.contact_name && <p style={{ fontSize:12, color:B.muted }}>{current.contact_name}</p>}
                <p style={{ fontSize:11, color:getColor(current.name), fontWeight:600, marginTop:4 }}>{current.plan ? "Plano " + (current.plan.charAt(0).toUpperCase() + current.plan.slice(1)) : "Cliente Unique"} · {getSince(current.start_date)}</p>
              </div>
              {/* Notes/Description */}
              {current.notes && <div style={{ padding:"0 20px 16px" }}><p style={{ fontSize:12, color:B.muted, lineHeight:1.6, textAlign:"center" }}>{current.notes.length > 150 ? current.notes.substring(0,150)+"..." : current.notes}</p></div>}
              {/* Action buttons */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, padding:"8px 20px 16px" }}>
                <button onClick={handlePass} style={{ width:52, height:52, borderRadius:"50%", background:(B.red||"#EF4444")+"10", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"transform .15s" }} onTouchStart={e=>e.currentTarget.style.transform="scale(0.9)"} onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.red||"#EF4444"} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <button onClick={() => setShowProfile(current)} style={{ width:44, height:44, borderRadius:"50%", background:B.accent+"15", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
                <button onClick={handleLike} style={{ width:60, height:60, borderRadius:"50%", background:B.accent, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px "+B.accent+"50", transition:"transform .15s" }} onTouchStart={e=>e.currentTarget.style.transform="scale(0.9)"} onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#0D0D0D" stroke="#0D0D0D" strokeWidth="1"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                </button>
              </div>
              <p style={{ textAlign:"center", fontSize:11, color:B.muted, paddingBottom:14 }}>{available.length} empresa{available.length > 1 ? "s" : ""} disponíve{available.length > 1 ? "is" : "l"} · {isUnlimited ? "Créditos ilimitados" : credits + " créditos"}</p>
            </div>
          ) : (
            <Card style={{ textAlign:"center", padding:32 }}>
              <div style={{ width:64, height:64, borderRadius:20, background:B.accent+"10", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              </div>
              <p style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>{allClients.length === 0 ? "Nenhuma empresa disponível" : "Você já viu todos!"}</p>
              <p style={{ fontSize:13, color:B.muted, lineHeight:1.5 }}>{allClients.length === 0 ? "Novas empresas aparecerão quando mais clientes se cadastrarem." : "Novas empresas aparecerão em breve. Confira seus matches!"}</p>
            </Card>
          )}
        </>) : (
          /* ═══ MATCHES TAB ═══ */
          <>
            {matches.length === 0 ? (
              <Card style={{ textAlign:"center", padding:32 }}>
                <p style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Nenhum match ainda</p>
                <p style={{ fontSize:12, color:B.muted }}>Explore perfis na aba Descobrir para criar conexões!</p>
              </Card>
            ) : matches.map((m,i) => {
              const partnerId = m.client_a_id === myClient?.id ? m.client_b_id : m.client_a_id;
              const partnerName = m.client_a_id === myClient?.id ? m.client_b_name : m.client_a_name;
              const partner = allClients.find(c => c.id === partnerId) || { name: partnerName };
              return (
                <Card key={m.id} style={{ marginBottom:8, cursor:"pointer" }} onClick={() => setShowProfile(partner)}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <Av name={partnerName} sz={48} fs={18} />
                    <div style={{ flex:1 }}>
                      <p style={{ fontSize:14, fontWeight:700 }}>{partnerName}</p>
                      <p style={{ fontSize:11, color:B.muted }}>{m.status === "pending" ? "Aguardando confirmação" : m.status === "connected" ? "Conectado" : m.status === "rejected" ? "Recusado" : m.status}</p>
                    </div>
                    <Tag color={m.status === "connected" ? B.green : m.status === "pending" ? B.accent : B.red}>{m.status === "connected" ? "Ativo" : m.status === "pending" ? "Pendente" : "Recusado"}</Tag>
                  </div>
                </Card>
              );
            })}
          </>
        )}
        <div style={{ height:30 }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   CLIENT GAMIFICATION — Sistema de engajamento do cliente
   ═══════════════════════════════════════════════════════════════════ */
function ClientGamification({ onBack, user, clients, demands }) {
  const [tab, setTab] = useState("score");
  const { showToast, ToastEl } = useToast();
  const [scoreData, setScoreData] = useState([]);
  const [allScores, setAllScores] = useState({});

  /* ── Load real scores from DB ── */
  useEffect(() => {
