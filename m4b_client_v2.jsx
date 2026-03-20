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
  const [showMatchCelebration, setShowMatchCelebration] = useState(null);
  const chatEndRef = useRef(null);
  const chatFileRef = useRef(null);
  const [chatVpH, setChatVpH] = useState(window.innerHeight);
  const { showToast, ToastEl } = useToast();

  const getCreditsForPlan = (v) => { v=parseFloat(v)||0; if(v>=4480) return 9999; if(v>=3480) return 30; if(v>=2480) return 20; if(v>=1480) return 10; return 10; };
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

  useEffect(() => { if (!chatMatch) return; const vv = window.visualViewport; if (!vv) return; const fn = () => { setChatVpH(vv.height); setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),50); }; vv.addEventListener("resize",fn); return ()=>vv.removeEventListener("resize",fn); }, [chatMatch]);

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
        const existing = matches.find(m => (m.client_a_id===current.id && m.client_b_id===myClient.id)||(m.client_a_id===myClient.id && m.client_b_id===current.id));
        if (existing) {
          const myField = existing.client_a_id===myClient.id ? "client_a_confirmed" : "client_b_confirmed";
          await supabase.from("match4biz").update({[myField]:true, status:"mutual"}).eq("id",existing.id);
          setMatches(prev => prev.map(m => m.id===existing.id ? {...m,[myField]:true,status:"mutual"} : m));
          setShowMatchCelebration(current);
          setTimeout(()=>setShowMatchCelebration(null), 3000);
        } else {
          const newMatch = { client_a_id:myClient.id, client_a_name:myClient.name, client_b_id:current.id, client_b_name:current.name, status:"pending", messages:[], created_by:user?.name||"Cliente", client_a_confirmed:true, client_b_confirmed:false };
          const saved = await supaCreateMatch(newMatch);
          if (saved) { setMatches(prev=>[...prev,saved]); showToast("Match enviado! Aguardando "+current.name); }
        }
      } catch(e) { console.warn("[M4B]",e); }
      if (!isUnlimited) { const nc=credits-10; setCredits(nc); try{localStorage.setItem("uh_m4b_credits_"+myClient.id,String(Math.max(0,nc-getCreditsForPlan(myClient.monthly_value))));}catch{} }
      setCurrentIdx(i=>i+1); setSwipeAnim(null); setDragX(0);
    }, 400);
  };
  const handlePass = () => { if(!current) return; setSwipeAnim("pass"); setTimeout(()=>{setCurrentIdx(i=>i+1);setSwipeAnim(null);setDragX(0);},350); };

  /* ── Touch/Swipe ── */
  const onTouchStart = (e) => setTouchStartX(e.touches[0].clientX);
  const onTouchMove = (e) => { if(touchStartX===null) return; setDragX(e.touches[0].clientX - touchStartX); };
  const onTouchEnd = () => { if(Math.abs(dragX)>80){dragX>0?handleLike():handlePass();}else{setDragX(0);} setTouchStartX(null); };

  /* ── Chat ── */
  const sendChatMsg = async (text, type="text") => {
    if (!chatMatch || (!text?.trim() && type==="text")) return;
    const msg = { from:myClient?.id, fromName:myClient?.name, text:text?.trim()||"", type, ts:new Date().toISOString() };
    const msgs = [...(chatMatch.messages||[]), msg];
    try { await supabase.from("match4biz").update({messages:msgs}).eq("id",chatMatch.id); } catch(e) {}
    setMatches(prev=>prev.map(m=>m.id===chatMatch.id?{...m,messages:msgs}:m));
    setChatMatch(prev=>({...prev,messages:msgs}));
    setChatInput("");
    setTimeout(()=>chatEndRef.current?.scrollIntoView({behavior:"smooth"}),100);
  };
  const handleChatFile = async (e) => {
    const file=e.target.files?.[0]; if(!file||!supabase) return;
    const path=`m4b/${Date.now()}_${file.name}`;
    const{error}=await supabase.storage.from("demand-files").upload(path,file,{upsert:true});
    if(error){showToast("Erro no upload");return;}
    const{data:u}=supabase.storage.from("demand-files").getPublicUrl(path);
    const isImg=/\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
    const isVid=/\.(mp4|mov|webm)$/i.test(file.name);
    sendChatMsg(u.publicUrl, isImg?"image":isVid?"video":"file");
    e.target.value="";
  };
  const handleDealAction = async (action) => {
    if(!chatMatch) return;
    const statusMap={close:"deal_closed",noclose:"deal_rejected",help:"agency_help"};
    const msgMap={close:"🤝 Negócio fechado!",noclose:"❌ Negócio não fechado",help:"🏢 Pediu ajuda da agência"};
    await sendChatMsg(msgMap[action],"system");
    try{await supabase.from("match4biz").update({status:statusMap[action]}).eq("id",chatMatch.id);}catch(e){}
    setMatches(prev=>prev.map(m=>m.id===chatMatch.id?{...m,status:statusMap[action]}:m));
    setChatMatch(prev=>({...prev,status:statusMap[action]}));
    showToast(action==="close"?"Parabéns! 🎉":action==="help"?"Agência notificada":"Status atualizado");
  };
  const getPartner = (m) => { const pid=m.client_a_id===myClient?.id?m.client_b_id:m.client_a_id; const pname=m.client_a_id===myClient?.id?m.client_b_name:m.client_a_name; return{id:pid,name:pname,...(allClients.find(c=>c.id===pid)||{})}; };

  /* ═══ MATCH CELEBRATION ═══ */
  if (showMatchCelebration) {
    const p = showMatchCelebration;
    const col = getColor(p.name);
    return (
      <div style={{position:"fixed",inset:0,zIndex:999,background:"linear-gradient(180deg, #0D0D0D 0%, "+col+"40 50%, #0D0D0D 100%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:"#fff"}}>
        <div style={{display:"flex",alignItems:"center",gap:-20,marginBottom:24}}>
          <div style={{width:90,height:90,borderRadius:28,overflow:"hidden",border:"3px solid #fff",boxShadow:"0 0 30px rgba(255,255,255,0.3)",zIndex:2}}>
            {myClient?.logo_url ? <img src={myClient.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <div style={{width:"100%",height:"100%",background:B.accent,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,fontWeight:900,color:"#0D0D0D"}}>{getInitials(myClient?.name)}</div>}
          </div>
          <div style={{width:90,height:90,borderRadius:28,overflow:"hidden",border:"3px solid #fff",boxShadow:"0 0 30px rgba(255,255,255,0.3)",marginLeft:-20}}>
            {p.logo_url ? <img src={p.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}} /> : <div style={{width:"100%",height:"100%",background:col,display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,fontWeight:900,color:"#fff"}}>{getInitials(p.name)}</div>}
          </div>
        </div>
        <p style={{fontSize:14,fontWeight:600,color:"rgba(255,255,255,0.6)",textTransform:"uppercase",letterSpacing:3,marginBottom:8}}>É um</p>
        <h1 style={{fontSize:48,fontWeight:900,margin:0,background:"linear-gradient(135deg, "+B.accent+", #10B981)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Match!</h1>
        <p style={{fontSize:14,color:"rgba(255,255,255,0.7)",marginTop:12}}>Você e {p.name} podem conversar agora</p>
        <button onClick={()=>{setShowMatchCelebration(null);setTab("matches");}} style={{marginTop:24,padding:"14px 36px",borderRadius:50,background:B.accent,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:15,fontWeight:700,color:"#0D0D0D"}}>Conversar</button>
        <button onClick={()=>setShowMatchCelebration(null)} style={{marginTop:12,padding:"10px 20px",background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,color:"rgba(255,255,255,0.5)"}}>Continuar descobrindo</button>
      </div>
    );
  }

  /* ═══ CHAT VIEW ═══ */
  if (chatMatch) {
    const partner = getPartner(chatMatch);
    const col = getColor(partner.name);
    const msgs = chatMatch.messages || [];
    const isClosed = chatMatch.status==="deal_closed"||chatMatch.status==="deal_rejected";
    return (
      <div style={{position:"fixed",top:0,left:0,right:0,height:chatVpH,display:"flex",flexDirection:"column",background:B.bg,color:B.text,zIndex:50}}>
        {ToastEl}
        <input ref={chatFileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx" style={{display:"none"}} onChange={handleChatFile}/>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid "+B.border,flexShrink:0,background:B.bgCard}}>
          <button onClick={()=>setChatMatch(null)} style={{width:36,height:36,borderRadius:12,border:"1px solid "+B.border,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
          {partner.logo_url ? <img src={partner.logo_url} style={{width:36,height:36,borderRadius:12,objectFit:"cover"}}/> : <div style={{width:36,height:36,borderRadius:12,background:col+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:col,flexShrink:0}}>{getInitials(partner.name)}</div>}
          <div style={{flex:1,minWidth:0}}><p style={{fontSize:14,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{partner.name}</p><p style={{fontSize:10,color:chatMatch.status==="deal_closed"?B.green:chatMatch.status==="agency_help"?"#6366F1":B.muted}}>{chatMatch.status==="deal_closed"?"Negócio fechado ✅":chatMatch.status==="agency_help"?"Agência participando":chatMatch.status==="deal_rejected"?"Não fechou":"Conectado"}</p></div>
        </div>
        {/* Quick actions */}
        {!isClosed&&<div style={{display:"flex",gap:6,padding:"8px 12px",borderBottom:"1px solid "+B.border,overflowX:"auto",scrollbarWidth:"none",flexShrink:0}}>
          <button onClick={()=>handleDealAction("close")} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",borderRadius:20,border:"1.5px solid "+B.green+"40",background:B.green+"08",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:600,color:B.green,whiteSpace:"nowrap",flexShrink:0}}>🤝 Fechar Negócio</button>
          <button onClick={()=>handleDealAction("noclose")} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",borderRadius:20,border:"1.5px solid #EF444440",background:"#EF444408",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:600,color:"#EF4444",whiteSpace:"nowrap",flexShrink:0}}>❌ Não Fechar</button>
          <button onClick={()=>handleDealAction("help")} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",borderRadius:20,border:"1.5px solid #6366F140",background:"#6366F108",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:600,color:"#6366F1",whiteSpace:"nowrap",flexShrink:0}}>🏢 Pedir Ajuda</button>
        </div>}
        {/* Messages */}
        <div style={{flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"12px 16px"}}>
          {msgs.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}><p style={{fontSize:16,fontWeight:800}}>Match! 🎉</p><p style={{fontSize:12,color:B.muted,marginTop:8,lineHeight:1.5}}>Comecem a conversar sobre a parceria.</p></div>}
          {msgs.map((msg,i) => {
            const isMe = msg.from===myClient?.id;
            const isAgency = msg.from==="agency";
            const isSys = msg.type==="system";
            if(isSys) return <div key={i} style={{textAlign:"center",margin:"12px 0"}}><span style={{fontSize:10,color:B.muted,background:B.bg,padding:"4px 12px",borderRadius:20,border:"1px solid "+B.border}}>{msg.text}</span></div>;
            return (<div key={i} style={{marginBottom:8}}>
              {isAgency&&<p style={{fontSize:9,fontWeight:700,color:"#6366F1",marginBottom:2}}>🏢 {msg.by||"Unique Marketing"}</p>}
              <div style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"78%",padding:msg.type==="image"?"4px":"10px 14px",borderRadius:18,background:isAgency?"#6366F112":isMe?B.accent+"18":B.bgCard,border:"1px solid "+(isAgency?"#6366F125":isMe?B.accent+"30":B.border),borderBottomRightRadius:isMe?4:18,borderBottomLeftRadius:isMe?18:4}}>
                  {msg.type==="image"&&<img src={msg.text} style={{maxWidth:"100%",maxHeight:200,borderRadius:14,display:"block"}}/>}
                  {msg.type==="video"&&<video src={msg.text} controls style={{maxWidth:"100%",maxHeight:200,borderRadius:14}}/>}
                  {msg.type==="file"&&<a href={msg.text} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:6,color:B.accent,fontSize:12,fontWeight:600}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Arquivo</a>}
                  {(msg.type==="text"||!msg.type)&&<p style={{fontSize:13,lineHeight:1.5,margin:0,wordBreak:"break-word"}}>{msg.text}</p>}
                  <p style={{fontSize:8,color:B.muted,marginTop:3,textAlign:"right"}}>{new Date(msg.ts).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
                </div>
              </div>
            </div>);
          })}
          <div ref={chatEndRef}/>
        </div>
        {/* Input */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px 12px",borderTop:"1px solid "+B.border,background:B.bgCard,flexShrink:0}}>
          <button onClick={()=>chatFileRef.current?.click()} style={{width:36,height:36,borderRadius:12,border:"1px solid "+B.border,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg></button>
          <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChatMsg(chatInput);}}} placeholder="Mensagem..." className="tinput" style={{flex:1,padding:"10px 14px",fontSize:14}}/>
          <button onClick={()=>sendChatMsg(chatInput)} disabled={!chatInput.trim()} style={{width:36,height:36,borderRadius:12,background:chatInput.trim()?B.accent:B.border,border:"none",cursor:chatInput.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={chatInput.trim()?"#0D0D0D":B.muted} strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
        </div>
      </div>
    );
  }

  /* ═══ PROFILE DETAIL ═══ */
  if (showProfile) {
    const p = showProfile; const col = getColor(p.name);
    return (
      <div className="app" style={{background:B.bg,color:B.text}}>
        <Head title="" onBack={()=>setShowProfile(null)}/>
        <div className="content" style={{padding:0}}>
          {/* Hero image area */}
          <div style={{height:280,background:`linear-gradient(135deg, ${col}40, ${col}15)`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            {p.logo_url ? <img src={p.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <div style={{fontSize:72,fontWeight:900,color:"#fff",textShadow:"0 4px 24px rgba(0,0,0,0.3)"}}>{getInitials(p.name)}</div>}
            <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 40%,rgba(0,0,0,0.7) 100%)"}}/>
            <div style={{position:"absolute",bottom:16,left:16,right:16}}>
              <h2 style={{fontSize:24,fontWeight:900,color:"#fff",margin:0}}>{p.name}</h2>
              {p.contact_name&&<p style={{fontSize:13,color:"rgba(255,255,255,0.8)",marginTop:2}}>{p.contact_name}</p>}
              <p style={{fontSize:12,color:B.accent,fontWeight:700,marginTop:4}}>{p.plan?"Plano "+(p.plan.charAt(0).toUpperCase()+p.plan.slice(1)):"Cliente Unique"} · {getSince(p.start_date)}</p>
            </div>
          </div>
          <div style={{padding:"16px 16px 30px"}}>
            {/* Tags */}
            {p.segment&&<div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}><Tag color={col}>{p.segment}</Tag><Tag color={B.accent}>Ativo</Tag></div>}
            {/* About */}
            {p.notes&&<Card style={{marginBottom:12}}><p style={{fontSize:11,fontWeight:700,color:B.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>Sobre</p><p style={{fontSize:13,lineHeight:1.7}}>{p.notes}</p></Card>}
            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              <div style={{background:B.bgCard,borderRadius:14,border:"1px solid "+B.border,padding:"14px",textAlign:"center"}}><p style={{fontSize:22,fontWeight:900,color:col}}>{p.start_date?new Date().getFullYear()-new Date(p.start_date).getFullYear()||"<1":"?"}</p><p style={{fontSize:10,color:B.muted}}>Anos conosco</p></div>
              <div style={{background:B.bgCard,borderRadius:14,border:"1px solid "+B.border,padding:"14px",textAlign:"center"}}><p style={{fontSize:22,fontWeight:900,color:B.accent}}>{p.plan?.charAt(0).toUpperCase()||"F"}</p><p style={{fontSize:10,color:B.muted}}>Plano</p></div>
            </div>
            {/* Action */}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setShowProfile(null);handlePass();}} style={{flex:1,padding:"16px",borderRadius:50,border:"2px solid #EF444440",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:15,fontWeight:700,color:"#EF4444"}}>✕</button>
              <button onClick={()=>{setShowProfile(null);handleLike();}} style={{flex:2,padding:"16px",borderRadius:50,background:B.accent,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:15,fontWeight:700,color:"#0D0D0D"}}>❤️ Match · 10 créditos</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══ TERMS ═══ */
  if (!accepted) return (
    <div className="app" style={{background:B.bg,color:B.text}}>
      <Head title="Match4Biz" onBack={onBack}/>
      <div className="content" style={{padding:"0 16px"}}>
        <div style={{textAlign:"center",padding:"20px 0 16px"}}><div style={{width:80,height:80,borderRadius:24,background:"linear-gradient(135deg, #BBF246, #8BC34A)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:"0 8px 32px rgba(187,242,70,0.3)"}}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div><h2 style={{fontSize:22,fontWeight:900,marginBottom:4}}>Match4Biz</h2><p style={{fontSize:13,color:B.muted,lineHeight:1.5}}>Conecte-se com outros negócios e crie parcerias estratégicas</p></div>
        <Card style={{marginBottom:12}}><p style={{fontSize:14,fontWeight:700,marginBottom:10}}>Como funciona</p>{[{ic:"🔍",t:"Descubra",d:"Veja perfis de empresas e encontre oportunidades"},{ic:"❤️",t:"Dê Match",d:"Arraste pra direita ou toque no coração"},{ic:"💬",t:"Converse",d:"Se ambos derem match, um chat exclusivo é aberto"},{ic:"🤝",t:"Feche Negócios",d:"Negocie na plataforma com suporte da agência"}].map((s,i)=>(<div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<3?"1px solid "+B.border:"none"}}><span style={{fontSize:20,flexShrink:0}}>{s.ic}</span><div><p style={{fontSize:13,fontWeight:700}}>{s.t}</p><p style={{fontSize:11,color:B.muted,lineHeight:1.4}}>{s.d}</p></div></div>))}</Card>
        <Card style={{marginBottom:12,background:B.accent+"08",border:"1.5px solid "+B.accent+"20"}}><p style={{fontSize:12,fontWeight:700,color:B.accent,marginBottom:6}}>Créditos por Plano</p>{[{p:"Free",c:"10 créditos",m:"1 match grátis"},{p:"R$ 1.480",c:"10 créditos",m:"1 match"},{p:"R$ 2.480",c:"20 créditos",m:"2 matches"},{p:"R$ 3.480",c:"30 créditos",m:"3 matches"},{p:"R$ 4.480",c:"Ilimitado",m:"∞ matches"}].map((p,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<4?"1px solid "+B.border:"none"}}><span style={{fontSize:12,fontWeight:600}}>{p.p}</span><div style={{textAlign:"right"}}><span style={{fontSize:12,fontWeight:700,color:B.accent}}>{p.c}</span><span style={{fontSize:10,color:B.muted,marginLeft:6}}>{p.m}</span></div></div>))}<p style={{fontSize:10,color:B.muted,marginTop:8}}>Extras: R$ 100 por 10 créditos</p></Card>
        <Card style={{marginBottom:16,background:"#F59E0B08",border:"1.5px solid #F59E0B20"}}><p style={{fontSize:12,fontWeight:700,color:"#F59E0B",marginBottom:6}}>Termos de Uso</p><ul style={{fontSize:11,color:B.muted,lineHeight:1.8,paddingLeft:16,margin:0}}><li>Negociação <strong style={{color:B.text}}>inteiramente dentro da plataforma</strong></li><li><strong style={{color:B.text}}>Taxa de 5% a 10%</strong> sobre parceria fechada</li><li>Unique Marketing como facilitadora</li><li>Informações são confidenciais</li></ul></Card>
        <button onClick={doAccept} style={{width:"100%",padding:"16px 0",borderRadius:50,background:B.accent,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:15,fontWeight:700,color:"#0D0D0D",marginBottom:30}}>Aceitar e Começar</button>
      </div>
    </div>
  );

  /* ═══ BUY CREDITS ═══ */
  const BuyModal = showBuy ? (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowBuy(false)}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:430,background:B.bgCard,borderRadius:"24px 24px 0 0",padding:"20px 20px calc(20px + env(safe-area-inset-bottom,0px))"}}>
        <div style={{width:40,height:4,borderRadius:2,background:B.border,margin:"0 auto 16px"}}/>
        <h3 style={{fontSize:18,fontWeight:800,marginBottom:4}}>Comprar Créditos</h3>
        <p style={{fontSize:12,color:B.muted,marginBottom:16}}>10 créditos = 1 match</p>
        {[{n:10,price:"R$ 100",desc:"1 match",pop:false},{n:30,price:"R$ 250",desc:"3 matches · 17% off",pop:true},{n:50,price:"R$ 400",desc:"5 matches · 20% off",pop:false}].map((p,i)=>(
          <button key={i} onClick={()=>{showToast("Redirecionando...");setShowBuy(false);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"14px 16px",borderRadius:14,border:p.pop?"2px solid "+B.accent:"1.5px solid "+B.border,background:p.pop?B.accent+"08":"transparent",cursor:"pointer",fontFamily:"inherit",marginBottom:8,textAlign:"left"}}>
            <div><p style={{fontSize:14,fontWeight:700}}>{p.n} créditos</p><p style={{fontSize:11,color:B.muted}}>{p.desc}</p></div>
            <div style={{textAlign:"right"}}><p style={{fontSize:16,fontWeight:800,color:B.accent}}>{p.price}</p>{p.pop&&<span style={{fontSize:9,fontWeight:700,background:B.accent,color:"#0D0D0D",padding:"2px 8px",borderRadius:6}}>POPULAR</span>}</div>
          </button>
        ))}
      </div>
    </div>
  ) : null;

  /* ═══ MAIN VIEW ═══ */
  const cardRotation = dragX * 0.06;
  const likeOpacity = Math.min(1, Math.max(0, dragX / 100));
  const nopeOpacity = Math.min(1, Math.max(0, -dragX / 100));

  return (
    <div style={{position:"fixed",inset:0,display:"flex",flexDirection:"column",background:"#0F0F0F",color:"#fff"}}>
      {ToastEl}
      {BuyModal}
      {/* Top bar */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",flexShrink:0,zIndex:10}}>
        <button onClick={onBack} style={{width:36,height:36,borderRadius:12,border:"1px solid rgba(255,255,255,0.15)",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <p style={{fontSize:16,fontWeight:800}}>Match4Biz</p>
        <button onClick={()=>setShowBuy(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 14px",borderRadius:50,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",cursor:"pointer",fontFamily:"inherit"}}><svg width="12" height="12" viewBox="0 0 24 24" fill="#BBF246" stroke="#BBF246" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg><span style={{fontSize:12,fontWeight:700,color:"#BBF246"}}>{isUnlimited?"∞":credits}</span></button>
      </div>

      {/* Tab toggle */}
      <div style={{display:"flex",gap:4,padding:"0 16px 10px",flexShrink:0}}>
        <button onClick={()=>setTab("discover")} style={{flex:1,padding:"8px",borderRadius:50,border:"none",background:tab==="discover"?B.accent:"rgba(255,255,255,0.08)",color:tab==="discover"?"#0D0D0D":"rgba(255,255,255,0.5)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Descobrir</button>
        <button onClick={()=>setTab("matches")} style={{flex:1,padding:"8px",borderRadius:50,border:"none",background:tab==="matches"?"#fff":"rgba(255,255,255,0.08)",color:tab==="matches"?"#0D0D0D":"rgba(255,255,255,0.5)",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Conexões{mutualMatches.length>0?" ("+mutualMatches.length+")":""}</button>
      </div>

      {loading ? (
        <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:40,height:40,border:"3px solid rgba(255,255,255,0.1)",borderTopColor:B.accent,borderRadius:"50%",animation:"spin .8s linear infinite"}}/></div>
      ) : tab === "discover" ? (
        <div style={{flex:1,display:"flex",flexDirection:"column",padding:"0 14px",minHeight:0}}>
          {available.length > 0 && current ? (<>
            {/* ── THE CARD ── */}
            <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
              style={{flex:1,borderRadius:20,overflow:"hidden",position:"relative",
                transform:`translateX(${swipeAnim==="like"?350:swipeAnim==="pass"?-350:dragX}px) rotate(${swipeAnim==="like"?20:swipeAnim==="pass"?-20:cardRotation}deg)`,
                opacity:swipeAnim?0:1, transition:swipeAnim||!dragX?"all .45s cubic-bezier(0.34,1.56,0.64,1)":"none",
                background:"#1A1A1A", border:"1px solid rgba(255,255,255,0.08)"}}>

              {/* Background: logo or gradient */}
              {current.logo_url ? (
                <img src={current.logo_url} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
              ) : (
                <div style={{position:"absolute",inset:0,background:`linear-gradient(135deg, ${getColor(current.name)}60, ${getColor(current.name)}20, #1A1A1A)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <span style={{fontSize:120,fontWeight:900,color:"rgba(255,255,255,0.08)"}}>{getInitials(current.name)}</span>
                </div>
              )}

              {/* Gradient overlay */}
              <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.85) 100%)"}}/>

              {/* LIKE stamp */}
              {(likeOpacity > 0.15 || swipeAnim==="like") && <div style={{position:"absolute",top:40,left:20,zIndex:5,padding:"8px 24px",border:"4px solid #BBF246",borderRadius:12,transform:"rotate(-15deg)",opacity:swipeAnim==="like"?1:likeOpacity}}><span style={{fontSize:32,fontWeight:900,color:"#BBF246",letterSpacing:4}}>MATCH</span></div>}

              {/* NOPE stamp */}
              {(nopeOpacity > 0.15 || swipeAnim==="pass") && <div style={{position:"absolute",top:40,right:20,zIndex:5,padding:"8px 24px",border:"4px solid #EF4444",borderRadius:12,transform:"rotate(15deg)",opacity:swipeAnim==="pass"?1:nopeOpacity}}><span style={{fontSize:32,fontWeight:900,color:"#EF4444",letterSpacing:4}}>NOPE</span></div>}

              {/* Credits lock */}
              {!isUnlimited && credits<10 && <div style={{position:"absolute",inset:0,zIndex:8,background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:20}}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                <p style={{fontSize:18,fontWeight:800,color:"#fff",marginTop:12}}>Créditos esgotados</p>
                <p style={{fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:4}}>Compre créditos para continuar</p>
                <button onClick={()=>setShowBuy(true)} style={{marginTop:16,padding:"12px 32px",borderRadius:50,background:B.accent,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,color:"#0D0D0D"}}>Comprar créditos</button>
              </div>}

              {/* Bottom info overlay */}
              <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 18px",zIndex:3}}>
                <h2 style={{fontSize:26,fontWeight:900,color:"#fff",margin:0,textShadow:"0 2px 8px rgba(0,0,0,0.5)"}}>{current.name}</h2>
                {current.contact_name && <p style={{fontSize:13,color:"rgba(255,255,255,0.8)",marginTop:2}}>{current.contact_name}</p>}
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:6}}>
                  <span style={{fontSize:11,color:B.accent,fontWeight:700}}>{current.plan?"Plano "+(current.plan.charAt(0).toUpperCase()+current.plan.slice(1)):"Cliente Unique"}</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>·</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{getSince(current.start_date)}</span>
                  {current.segment && <><span style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>·</span><span style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>{current.segment}</span></>}
                </div>
                {current.notes && <p style={{fontSize:12,color:"rgba(255,255,255,0.6)",marginTop:8,lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{current.notes}</p>}
              </div>

              {/* Tap to view full profile */}
              <button onClick={()=>setShowProfile(current)} style={{position:"absolute",top:12,right:12,zIndex:4,width:36,height:36,borderRadius:12,background:"rgba(255,255,255,0.15)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(8px)"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg></button>
            </div>
            {/* Action buttons */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:20,padding:"14px 0 8px",flexShrink:0}}>
              <button onClick={handlePass} style={{width:56,height:56,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"2px solid rgba(239,68,68,0.4)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"transform .15s"}} onTouchStart={e=>e.currentTarget.style.transform="scale(0.88)"} onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
              <button onClick={()=>setShowProfile(current)} style={{width:44,height:44,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"2px solid rgba(99,102,241,0.4)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </button>
              <button onClick={handleLike} style={{width:64,height:64,borderRadius:"50%",background:"linear-gradient(135deg, #BBF246, #8BC34A)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 24px rgba(187,242,70,0.4)",transition:"transform .15s"}} onTouchStart={e=>e.currentTarget.style.transform="scale(0.88)"} onTouchEnd={e=>e.currentTarget.style.transform="scale(1)"}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#0D0D0D" stroke="#0D0D0D" strokeWidth="1"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              </button>
            </div>
            <p style={{textAlign:"center",fontSize:10,color:"rgba(255,255,255,0.3)",paddingBottom:6}}>{available.length} empresa{available.length>1?"s":""} · {isUnlimited?"Ilimitado":credits+" créditos"}</p>
          </>) : (
            /* Empty state */
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 20px"}}>
              <div style={{width:80,height:80,borderRadius:24,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20}}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></div>
              <p style={{fontSize:18,fontWeight:800,color:"#fff"}}>{allClients.length===0?"Nenhuma empresa":"Tudo visto!"}</p>
              <p style={{fontSize:13,color:"rgba(255,255,255,0.4)",marginTop:8,textAlign:"center",lineHeight:1.5}}>{allClients.length===0?"Novas empresas aparecerão em breve.":"Confira suas conexões ou volte mais tarde!"}</p>
            </div>
          )}
        </div>
      ) : (
        /* ═══ CONNECTIONS TAB ═══ */
        <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"0 14px"}}>
          {matches.length === 0 ? (
            <div style={{textAlign:"center",padding:"50px 20px"}}><p style={{fontSize:16,fontWeight:700,color:"#fff"}}>Nenhuma conexão</p><p style={{fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:6}}>Dê match pra começar!</p></div>
          ) : (<>
            {mutualMatches.length > 0 && <>
              <p style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Chat disponível</p>
              {mutualMatches.map(m => {
                const p = getPartner(m);
                const col = getColor(p.name);
                const last = (m.messages||[]).filter(x=>x.type!=="system").slice(-1)[0];
                return (
                  <div key={m.id} onClick={()=>setChatMatch(m)} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:16,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.06)",marginBottom:8,cursor:"pointer"}}>
                    {p.logo_url ? <img src={p.logo_url} style={{width:48,height:48,borderRadius:14,objectFit:"cover"}}/> : <div style={{width:48,height:48,borderRadius:14,background:col+"25",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:col,flexShrink:0}}>{getInitials(p.name)}</div>}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><p style={{fontSize:14,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</p><span style={{fontSize:9,fontWeight:700,color:m.status==="deal_closed"?"#10B981":m.status==="agency_help"?"#6366F1":B.accent,flexShrink:0}}>{m.status==="deal_closed"?"✅":m.status==="agency_help"?"🏢":"●"}</span></div>
                      <p style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?(last.from===myClient?.id?"Você: ":"")+last.text.substring(0,40):"Toque para conversar"}</p>
                    </div>
                  </div>
                );
              })}
            </>}
            {matches.filter(m=>!m.client_a_confirmed||!m.client_b_confirmed).length>0 && <>
              <p style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.3)",textTransform:"uppercase",letterSpacing:1,marginBottom:8,marginTop:mutualMatches.length>0?16:0}}>Aguardando match</p>
              {matches.filter(m=>!m.client_a_confirmed||!m.client_b_confirmed).map(m => {
                const p = getPartner(m);
                return (
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:16,background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.04)",marginBottom:8,opacity:0.6}}>
                    <Av name={p.name} sz={44} fs={15}/>
                    <div><p style={{fontSize:13,fontWeight:600,color:"#fff"}}>{p.name}</p><p style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>Aguardando resposta...</p></div>
                  </div>
                );
              })}
            </>}
          </>)}
        </div>
      )}
      <div style={{height:"env(safe-area-inset-bottom,0px)",flexShrink:0}}/>
    </div>
  );
}
