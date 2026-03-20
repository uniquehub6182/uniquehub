function Match4BizPage({ onBack, clients, user }) {
  const isM4bDesktop = useIsDesktop();
  const [view, setView] = useState("list");
  const [selMatch, setSelMatch] = useState(null);
  const [msgInput, setMsgInput] = useState("");
  const [filter, setFilter] = useState("all");
  const { showToast, ToastEl } = useToast();
  const CDATA = clients || [];

  const [matches, setMatches] = useState([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  useEffect(() => { if (!matchesLoaded) { supaLoadMatches().then(d => { setMatches(d||[]); setMatchesLoaded(true); }); } }, [matchesLoaded]);

  /* ── Unified status config ── */
  const ST = {
    pending:  { l:"Aguardando Match", c:"#F59E0B", ic:"⏳" },
    mutual:   { l:"Match Mútuo", c:"#10B981", ic:"🤝" },
    deal_closed:  { l:"Negócio Fechado", c:"#10B981", ic:"✅" },
    deal_rejected:{ l:"Não Fechou", c:"#EF4444", ic:"❌" },
    agency_help:  { l:"Ajuda Solicitada", c:"#6366F1", ic:"🏢" },
  };
  const getSt = (s) => ST[s] || ST.pending;

  /* ── Stats ── */
  const total = matches.length;
  const mutual = matches.filter(m => m.status === "mutual" || m.status === "agency_help").length;
  const closed = matches.filter(m => m.status === "deal_closed").length;
  const needsHelp = matches.filter(m => m.status === "agency_help").length;
  const pending = matches.filter(m => m.status === "pending").length;
  const filtered = filter === "all" ? matches : matches.filter(m => m.status === filter);

  /* ── Helpers ── */
  const getClient = (id, name) => { const c = CDATA.find(x=>(x.supaId||x.id)===id)||CDATA.find(x=>x.name===name); return { name:c?.name||name||"?", logo:c?.photo||c?.avatar||c?.logo||c?.logo_url||null, segment:c?.segment||"", plan:c?.plan||"" }; };
  const getPartnerNames = (m) => ({ a: getClient(m.client_a_id, m.client_a_name), b: getClient(m.client_b_id, m.client_b_name) });
  const lastMsg = (m) => { const msgs = m.messages||[]; return msgs.length > 0 ? msgs[msgs.length-1] : null; };
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) : "";

  /* ── Send agency message (visible to clients) ── */
  const sendMsg = () => {
    if (!msgInput.trim() || !selMatch) return;
    const msg = { from:"agency", fromName:"Unique Marketing", text:msgInput.trim(), type:"text", ts:new Date().toISOString(), by:user?.name||"Admin" };
    const msgs = [...(selMatch.messages||[]), msg];
    setMatches(prev => prev.map(x => x.id === selMatch.id ? {...x, messages:msgs} : x));
    setSelMatch(prev => ({...prev, messages:msgs}));
    supaUpdateMatch(selMatch.id, { messages: msgs });
    setMsgInput("");
  };

  /* ── Update status ── */
  const updateStatus = (id, newStatus) => {
    setMatches(prev => prev.map(m => m.id === id ? {...m, status:newStatus} : m));
    if (selMatch?.id === id) setSelMatch(prev => ({...prev, status:newStatus}));
    supaUpdateMatch(id, { status: newStatus });
    showToast("Status atualizado ✓");
  };

  /* ── Delete match ── */
  const deleteMatch = async (id) => {
    if (!confirm("Excluir este match?")) return;
    await supaDeleteMatch(id);
    setMatches(prev => prev.filter(m => m.id !== id));
    if (selMatch?.id === id) { setSelMatch(null); setView("list"); }
    showToast("Match excluído ✓");
  };

  /* ═══ MATCH DETAIL VIEW (mobile) ═══ */
  if (selMatch && !isM4bDesktop) {
    const m = matches.find(x=>x.id===selMatch.id)||selMatch;
    const p = getPartnerNames(m);
    const st = getSt(m.status);
    const msgs = m.messages || [];
    return (
      <div className="app" style={{background:B.bg,color:B.text}}>
        {ToastEl}
        <Head title="" onBack={()=>{setSelMatch(null);setView("list");}} right={
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <Av name={p.a.name} sz={24} fs={9}/><span style={{fontSize:10,color:B.muted}}>×</span><Av name={p.b.name} sz={24} fs={9}/>
          </div>
        }/>
        {/* Status bar */}
        <div style={{padding:"8px 16px",background:st.c+"08",borderBottom:"1px solid "+st.c+"20",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><span style={{fontSize:11,fontWeight:700,color:st.c}}>{st.ic} {st.l}</span></div>
          <select value={m.status} onChange={e=>updateStatus(m.id,e.target.value)} style={{fontSize:11,padding:"4px 8px",borderRadius:8,border:"1px solid "+B.border,background:B.bgCard,color:B.text,fontFamily:"inherit",cursor:"pointer"}}>
            {Object.entries(ST).map(([k,v])=><option key={k} value={k}>{v.ic} {v.l}</option>)}
          </select>
        </div>
        {/* Participants */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 16px",borderBottom:"1px solid "+B.border}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
            <Av name={p.a.name} src={p.a.logo} sz={36} fs={13}/>
            <div><p style={{fontSize:12,fontWeight:700}}>{p.a.name}</p><p style={{fontSize:9,color:B.muted}}>{m.client_a_confirmed?"✓ Deu match":"Pendente"}</p></div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end"}}>
            <div style={{textAlign:"right"}}><p style={{fontSize:12,fontWeight:700}}>{p.b.name}</p><p style={{fontSize:9,color:B.muted}}>{m.client_b_confirmed?"✓ Deu match":"Pendente"}</p></div>
            <Av name={p.b.name} src={p.b.logo} sz={36} fs={13}/>
          </div>
        </div>
        {/* Messages */}
        <div className="content" style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
          {msgs.length === 0 && <p style={{textAlign:"center",color:B.muted,fontSize:12,padding:20}}>Nenhuma mensagem ainda</p>}
          {msgs.map((msg,i) => {
            const isAgency = msg.from === "agency";
            const isSys = msg.type === "system";
            const senderName = isAgency ? (msg.by||"Agência") : msg.fromName || "Cliente";
            if (isSys) return <div key={i} style={{textAlign:"center",margin:"10px 0"}}><span style={{fontSize:10,color:B.muted,background:B.bg,padding:"3px 12px",borderRadius:20,border:"1px solid "+B.border}}>{msg.text}</span></div>;
            return (
              <div key={i} style={{marginBottom:8}}>
                <p style={{fontSize:9,color:isAgency?"#6366F1":B.muted,fontWeight:600,marginBottom:2,textAlign:isAgency?"right":"left"}}>{senderName}</p>
                <div style={{display:"flex",justifyContent:isAgency?"flex-end":"flex-start"}}>
                  <div style={{maxWidth:"80%",padding:"10px 14px",borderRadius:14,background:isAgency?"#6366F115":B.bgCard,border:"1px solid "+(isAgency?"#6366F130":B.border)}}>
                    {msg.type==="image"?<img src={msg.text} alt="" style={{maxWidth:"100%",maxHeight:180,borderRadius:10}}/>:null}
                    {(msg.type==="text"||!msg.type)&&<p style={{fontSize:13,lineHeight:1.5,margin:0,wordBreak:"break-word"}}>{msg.text}</p>}
                    <p style={{fontSize:8,color:B.muted,marginTop:3,textAlign:"right"}}>{new Date(msg.ts).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Agency input */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 16px",borderTop:"1px solid "+B.border,background:B.bgCard}}>
          <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();sendMsg();}}} placeholder="Mensagem como agência..." className="tinput" style={{flex:1,padding:"10px 14px",fontSize:14}} />
          <button onClick={sendMsg} disabled={!msgInput.trim()} style={{width:38,height:38,borderRadius:12,background:msgInput.trim()?"#6366F1":B.border,border:"none",cursor:msgInput.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={msgInput.trim()?"#fff":B.muted} strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        {/* Actions */}
        <div style={{display:"flex",gap:6,padding:"8px 16px 16px",background:B.bgCard,borderTop:"1px solid "+B.border}}>
          <button onClick={()=>deleteMatch(m.id)} style={{flex:1,padding:"10px",borderRadius:10,border:"1.5px solid "+(B.red||"#EF4444")+"30",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:600,color:B.red||"#EF4444"}}>Excluir</button>
        </div>
      </div>
    );
  }

  /* ═══ DESKTOP TWO-PANEL LAYOUT ═══ */
  if (isM4bDesktop) {
    const m = selMatch ? (matches.find(x=>x.id===selMatch.id)||selMatch) : null;
    const mSt = m ? getSt(m.status) : null;
    const mP = m ? getPartnerNames(m) : null;
    const mMsgs = m ? (m.messages||[]) : [];

    return (
      <div className="content-wide" style={{paddingTop:TOP,minHeight:"100%",display:"flex",flexDirection:"column"}}>
        {ToastEl}
        <CollapseHeader icon={IC.match4biz} label="Parcerias" title="Match4Biz" onBack={onBack} collapsed={false} />

        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginTop:12,marginBottom:16}}>
          {[
            {l:"Total",v:total,c:B.accent,bg:B.accent+"10"},
            {l:"Matches Mútuos",v:mutual,c:"#10B981",bg:"#10B98110"},
            {l:"Fechados",v:closed,c:"#10B981",bg:"#10B98110"},
            {l:"Pendentes",v:pending,c:"#F59E0B",bg:"#F59E0B10"},
            {l:"Pedem Ajuda",v:needsHelp,c:"#6366F1",bg:"#6366F110"},
          ].map((s,i) => (
            <div key={i} style={{background:B.bgCard,borderRadius:16,border:"1px solid "+B.border,padding:"14px 16px",textAlign:"center"}}>
              <p style={{fontSize:9,fontWeight:600,color:B.muted,textTransform:"uppercase",letterSpacing:0.8}}>{s.l}</p>
              <p style={{fontSize:28,fontWeight:900,color:s.c,marginTop:4}}>{s.v}</p>
            </div>
          ))}
        </div>
        {/* Two panels */}
        <div style={{display:"flex",gap:14,flex:1,minHeight:0,height:"calc(100vh - 280px)"}}>
          {/* LEFT: Match list */}
          <div style={{width:360,flexShrink:0,background:B.bgCard,borderRadius:20,border:"1px solid "+B.border,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {/* Filter tabs */}
            <div style={{display:"flex",gap:4,padding:"12px 12px 8px",overflowX:"auto",scrollbarWidth:"none",flexShrink:0}}>
              {[{k:"all",l:"Todos ("+total+")"},{k:"agency_help",l:"🏢 Ajuda ("+needsHelp+")"},{k:"mutual",l:"🤝 Mútuos"},{k:"pending",l:"⏳ Pendentes"},{k:"deal_closed",l:"✅ Fechados"},{k:"deal_rejected",l:"❌ Não fechou"}].map(f=>(
                <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:"6px 12px",borderRadius:8,border:filter===f.k?"none":"1px solid "+B.border,background:filter===f.k?B.accent:"transparent",color:filter===f.k?"#0D0D0D":B.muted,fontSize:10,fontWeight:filter===f.k?700:500,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>{f.l}</button>
              ))}
            </div>
            {/* List */}
            <div style={{flex:1,overflowY:"auto",padding:"0 8px 8px"}}>
              {filtered.length === 0 && <p style={{textAlign:"center",color:B.muted,fontSize:12,padding:30}}>Nenhum match neste filtro</p>}
              {filtered.map(match => {
                const p = getPartnerNames(match);
                const st = getSt(match.status);
                const last = lastMsg(match);
                const isSel = selMatch?.id === match.id;
                return (
                  <div key={match.id} onClick={()=>setSelMatch(match)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:14,cursor:"pointer",background:isSel?B.accent+"10":"transparent",border:isSel?"1.5px solid "+B.accent+"30":"1.5px solid transparent",marginBottom:4,transition:"all .12s"}}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=B.accent+"06";}} onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent";}}>
                    <div style={{position:"relative",flexShrink:0}}>
                      <Av name={p.a.name} src={p.a.logo} sz={38} fs={13}/>
                      <div style={{position:"absolute",bottom:-2,right:-8}}><Av name={p.b.name} src={p.b.logo} sz={22} fs={8}/></div>
                    </div>
                    <div style={{flex:1,minWidth:0,marginLeft:6}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <p style={{fontSize:12,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:140}}>{p.a.name} × {p.b.name}</p>
                        <span style={{fontSize:8,color:st.c,fontWeight:700,flexShrink:0}}>{st.ic}</span>
                      </div>
                      <p style={{fontSize:10,color:B.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginTop:1}}>{last?((last.from==="agency"?"Agência: ":"")+last.text.substring(0,40)):"Sem mensagens"}</p>
                    </div>
                    {match.status==="agency_help"&&<div style={{width:8,height:8,borderRadius:4,background:"#6366F1",flexShrink:0}}/>}
                  </div>
                );
              })}
            </div>
          </div>
          {/* RIGHT: Detail panel */}
          <div style={{flex:1,background:B.bgCard,borderRadius:20,border:"1px solid "+B.border,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            {!m ? (
              <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
                <div style={{width:64,height:64,borderRadius:20,background:B.accent+"10",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div>
                <p style={{fontSize:15,fontWeight:700}}>Selecione um match</p>
                <p style={{fontSize:12,color:B.muted}}>Clique em uma conexão para ver detalhes e conversa</p>
              </div>
            ) : (<>
              {/* Header with participants & status */}
              <div style={{padding:"14px 20px",borderBottom:"1px solid "+B.border,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{display:"flex",alignItems:"center"}}>
                    <Av name={mP.a.name} src={mP.a.logo} sz={36} fs={13}/>
                    <div style={{marginLeft:-8}}><Av name={mP.b.name} src={mP.b.logo} sz={36} fs={13}/></div>
                  </div>
                  <div>
                    <p style={{fontSize:14,fontWeight:800}}>{mP.a.name} × {mP.b.name}</p>
                    <div style={{display:"flex",gap:6,marginTop:2}}>
                      <span style={{fontSize:9,color:m.client_a_confirmed?B.green:B.muted}}>{m.client_a_confirmed?"✓ "+mP.a.name:"⏳ "+mP.a.name}</span>
                      <span style={{fontSize:9,color:m.client_b_confirmed?B.green:B.muted}}>{m.client_b_confirmed?"✓ "+mP.b.name:"⏳ "+mP.b.name}</span>
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <select value={m.status} onChange={e=>updateStatus(m.id,e.target.value)} style={{fontSize:11,padding:"6px 10px",borderRadius:10,border:"1px solid "+mSt.c+"40",background:mSt.c+"08",color:mSt.c,fontFamily:"inherit",fontWeight:600,cursor:"pointer"}}>
                    {Object.entries(ST).map(([k,v])=><option key={k} value={k}>{v.ic} {v.l}</option>)}
                  </select>
                  <button onClick={()=>deleteMatch(m.id)} style={{width:32,height:32,borderRadius:8,border:"1px solid "+(B.red||"#EF4444")+"30",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.red||"#EF4444"} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
              </div>
              {/* Messages area */}
              <div style={{flex:1,overflowY:"auto",padding:"16px 20px",minHeight:0}}>
                {mMsgs.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}><p style={{fontSize:13,color:B.muted}}>Nenhuma mensagem entre os clientes ainda.</p><p style={{fontSize:11,color:B.muted,marginTop:4}}>Quando os clientes conversarem, as mensagens aparecerão aqui.</p></div>}
                {mMsgs.map((msg,i) => {
                  const isAgency = msg.from === "agency";
                  const isSys = msg.type === "system";
                  const senderName = isAgency ? "🏢 "+(msg.by||"Agência") : (msg.fromName||"Cliente");
                  if (isSys) return <div key={i} style={{textAlign:"center",margin:"10px 0"}}><span style={{fontSize:10,color:B.muted,background:B.bg,padding:"3px 12px",borderRadius:20,border:"1px solid "+B.border}}>{msg.text}</span></div>;
                  return (
                    <div key={i} style={{marginBottom:10}}>
                      <p style={{fontSize:9,fontWeight:700,color:isAgency?"#6366F1":B.muted,marginBottom:2}}>{senderName}</p>
                      <div style={{maxWidth:"85%",padding:"10px 14px",borderRadius:14,background:isAgency?"#6366F110":B.bg,border:"1px solid "+(isAgency?"#6366F125":B.border)}}>
                        {msg.type==="image"?<img src={msg.text} alt="" style={{maxWidth:"100%",maxHeight:180,borderRadius:10}}/>:null}
                        {(msg.type==="text"||!msg.type)&&<p style={{fontSize:13,lineHeight:1.5,margin:0}}>{msg.text}</p>}
                        <p style={{fontSize:8,color:B.muted,marginTop:3}}>{new Date(msg.ts).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Agency input */}
              <div style={{display:"flex",alignItems:"center",gap:8,padding:"12px 20px",borderTop:"1px solid "+B.border,flexShrink:0}}>
                <input value={msgInput} onChange={e=>setMsgInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();sendMsg();}}} placeholder="Intervir na conversa como agência..." className="tinput" style={{flex:1,padding:"10px 14px",fontSize:13}} />
                <button onClick={sendMsg} disabled={!msgInput.trim()} style={{padding:"10px 20px",borderRadius:12,background:msgInput.trim()?"#6366F1":B.border,border:"none",cursor:msgInput.trim()?"pointer":"default",fontFamily:"inherit",fontSize:12,fontWeight:700,color:msgInput.trim()?"#fff":B.muted}}>Enviar</button>
              </div>
            </>)}
          </div>
        </div>
      </div>
    );
  }

  /* ═══ MOBILE LIST VIEW ═══ */
  return (
    <div className="app" style={{background:B.bg,color:B.text}}>
      {ToastEl}
      <Head title="Match4Biz" onBack={onBack} />
      <div className="content" style={{padding:"0 16px"}}>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
          {[{l:"Total",v:total,c:B.accent},{l:"Mútuos",v:mutual,c:"#10B981"},{l:"Ajuda",v:needsHelp,c:"#6366F1"}].map((s,i)=>(
            <div key={i} style={{background:B.bgCard,borderRadius:14,border:"1px solid "+B.border,padding:"12px",textAlign:"center"}}>
              <p style={{fontSize:8,color:B.muted,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{s.l}</p>
              <p style={{fontSize:24,fontWeight:900,color:s.c}}>{s.v}</p>
            </div>
          ))}
        </div>
        {/* Filters */}
        <div style={{display:"flex",gap:4,marginBottom:12,overflowX:"auto",scrollbarWidth:"none"}}>
          {[{k:"all",l:"Todos"},{k:"agency_help",l:"🏢 Ajuda"},{k:"mutual",l:"🤝 Mútuos"},{k:"pending",l:"⏳ Pendentes"},{k:"deal_closed",l:"✅ Fechados"}].map(f=>(
            <button key={f.k} onClick={()=>setFilter(f.k)} className={`htab${filter===f.k?" a":""}`} style={{fontSize:10,whiteSpace:"nowrap",flexShrink:0}}>{f.l}</button>
          ))}
        </div>
        {/* Match list */}
        {filtered.length === 0 && <Card style={{textAlign:"center",padding:24}}><p style={{fontSize:13,fontWeight:600}}>Nenhum match encontrado</p><p style={{fontSize:11,color:B.muted,marginTop:4}}>Os matches dos clientes aparecerão aqui automaticamente.</p></Card>}
        {filtered.map((match,i) => {
          const p = getPartnerNames(match);
          const st = getSt(match.status);
          const last = lastMsg(match);
          return (
            <Card key={match.id} style={{marginBottom:8,cursor:"pointer"}} onClick={()=>{setSelMatch(match);setView("detail");}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{position:"relative",flexShrink:0}}>
                  <Av name={p.a.name} src={p.a.logo} sz={40} fs={14}/>
                  <div style={{position:"absolute",bottom:-2,right:-10}}><Av name={p.b.name} src={p.b.logo} sz={24} fs={9}/></div>
                </div>
                <div style={{flex:1,minWidth:0,marginLeft:6}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <p style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.a.name} × {p.b.name}</p>
                  </div>
                  <p style={{fontSize:10,color:B.muted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?last.text.substring(0,50):"Sem mensagens"}</p>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <span style={{fontSize:9,fontWeight:700,color:st.c,background:st.c+"12",padding:"3px 8px",borderRadius:6}}>{st.ic} {st.l}</span>
                  <p style={{fontSize:8,color:B.muted,marginTop:4}}>{fmtDate(match.created_at)}</p>
                </div>
              </div>
            </Card>
          );
        })}
        <div style={{height:30}}/>
      </div>
    </div>
  );
}
