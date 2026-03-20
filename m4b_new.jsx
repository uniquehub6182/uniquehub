function ClientMatch4Biz({ onBack, user }) {
  const [accepted, setAccepted] = useState(() => { try { return localStorage.getItem("uh_m4b_accepted") === "1"; } catch { return false; } });
  const [tab, setTab] = useState("discover");
  const [credits, setCredits] = useState(0);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [allClients, setAllClients] = useState([]);
  const [myClient, setMyClient] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [swipeAnim, setSwipeAnim] = useState(null);
  const [showBuy, setShowBuy] = useState(false);
  const [chatMatch, setChatMatch] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [showProfile, setShowProfile] = useState(null);
  const [touchStartX, setTouchStartX] = useState(null);
  const [dragX, setDragX] = useState(0);
  const chatEndRef = useRef(null);
  const { showToast, ToastEl } = useToast();

  const getCreditsForPlan = (v) => { v = parseFloat(v) || 0; if (v >= 4480) return 9999; if (v >= 3480) return 30; if (v >= 2480) return 20; if (v >= 1480) return 10; return 10; };
  const isUnlimited = credits >= 9999;
  const getInitials = (n) => (n||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const getColor = (n) => { const c=["#10B981","#3B82F6","#8B5CF6","#EC4899","#F59E0B","#EF4444","#06B6D4","#84CC16"]; let h=0; for(let i=0;i<(n||"").length;i++) h=((h<<5)-h)+n.charCodeAt(i); return c[Math.abs(h)%c.length]; };
  const getSince = (d) => d ? "Desde "+new Date(d).getFullYear() : "";
  const doAccept = () => { setAccepted(true); try { localStorage.setItem("uh_m4b_accepted","1"); } catch{} };

  /* ── Load data ── */
  useEffect(() => {
    if (!supabase || !user?.email) { setLoading(false); return; }
    (async () => {
      try {
        const { data: cl } = await supabase.from("clients").select("*").eq("contact_email", user.email).maybeSingle();
        if (!cl) { setLoading(false); return; }
        setMyClient(cl);
        const planCredits = getCreditsForPlan(cl.monthly_value);
        try { const extra = parseInt(localStorage.getItem("uh_m4b_credits_"+cl.id)||"0"); setCredits(planCredits+extra); } catch { setCredits(planCredits); }
        const { data: clients } = await supabase.from("clients").select("*").neq("id", cl.id).eq("status", "ativo");
        if (clients) setAllClients(clients);
        const { data: m4b } = await supabase.from("match4biz").select("*").or("client_a_id.eq."+cl.id+",client_b_id.eq."+cl.id);
        if (m4b) setMatches(m4b);
      } catch(e) { console.warn("[M4B]",e); }
      setLoading(false);
    })();
  }, [user?.email]);

  /* Derived data */
  const likedIds = matches.map(m => m.client_a_id === myClient?.id ? m.client_b_id : m.client_a_id);
  const mutualMatches = matches.filter(m => m.client_a_confirmed && m.client_b_confirmed);
  const available = allClients.filter(c => !likedIds.includes(c.id));
  const current = available.length > 0 ? available[currentIdx % available.length] : null;

  /* ── Actions ── */
  const handleLike = async () => {
    if (!current || !myClient) return;
    if (!isUnlimited && credits < 10) { setShowBuy(true); return; }
    setSwipeAnim("like");
    setTimeout(async () => {
      try {
        /* Check if a pending match exists where the OTHER client already liked us */
        const existing = matches.find(m => (m.client_a_id === current.id && m.client_b_id === myClient.id) || (m.client_a_id === myClient.id && m.client_b_id === current.id));
        if (existing) {
          /* Update to mutual match */
          const myField = existing.client_a_id === myClient.id ? "client_a_confirmed" : "client_b_confirmed";
          await supabase.from("match4biz").update({ [myField]: true, status: "mutual" }).eq("id", existing.id);
          setMatches(prev => prev.map(m => m.id === existing.id ? { ...m, [myField]: true, status: "mutual" } : m));
          showToast("É um Match! 🎉 Vocês podem conversar agora");
          setTab("matches");
        } else {
          /* Create new pending match */
          const newMatch = { client_a_id: myClient.id, client_a_name: myClient.name, client_b_id: current.id, client_b_name: current.name, status: "pending", messages: [], created_by: user?.name || "Cliente", client_a_confirmed: true, client_b_confirmed: false };
          const saved = await supaCreateMatch(newMatch);
          if (saved) { setMatches(prev => [...prev, saved]); showToast("Match enviado! Aguardando " + current.name); }
        }
      } catch(e) { console.warn("[M4B] Like:", e); }
      if (!isUnlimited) {
        const nc = credits - 10;
        setCredits(nc);
        try { localStorage.setItem("uh_m4b_credits_"+myClient.id, String(Math.max(0,nc-getCreditsForPlan(myClient.monthly_value)))); } catch{}
      }
      setCurrentIdx(i => i + 1);
      setSwipeAnim(null);
      setDragX(0);
    }, 350);
  };

  const handlePass = () => { if(!current) return; setSwipeAnim("pass"); setTimeout(()=>{setCurrentIdx(i=>i+1);setSwipeAnim(null);setDragX(0);},300); };


  /* ── Touch/Swipe handlers ── */
  const onTouchStart = (e) => { setTouchStartX(e.touches[0].clientX); };
  const onTouchMove = (e) => { if (touchStartX === null) return; setDragX(e.touches[0].clientX - touchStartX); };
  const onTouchEnd = () => { if (Math.abs(dragX) > 80) { dragX > 0 ? handleLike() : handlePass(); } else { setDragX(0); } setTouchStartX(null); };

  /* ── Chat: send message ── */
  const sendChatMsg = async (text, type="text") => {
    if (!chatMatch || (!text?.trim() && type==="text")) return;
    const msg = { from: myClient?.id, fromName: myClient?.name, text: text?.trim()||"", type, ts: new Date().toISOString() };
    const msgs = [...(chatMatch.messages||[]), msg];
    try { await supabase.from("match4biz").update({ messages: msgs }).eq("id", chatMatch.id); } catch(e) { console.warn("[M4B] Chat:",e); }
    setMatches(prev => prev.map(m => m.id === chatMatch.id ? {...m, messages: msgs} : m));
    setChatMatch(prev => ({...prev, messages: msgs}));
    setChatInput("");
    setTimeout(() => chatEndRef.current?.scrollIntoView({behavior:"smooth"}), 100);
  };

  /* ── Chat: upload file ── */
  const chatFileRef = useRef(null);
  const handleChatFile = async (e) => {
    const file = e.target.files?.[0]; if (!file || !supabase) return;
    const path = `m4b/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("demand-files").upload(path, file, { upsert:true });
    if (error) { showToast("Erro no upload"); return; }
    const { data: u } = supabase.storage.from("demand-files").getPublicUrl(path);
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    const isVid = /\.(mp4|mov|webm)$/i.test(file.name);
    sendChatMsg(u.publicUrl, isImg ? "image" : isVid ? "video" : "file");
    e.target.value = "";
  };

  /* ── Quick actions ── */
  const handleDealAction = async (action) => {
    if (!chatMatch) return;
    const statusMap = { close:"deal_closed", noclose:"deal_rejected", help:"agency_help" };
    const msgMap = { close:"🤝 Negócio fechado!", noclose:"❌ Negócio não fechado", help:"🏢 Pediu ajuda da agência" };
    await sendChatMsg(msgMap[action], "system");
    try { await supabase.from("match4biz").update({ status: statusMap[action] }).eq("id", chatMatch.id); } catch(e) {}
    setMatches(prev => prev.map(m => m.id === chatMatch.id ? {...m, status: statusMap[action]} : m));
    setChatMatch(prev => ({...prev, status: statusMap[action]}));
    showToast(action==="close"?"Parabéns pelo negócio! 🎉":action==="help"?"A agência foi notificada":"Status atualizado");
  };

  /* Helper: get partner info from match */
  const getPartner = (m) => {
    const pid = m.client_a_id === myClient?.id ? m.client_b_id : m.client_a_id;
    const pname = m.client_a_id === myClient?.id ? m.client_b_name : m.client_a_name;
    return { id: pid, name: pname, ...(allClients.find(c=>c.id===pid)||{}) };
  };


  /* ═══ CHAT VIEW ═══ */
  if (chatMatch) {
    const partner = getPartner(chatMatch);
    const col = getColor(partner.name);
    const msgs = chatMatch.messages || [];
    const isClosed = chatMatch.status === "deal_closed" || chatMatch.status === "deal_rejected";
    return (
      <div className="app" style={{ background:B.bg, color:B.text }}>
        {ToastEl}
        <input ref={chatFileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" style={{display:"none"}} onChange={handleChatFile} />
        <Head title="" onBack={()=>setChatMatch(null)} right={
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {partner.logo_url ? <img src={partner.logo_url} alt="" style={{width:32,height:32,borderRadius:10,objectFit:"cover"}} /> : <div style={{width:32,height:32,borderRadius:10,background:col+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:col}}>{getInitials(partner.name)}</div>}
              <div><p style={{fontSize:13,fontWeight:700}}>{partner.name}</p><p style={{fontSize:9,color:chatMatch.status==="mutual"?B.green:B.muted}}>{chatMatch.status==="deal_closed"?"Negócio fechado ✅":chatMatch.status==="agency_help"?"Agência participando":chatMatch.status==="deal_rejected"?"Não fechado":"Conectado"}</p></div>
            </div>
          </div>
        } />
        {/* Quick action buttons */}
        {!isClosed && <div style={{display:"flex",gap:6,padding:"8px 16px",borderBottom:"1px solid "+B.border,overflowX:"auto",scrollbarWidth:"none"}}>
          <button onClick={()=>handleDealAction("close")} style={{display:"flex",alignItems:"center",gap:4,padding:"7px 14px",borderRadius:20,border:"1.5px solid "+B.green+"40",background:B.green+"08",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600,color:B.green,whiteSpace:"nowrap",flexShrink:0}}>🤝 Fechar Negócio</button>
          <button onClick={()=>handleDealAction("noclose")} style={{display:"flex",alignItems:"center",gap:4,padding:"7px 14px",borderRadius:20,border:"1.5px solid "+(B.red||"#EF4444")+"40",background:(B.red||"#EF4444")+"08",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600,color:B.red||"#EF4444",whiteSpace:"nowrap",flexShrink:0}}>❌ Não Fechar</button>
          <button onClick={()=>handleDealAction("help")} style={{display:"flex",alignItems:"center",gap:4,padding:"7px 14px",borderRadius:20,border:"1.5px solid #6366F1"+"40",background:"#6366F1"+"08",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600,color:"#6366F1",whiteSpace:"nowrap",flexShrink:0}}>🏢 Pedir Ajuda</button>
        </div>}

        {/* Messages */}
        <div className="content" style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
          {msgs.length === 0 && <div style={{textAlign:"center",padding:"40px 20px"}}><p style={{fontSize:14,fontWeight:700}}>Vocês deram Match! 🎉</p><p style={{fontSize:12,color:B.muted,marginTop:6,lineHeight:1.5}}>Iniciem a conversa sobre a parceria. Enviem propostas, arquivos e definam os próximos passos.</p></div>}
          {msgs.map((msg,i) => {
            const isMe = msg.from === myClient?.id;
            const isSys = msg.type === "system";
            if (isSys) return <div key={i} style={{textAlign:"center",margin:"12px 0"}}><span style={{fontSize:11,color:B.muted,background:B.bg,padding:"4px 14px",borderRadius:20,border:"1px solid "+B.border}}>{msg.text}</span></div>;
            return (
              <div key={i} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start",marginBottom:8}}>
                <div style={{maxWidth:"78%",padding:msg.type==="image"?"4px":"10px 14px",borderRadius:16,background:isMe?B.accent+"18":B.bgCard,border:"1px solid "+(isMe?B.accent+"30":B.border),borderBottomRightRadius:isMe?4:16,borderBottomLeftRadius:isMe?16:4}}>
                  {msg.type==="image" && <img src={msg.text} alt="" style={{maxWidth:"100%",maxHeight:200,borderRadius:12,display:"block"}} />}
                  {msg.type==="video" && <video src={msg.text} controls style={{maxWidth:"100%",maxHeight:200,borderRadius:12}} />}
                  {msg.type==="file" && <a href={msg.text} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:8,color:B.accent,fontSize:12,fontWeight:600,textDecoration:"none"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Arquivo anexado</a>}
                  {msg.type==="text" && <p style={{fontSize:13,lineHeight:1.5,margin:0,wordBreak:"break-word"}}>{msg.text}</p>}
                  <p style={{fontSize:9,color:B.muted,marginTop:4,textAlign:"right"}}>{new Date(msg.ts).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>
        {/* Input bar */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",borderTop:"1px solid "+B.border,background:B.bgCard,paddingBottom:"calc(10px + env(safe-area-inset-bottom,0px))"}}>
          <button onClick={()=>chatFileRef.current?.click()} style={{width:38,height:38,borderRadius:12,border:"1px solid "+B.border,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
          </button>
          <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChatMsg(chatInput);}}} placeholder="Escreva sua mensagem..." className="tinput" style={{flex:1,padding:"10px 14px",fontSize:14}} />
          <button onClick={()=>sendChatMsg(chatInput)} disabled={!chatInput.trim()} style={{width:38,height:38,borderRadius:12,background:chatInput.trim()?B.accent:B.border,border:"none",cursor:chatInput.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={chatInput.trim()?"#0D0D0D":B.muted} strokeWidth="2" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    );
  }

  /* ═══ PROFILE DETAIL ═══ */
  if (showProfile) {
    const p = showProfile;
    const col = getColor(p.name);
    return (
      <div className="app" style={{ background:B.bg, color:B.text }}>
        <Head title="" onBack={()=>setShowProfile(null)} />
        <div className="content" style={{ padding:"0 16px" }}>
          {/* Hero */}
          <div style={{ textAlign:"center", padding:"10px 0 16px" }}>
            <div style={{ height:120, borderRadius:20, background:`linear-gradient(135deg, ${col}30, ${col}08)`, marginBottom:-40, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
              <div style={{ transform:"translateY(50%)" }}>
                {p.logo_url ? <img src={p.logo_url} alt="" style={{ width:96, height:96, borderRadius:28, objectFit:"cover", border:"4px solid "+B.bg, boxShadow:"0 6px 24px rgba(0,0,0,0.12)" }} /> : <div style={{ width:96, height:96, borderRadius:28, background:`linear-gradient(135deg, ${col}, ${col}90)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, fontWeight:900, color:"#fff", border:"4px solid "+B.bg, boxShadow:"0 6px 24px rgba(0,0,0,0.12)" }}>{getInitials(p.name)}</div>}
              </div>
            </div>
            <div style={{ paddingTop:56 }}>
              <h2 style={{ fontSize:22, fontWeight:900, marginBottom:2 }}>{p.name}</h2>
              {p.contact_name && <p style={{ fontSize:13, color:B.muted }}>{p.contact_name}</p>}
              <p style={{ fontSize:12, color:col, fontWeight:600, marginTop:4 }}>{p.plan ? "Plano "+(p.plan.charAt(0).toUpperCase()+p.plan.slice(1)) : "Cliente Unique"} · {getSince(p.start_date)}</p>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, margin:"12px 0" }}>
            {[
              { l:"Segmento", v:p.segment||"—" },
              { l:"Desde", v:p.start_date ? new Date(p.start_date).getFullYear() : "—" },
              { l:"Status", v:"Ativo" },
            ].map((s,i) => <div key={i} style={{ background:B.bgCard, borderRadius:14, border:"1px solid "+B.border, padding:"12px 10px", textAlign:"center" }}><p style={{ fontSize:9, color:B.muted, textTransform:"uppercase", letterSpacing:0.8, fontWeight:600 }}>{s.l}</p><p style={{ fontSize:14, fontWeight:800, marginTop:4 }}>{s.v}</p></div>)}
          </div>

          {/* About */}
          {p.notes && <Card style={{ marginBottom:10 }}>
            <p style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Sobre a empresa</p>
            <p style={{ fontSize:13, lineHeight:1.7, color:B.text }}>{p.notes}</p>
          </Card>}

          {/* Contact */}
          {p.contact_name && <Card style={{ marginBottom:10 }}>
            <p style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>Responsável</p>
            <p style={{ fontSize:14, fontWeight:700 }}>{p.contact_name}</p>
          </Card>}

          {/* Action buttons */}
          <div style={{ display:"flex", gap:8, marginTop:16, marginBottom:30 }}>
            <button onClick={()=>{setShowProfile(null);handlePass();}} style={{ flex:1, padding:"14px 0", borderRadius:16, border:"1.5px solid "+(B.red||"#EF4444")+"30", background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:B.red||"#EF4444" }}>Pular</button>
            <button onClick={()=>{setShowProfile(null);handleLike();}} style={{ flex:2, padding:"14px 0", borderRadius:16, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#0D0D0D" }}>❤️ Dar Match · 10 créditos</button>
          </div>
        </div>
      </div>
    );
  }

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
          {[{ic:"🔍",t:"Descubra",d:"Veja perfis de empresas parceiras e encontre oportunidades"},{ic:"❤️",t:"Dê Match",d:"Use seus créditos para demonstrar interesse em uma parceria"},{ic:"💬",t:"Converse",d:"Se ambos derem match, um chat exclusivo é aberto"},{ic:"🤝",t:"Feche Negócios",d:"Negocie direto na plataforma com suporte da agência"}].map((s,i) => (
            <div key={i} style={{ display:"flex", gap:12, padding:"10px 0", borderBottom:i<3?"1px solid "+B.border:"none" }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{s.ic}</span>
              <div><p style={{ fontSize:13, fontWeight:700 }}>{s.t}</p><p style={{ fontSize:11, color:B.muted, lineHeight:1.4 }}>{s.d}</p></div>
            </div>
          ))}
        </Card>
        <Card style={{ marginBottom:12, background:B.accent+"08", border:"1.5px solid "+B.accent+"20" }}>
          <p style={{ fontSize:12, fontWeight:700, color:B.accent, marginBottom:6 }}>Créditos por Plano</p>
          {[{p:"Free",c:"10 créditos",m:"1 match grátis"},{p:"R$ 1.480/mês",c:"10 créditos",m:"1 match"},{p:"R$ 2.480/mês",c:"20 créditos",m:"2 matches"},{p:"R$ 3.480/mês",c:"30 créditos",m:"3 matches"},{p:"R$ 4.480/mês",c:"Ilimitado",m:"∞ matches"}].map((p,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<4?"1px solid "+B.border:"none" }}>
              <span style={{ fontSize:12, fontWeight:600 }}>{p.p}</span>
              <div style={{ textAlign:"right" }}><span style={{ fontSize:12, fontWeight:700, color:B.accent }}>{p.c}</span><span style={{ fontSize:10, color:B.muted, marginLeft:6 }}>{p.m}</span></div>
            </div>
          ))}
          <p style={{ fontSize:10, color:B.muted, marginTop:8 }}>Créditos extras: R$ 100 por 10 créditos</p>
        </Card>
        <Card style={{ marginBottom:16, background:"#F59E0B08", border:"1.5px solid #F59E0B20" }}>
          <p style={{ fontSize:12, fontWeight:700, color:"#F59E0B", marginBottom:6 }}>Termos de Uso</p>
          <p style={{ fontSize:11, color:B.muted, lineHeight:1.6 }}>Ao utilizar o Match4Biz, você concorda que:</p>
          <ul style={{ fontSize:11, color:B.muted, lineHeight:1.8, paddingLeft:16, margin:"6px 0 0" }}>
            <li>Toda negociação deve acontecer <strong style={{color:B.text}}>inteiramente dentro da plataforma</strong></li>
            <li>Será cobrada uma <strong style={{color:B.text}}>taxa de 5% a 10%</strong> sobre o valor da parceria fechada</li>
            <li>A Unique Marketing atua como facilitadora e mediadora das conexões</li>
            <li>Informações compartilhadas são confidenciais</li>
          </ul>
        </Card>
        <button onClick={doAccept} style={{ width:"100%", padding:"16px 0", borderRadius:16, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:15, fontWeight:700, color:"#0D0D0D", marginBottom:30 }}>Aceitar Termos e Começar</button>
      </div>
    </div>
  );

  /* ═══ BUY CREDITS MODAL ═══ */
  const BuyModal = showBuy ? (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:100, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={()=>setShowBuy(false)}>
      <div onClick={e=>e.stopPropagation()} style={{ width:"100%", maxWidth:430, background:B.bgCard, borderRadius:"24px 24px 0 0", padding:"20px 20px calc(20px + env(safe-area-inset-bottom,0px))" }}>
        <div style={{ width:40, height:4, borderRadius:2, background:B.border, margin:"0 auto 16px" }} />
        <h3 style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Comprar Créditos</h3>
        <p style={{ fontSize:12, color:B.muted, marginBottom:16 }}>Cada 10 créditos = 1 match</p>
        {[{n:10,price:"R$ 100",desc:"1 match",pop:false},{n:30,price:"R$ 250",desc:"3 matches · Economize 17%",pop:true},{n:50,price:"R$ 400",desc:"5 matches · Economize 20%",pop:false}].map((p,i) => (
          <button key={i} onClick={()=>{showToast("Redirecionando para pagamento...");setShowBuy(false);}} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", padding:"14px 16px", borderRadius:14, border:p.pop?"2px solid "+B.accent:"1.5px solid "+B.border, background:p.pop?B.accent+"08":"transparent", cursor:"pointer", fontFamily:"inherit", marginBottom:8, textAlign:"left" }}>
            <div><p style={{ fontSize:14, fontWeight:700 }}>{p.n} créditos</p><p style={{ fontSize:11, color:B.muted }}>{p.desc}</p></div>
            <div style={{ textAlign:"right" }}><p style={{ fontSize:16, fontWeight:800, color:B.accent }}>{p.price}</p>{p.pop && <span style={{ fontSize:9, fontWeight:700, background:B.accent, color:"#0D0D0D", padding:"2px 8px", borderRadius:6 }}>POPULAR</span>}</div>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  /* ═══ MAIN VIEW ═══ */
  const cardRotation = dragX * 0.08;
  const cardOpacity = Math.max(0.3, 1 - Math.abs(dragX) / 300);
  const likeIndicator = dragX > 40;
  const passIndicator = dragX < -40;

  return (
    <div className="app" style={{ background:B.bg, color:B.text }}>
      {ToastEl}
      {BuyModal}
      <Head title="Match4Biz" onBack={onBack} right={
        <button onClick={()=>setShowBuy(true)} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 12px", borderRadius:10, background:B.accent+"15", border:"1px solid "+B.accent+"30", cursor:"pointer", fontFamily:"inherit" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span style={{ fontSize:12, fontWeight:700, color:B.accent }}>{isUnlimited ? "∞" : credits}</span>
        </button>
      } />
      <div className="content" style={{ padding:"0 16px" }}>
        {/* Tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:14 }}>
          {[{k:"discover",l:"Descobrir"},{k:"matches",l:"Conexões ("+mutualMatches.length+")"}].map(t => (
            <button key={t.k} onClick={()=>setTab(t.k)} style={{ flex:1, padding:"10px 0", borderRadius:12, border:tab===t.k?"none":"1.5px solid "+B.border, background:tab===t.k?B.accent:"transparent", color:tab===t.k?"#0D0D0D":B.muted, fontSize:12, fontWeight:tab===t.k?700:500, cursor:"pointer", fontFamily:"inherit" }}>{t.l}</button>
          ))}
        </div>

        {loading ? (
          <Card style={{ textAlign:"center", padding:40 }}><div style={{ width:36, height:36, border:"3px solid "+B.border, borderTopColor:B.accent, borderRadius:"50%", animation:"spin .8s linear infinite", margin:"0 auto 12px" }} /><p style={{ fontSize:13, color:B.muted }}>Buscando empresas...</p></Card>
        ) : tab === "discover" ? (<>
          {available.length > 0 && current ? (<>
            {/* Swipe indicators */}
            {likeIndicator && <div style={{ position:"fixed", top:80, left:"50%", transform:"translateX(-50%)", zIndex:50, padding:"6px 20px", borderRadius:12, background:B.green, color:"#fff", fontSize:13, fontWeight:700, boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>MATCH ❤️</div>}
            {passIndicator && <div style={{ position:"fixed", top:80, left:"50%", transform:"translateX(-50%)", zIndex:50, padding:"6px 20px", borderRadius:12, background:B.red||"#EF4444", color:"#fff", fontSize:13, fontWeight:700, boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>PULAR ✕</div>}

            {/* Card */}
            <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
              style={{ borderRadius:24, overflow:"hidden", background:B.bgCard, border:"1px solid "+B.border, boxShadow:"0 8px 32px rgba(0,0,0,0.08)", transform:`translateX(${swipeAnim==="like"?300:swipeAnim==="pass"?-300:dragX}px) rotate(${swipeAnim==="like"?15:swipeAnim==="pass"?-15:cardRotation}deg)`, opacity:swipeAnim?0:cardOpacity, transition:swipeAnim||!dragX?"all .4s cubic-bezier(0.34,1.56,0.64,1)":"none", position:"relative" }}>

              {/* Credits lock overlay */}
              {!isUnlimited && credits < 10 && <div style={{ position:"absolute", inset:0, zIndex:10, background:B.bg+"DD", backdropFilter:"blur(6px)", WebkitBackdropFilter:"blur(6px)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", borderRadius:24 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <p style={{ fontSize:15, fontWeight:800, marginTop:10 }}>Créditos esgotados</p>
                <p style={{ fontSize:12, color:B.muted, marginTop:4 }}>Compre créditos para dar match</p>
                <button onClick={()=>setShowBuy(true)} style={{ marginTop:12, padding:"10px 28px", borderRadius:12, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, color:"#0D0D0D" }}>Comprar créditos</button>
              </div>}

              {/* Gradient header */}
              <div style={{ height:130, background:`linear-gradient(135deg, ${getColor(current.name)}30, ${getColor(current.name)}08, transparent)`, display:"flex", alignItems:"flex-end", justifyContent:"center", position:"relative" }}>
                <div style={{ transform:"translateY(44px)" }}>
                  {current.logo_url && !current.logo_url.startsWith("data:") ? <img src={current.logo_url} alt="" style={{ width:88, height:88, borderRadius:24, objectFit:"cover", border:"4px solid "+B.bgCard, boxShadow:"0 6px 24px rgba(0,0,0,0.12)" }} /> : <div style={{ width:88, height:88, borderRadius:24, background:`linear-gradient(135deg, ${getColor(current.name)}, ${getColor(current.name)}90)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, fontWeight:900, color:"#fff", border:"4px solid "+B.bgCard, boxShadow:"0 6px 24px rgba(0,0,0,0.12)" }}>{getInitials(current.name)}</div>}
                </div>
              </div>

              {/* Info */}
              <div style={{ textAlign:"center", padding:"52px 20px 12px" }}>
                <h3 style={{ fontSize:20, fontWeight:900, marginBottom:2 }}>{current.name}</h3>
                {current.contact_name && <p style={{ fontSize:12, color:B.muted, marginTop:2 }}>{current.contact_name}</p>}
                <p style={{ fontSize:11, color:getColor(current.name), fontWeight:700, marginTop:4 }}>{current.plan ? "Plano "+(current.plan.charAt(0).toUpperCase()+current.plan.slice(1)) : "Cliente Unique"} · {getSince(current.start_date)}</p>
                {current.segment && <Tag color={getColor(current.name)} style={{ marginTop:8 }}>{current.segment}</Tag>}
              </div>

              {/* Description */}
              {current.notes && <div style={{ padding:"0 20px 12px" }}><p style={{ fontSize:12, color:B.muted, lineHeight:1.6, textAlign:"center" }}>{current.notes.length>180?current.notes.substring(0,180)+"...":current.notes}</p></div>}

              {/* Stats mini */}
              <div style={{ display:"flex", justifyContent:"center", gap:16, padding:"8px 20px 12px", borderTop:"1px solid "+B.border, marginTop:4 }}>
                <div style={{ textAlign:"center" }}><p style={{ fontSize:16, fontWeight:900, color:getColor(current.name) }}>{current.start_date ? new Date().getFullYear()-new Date(current.start_date).getFullYear()||"<1" : "?"}</p><p style={{ fontSize:9, color:B.muted }}>Anos</p></div>
                <div style={{ width:1, background:B.border }} />
                <div style={{ textAlign:"center" }}><p style={{ fontSize:16, fontWeight:900, color:B.accent }}>●</p><p style={{ fontSize:9, color:B.muted }}>Ativo</p></div>
                <div style={{ width:1, background:B.border }} />
                <div style={{ textAlign:"center" }}><p style={{ fontSize:16, fontWeight:900, color:getColor(current.name) }}>{current.plan?.charAt(0).toUpperCase()||"F"}</p><p style={{ fontSize:9, color:B.muted }}>Plano</p></div>
              </div>

              {/* Action buttons */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, padding:"8px 20px 16px" }}>
                <button onClick={handlePass} style={{ width:52, height:52, borderRadius:"50%", background:(B.red||"#EF4444")+"10", border:"2px solid "+(B.red||"#EF4444")+"30", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"transform .15s" }} onTouchStart={e=>e.currentTarget.style.transform="scale(0.9)"} onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.red||"#EF4444"} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <button onClick={()=>setShowProfile(current)} style={{ width:42, height:42, borderRadius:"50%", background:"#6366F115", border:"2px solid #6366F130", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
                <button onClick={handleLike} style={{ width:60, height:60, borderRadius:"50%", background:B.accent, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px "+B.accent+"50", transition:"transform .15s" }} onTouchStart={e=>e.currentTarget.style.transform="scale(0.9)"} onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="#0D0D0D" stroke="#0D0D0D" strokeWidth="1"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                </button>
              </div>
              <p style={{ textAlign:"center", fontSize:11, color:B.muted, paddingBottom:14 }}>{available.length} empresa{available.length>1?"s":""} · {isUnlimited?"Ilimitado":credits+" créditos"}</p>
            </div>
          </>) : (
            <Card style={{ textAlign:"center", padding:32 }}>
              <div style={{ width:64, height:64, borderRadius:20, background:B.accent+"10", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              </div>
              <p style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>{allClients.length===0?"Nenhuma empresa disponível":"Você já viu todos!"}</p>
              <p style={{ fontSize:13, color:B.muted, lineHeight:1.5 }}>{allClients.length===0?"Novas empresas aparecerão quando mais clientes se cadastrarem.":"Confira suas conexões ou volte mais tarde!"}</p>
            </Card>
          )}
        </>) : (
          /* ═══ CONNECTIONS TAB ═══ */
          <>
            {matches.length === 0 ? (
              <Card style={{ textAlign:"center", padding:32 }}>
                <p style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Nenhuma conexão ainda</p>
                <p style={{ fontSize:12, color:B.muted }}>Dê match com empresas na aba Descobrir!</p>
              </Card>
            ) : (<>
              {/* Mutual matches - can chat */}
              {mutualMatches.length > 0 && <>
                <p style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8 }}>Conexões ativas · Chat disponível</p>
                {mutualMatches.map((m,i) => {
                  const p = getPartner(m);
                  const lastMsg = (m.messages||[]).filter(x=>x.type!=="system").slice(-1)[0];
                  const col = getColor(p.name);
                  return (
                    <Card key={m.id} style={{ marginBottom:8, cursor:"pointer", padding:"12px 14px" }} onClick={()=>setChatMatch(m)}>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        {p.logo_url && !p.logo_url.startsWith("data:") ? <img src={p.logo_url} alt="" style={{ width:48, height:48, borderRadius:14, objectFit:"cover" }} /> : <div style={{ width:48, height:48, borderRadius:14, background:col+"20", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:800, color:col, flexShrink:0 }}>{getInitials(p.name)}</div>}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <p style={{ fontSize:14, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</p>
                            <Tag color={m.status==="deal_closed"?B.green:m.status==="agency_help"?"#6366F1":m.status==="deal_rejected"?B.red||"#EF4444":B.accent}>{m.status==="deal_closed"?"Fechado ✅":m.status==="agency_help"?"Agência":m.status==="deal_rejected"?"Não fechou":"Ativo"}</Tag>
                          </div>
                          <p style={{ fontSize:11, color:B.muted, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lastMsg ? (lastMsg.from===myClient?.id?"Você: ":"")+lastMsg.text.substring(0,40) : "Toque para conversar"}</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </>}

              {/* Pending matches */}
              {matches.filter(m=>!m.client_a_confirmed||!m.client_b_confirmed).length > 0 && <>
                <p style={{ fontSize:11, fontWeight:700, color:B.muted, textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, marginTop:mutualMatches.length>0?16:0 }}>Aguardando match</p>
                {matches.filter(m=>!m.client_a_confirmed||!m.client_b_confirmed).map((m,i) => {
                  const p = getPartner(m);
                  const iSent = m.client_a_id === myClient?.id && m.client_a_confirmed;
                  return (
                    <Card key={m.id} style={{ marginBottom:8, opacity:0.7 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                        <Av name={p.name} sz={44} fs={16} />
                        <div style={{ flex:1 }}>
                          <p style={{ fontSize:13, fontWeight:600 }}>{p.name}</p>
                          <p style={{ fontSize:11, color:B.muted }}>{iSent?"Aguardando resposta...":"Aguardando seu interesse"}</p>
                        </div>
                        <Tag color={B.accent+"80"}>Pendente</Tag>
                      </div>
                    </Card>
                  );
                })}
              </>}
            </>)}
          </>
        )}
        <div style={{ height:30 }} />
      </div>
    </div>
  );
}
