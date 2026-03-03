/* ═══════════════════════ CHAT PAGE (Real-time Supabase) ═══════════════════════ */
function ChatPage({ user }) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [view, setView] = useState("list");
  const [convs, setConvs] = useState([]);
  const [selConv, setSelConv] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const msgEndRef = useRef(null);
  const fileRef = useRef(null);
  const { showToast, ToastEl } = useToast();

  /* Load conversations + profiles on mount */
  useEffect(() => {
    if (!user?.id || !supabase) return;
    const load = async () => {
      setLoading(true);
      const c = await supaLoadConversations(user.id);
      setConvs(c);
      const { data: profs } = await supabase.from("profiles").select("id, name, email, role");
      setAllProfiles((profs || []).filter(p => p.id !== user.id));
      setLoading(false);
    };
    load();
  }, [user?.id]);

  /* Load messages + subscribe when conversation selected */
  useEffect(() => {
    if (!selConv?.id || !supabase) return;
    let channel;
    const load = async () => {
      const m = await supaLoadMessages(selConv.id, 100);
      setMsgs(m);
      supaMarkRead(selConv.id, user.id);
      channel = supabase.channel(`msgs-${selConv.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${selConv.id}` }, (payload) => {
        const newMsg = payload.new;
        setMsgs(prev => {
          if (prev.find(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        supaMarkRead(selConv.id, user.id);
        /* Refresh sender profile inline */
        if (!newMsg.profiles) {
          supabase.from("profiles").select("name, email").eq("id", newMsg.sender_id).single().then(({ data }) => {
            if (data) setMsgs(prev => prev.map(m => m.id === newMsg.id ? { ...m, profiles: data } : m));
          });
        }
      }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${selConv.id}` }, (payload) => {
        setMsgs(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
      }).subscribe();
    };
    load();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [selConv?.id]);

  /* Auto-scroll */
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  /* Realtime subscription for conversation list updates */
  useEffect(() => {
    if (!supabase || !user?.id) return;
    const channel = supabase.channel("chat-list").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
      supaLoadConversations(user.id).then(c => setConvs(c));
    }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [user?.id]);

  const getOtherName = (conv) => {
    if (conv.type === "group") return conv.name || "Grupo";
    const other = (conv.members || []).find(m => m.id !== user.id);
    return other?.name || "Conversa";
  };

  const fmtTime = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const fmtDate = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Hoje";
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Ontem";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const sendMsg = async () => {
    if (!input.trim() || !selConv) return;
    await supaSendMessage(selConv.id, user.id, input.trim());
    setInput("");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selConv) return;
    showToast("Enviando arquivo...");
    const result = await supaUploadChatFile(file);
    if (result) {
      await supaSendMessage(selConv.id, user.id, "", result.url, result.name, result.type);
      showToast("Arquivo enviado ✓");
    } else { showToast("Erro ao enviar arquivo"); }
    setShowAttach(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const togglePin = async (msg) => {
    await supaTogglePin(msg.id, msg.pinned);
    setMsgs(prev => prev.map(m => m.id === msg.id ? { ...m, pinned: !m.pinned } : m));
    showToast(msg.pinned ? "Mensagem desafixada" : "Mensagem fixada ✓");
  };

  const startDM = async (profileId) => {
    const convId = await supaFindOrCreateDM(user.id, profileId);
    if (convId) {
      const refreshed = await supaLoadConversations(user.id);
      setConvs(refreshed);
      const found = refreshed.find(c => c.id === convId);
      if (found) { setSelConv(found); setView("chat"); }
    }
    setShowNewChat(false);
  };

  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length < 1) return showToast("Nome e pelo menos 1 membro");
    const convId = await supaCreateGroup(groupName.trim(), user.id, groupMembers);
    if (convId) {
      const refreshed = await supaLoadConversations(user.id);
      setConvs(refreshed);
      const found = refreshed.find(c => c.id === convId);
      if (found) { setSelConv(found); setView("chat"); }
      showToast("Grupo criado ✓");
    }
    setShowNewGroup(false); setGroupName(""); setGroupMembers([]);
  };

  const pinnedMsgs = msgs.filter(m => m.pinned);

  /* ── TERMS ── */
  if (!termsAccepted) return (
    <div className="pg" style={{ paddingTop: TOP, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"80vh" }}>
      <div style={{ width:70, height:70, borderRadius:20, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
        <span style={{ color:B.accent }}>{IC.shield}</span>
      </div>
      <h2 style={{ fontSize:20, fontWeight:800, textAlign:"center" }}>Termos de Uso do Chat</h2>
      <p style={{ fontSize:13, color:B.muted, textAlign:"center", marginTop:10, lineHeight:1.7 }}>Para utilizar o chat interno da UniqueHub, você precisa aceitar nossos termos de uso.</p>
      <Card style={{ marginTop:16, width:"100%" }}>
        <div style={{ maxHeight:200, overflowY:"auto", fontSize:12, lineHeight:1.7, color:B.muted }}>
          <p style={{ fontWeight:700, color:B.text, marginBottom:6 }}>Termos de Uso — Chat UniqueHub Agency</p>
          <p>1. <b>Confidencialidade:</b> Todas as conversas são confidenciais e de uso exclusivo profissional.</p>
          <p style={{ marginTop:6 }}>2. <b>Conduta profissional:</b> O chat deve ser utilizado exclusivamente para assuntos de trabalho.</p>
          <p style={{ marginTop:6 }}>3. <b>Arquivos e dados:</b> Arquivos compartilhados pelo chat são de propriedade da empresa e dos clientes.</p>
          <p style={{ marginTop:6 }}>4. <b>Comunicação com clientes:</b> Mantenha o tom profissional alinhado com a identidade da Unique Marketing 360.</p>
          <p style={{ marginTop:6 }}>5. <b>Armazenamento:</b> As mensagens são armazenadas para fins de auditoria e segurança conforme LGPD.</p>
        </div>
      </Card>
      <button onClick={() => setTermsAccepted(true)} className="pill full accent" style={{ marginTop:16 }}>Li e aceito os Termos de Uso {IC.arrowR()}</button>
    </div>
  );

  /* ── CHAT CONVERSATION ── */
  if (view === "chat" && selConv) {
    const convName = getOtherName(selConv);
    const isGroup = selConv.type === "group";
    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%", background:B.bg }}>
        {ToastEl}
        <input ref={fileRef} type="file" style={{ display:"none" }} onChange={handleFileUpload} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx" />
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:`calc(${TOP} + 4px) 12px 10px`, background:B.bgCard, borderBottom:`1px solid ${B.border}`, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
          <button onClick={() => { setView("list"); setSelConv(null); setMsgs([]); }} className="ib" style={{ width:32, height:32 }}>{IC.back()}</button>
          <Av name={convName} sz={38} fs={14} />
          <div style={{ flex:1 }}>
            <p style={{ fontSize:14, fontWeight:700 }}>{convName}</p>
            <p style={{ fontSize:10, color:B.muted }}>{isGroup ? `${(selConv.members||[]).length} membros` : "Chat direto"}</p>
          </div>
          {pinnedMsgs.length > 0 && <button onClick={() => setPinnedOpen(!pinnedOpen)} className="ib" style={{ width:34, height:34, position:"relative" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2.5" strokeLinecap="round"><path d="M12 17v5"/><path d="M5 17h14"/><path d="M15.5 3.5L18 6l-6.5 6.5L8 9l6.5-6.5z"/></svg>
            <span style={{ position:"absolute", top:-2, right:-2, width:16, height:16, borderRadius:8, background:B.accent, color:B.text, fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center" }}>{pinnedMsgs.length}</span>
          </button>}
        </div>
        {/* Pinned messages panel */}
        {pinnedOpen && pinnedMsgs.length > 0 && <div style={{ padding:"8px 16px", background:`${B.accent}08`, borderBottom:`1px solid ${B.border}`, maxHeight:150, overflowY:"auto" }}>
          <p style={{ fontSize:10, fontWeight:700, color:B.accent, marginBottom:6 }}>📌 Mensagens fixadas</p>
          {pinnedMsgs.map(m => (
            <div key={m.id} style={{ padding:"6px 10px", borderRadius:8, background:B.bgCard, marginBottom:4, fontSize:12 }}>
              <span style={{ fontWeight:700, color:B.accent, marginRight:6 }}>{m.profiles?.name || "..."}</span>
              <span>{m.content || m.file_name || "Arquivo"}</span>
            </div>
          ))}
        </div>}
        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:4 }}>
          {msgs.length === 0 && <div style={{ textAlign:"center", padding:40, color:B.muted, fontSize:13 }}>Nenhuma mensagem ainda. Comece a conversa!</div>}
          {msgs.map((m, mi) => {
            const isMe = m.sender_id === user.id;
            const senderName = m.profiles?.name || "...";
            const prevMsg = msgs[mi - 1];
            const showDate = !prevMsg || fmtDate(m.created_at) !== fmtDate(prevMsg?.created_at);
            return (
              <React.Fragment key={m.id}>
                {showDate && <div style={{ textAlign:"center", marginBottom:8, marginTop:4 }}><span style={{ fontSize:10, color:B.muted, background:"rgba(0,0,0,0.04)", padding:"3px 10px", borderRadius:6 }}>{fmtDate(m.created_at)}</span></div>}
                <div style={{ display:"flex", justifyContent:isMe?"flex-end":"flex-start", marginBottom:2 }}>
                  {!isMe && isGroup && <Av name={senderName} sz={24} fs={9} />}
                  <div onClick={() => togglePin(m)} style={{ maxWidth:"78%", padding:"8px 12px", borderRadius:isMe?"14px 4px 14px 14px":"4px 14px 14px 14px", background:isMe?B.accent:B.bgCard, color:isMe?B.textOnAccent:B.text, boxShadow:"0 1px 2px rgba(0,0,0,0.06)", marginLeft:!isMe&&isGroup?6:0, cursor:"pointer", border:m.pinned?`2px solid ${B.orange}`:"2px solid transparent" }}>
                    {!isMe && isGroup && <p style={{ fontSize:10, fontWeight:700, color:B.blue, marginBottom:2 }}>{senderName}</p>}
                    {m.pinned && <span style={{ fontSize:9, color:isMe?"rgba(0,0,0,0.5)":B.orange }}>📌 </span>}
                    {m.file_url ? (
                      <div>
                        {m.file_type?.startsWith("image/") ? <img src={m.file_url} style={{ maxWidth:"100%", maxHeight:200, borderRadius:8, marginBottom:4 }} alt="" /> : null}
                        <a href={m.file_url} target="_blank" rel="noreferrer" style={{ fontSize:12, color:isMe?"#000":"#1a7af8", textDecoration:"underline", display:"flex", alignItems:"center", gap:4 }}>
                          {IC.doc}<span>{m.file_name || "Arquivo"}</span>
                        </a>
                      </div>
                    ) : <p style={{ fontSize:13, lineHeight:1.5, whiteSpace:"pre-line" }}>{m.content}</p>}
                    <p style={{ fontSize:9, color:isMe?"rgba(0,0,0,0.4)":B.muted, textAlign:"right", marginTop:3 }}>{fmtTime(m.created_at)}</p>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
          <div ref={msgEndRef} />
        </div>
        {/* Attachment dropdown */}
        {showAttach && <div style={{ padding:"8px 16px", background:B.bgCard, borderTop:`1px solid ${B.border}`, display:"flex", gap:8 }}>
          {[{k:"image/*",l:"Foto",ic:IC.camera,c:B.blue},{k:"video/*",l:"Vídeo",ic:IC.vid,c:B.purple},{k:".pdf,.doc,.docx,.xls,.xlsx",l:"Documento",ic:IC.doc,c:B.green}].map(f=>(
            <button key={f.k} onClick={()=>{ if(fileRef.current){fileRef.current.accept=f.k; fileRef.current.click();} }} style={{ flex:1, padding:"10px 0", borderRadius:12, background:`${f.c}10`, border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, fontFamily:"inherit" }}>
              <span style={{ color:f.c, display:"flex" }}>{f.ic}</span>
              <span style={{ fontSize:10, fontWeight:600, color:f.c }}>{f.l}</span>
            </button>
          ))}
        </div>}
        {/* Input */}
        <div style={{ padding:"8px 12px 24px", display:"flex", gap:8, background:B.bgCard, borderTop:`1px solid ${B.border}` }}>
          <button onClick={() => setShowAttach(!showAttach)} className="ib" style={{ width:40, height:40, flexShrink:0, background:showAttach?`${B.accent}15`:B.bgCard }}>{IC.plus}</button>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMsg()} placeholder="Mensagem..." className="tinput" style={{ flex:1 }} />
          <button onClick={sendMsg} className="send-btn" style={{ opacity:input.trim()?1:0.4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#192126" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    );
  }

  /* ── NEW CHAT MODAL ── */
  const NewChatModal = showNewChat ? (
    <>
      <div className="overlay" onClick={() => setShowNewChat(false)} />
      <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:101, background:B.bgCard, borderRadius:"20px 20px 0 0", padding:20, maxHeight:"70vh", overflowY:"auto" }}>
        <h3 style={{ fontSize:16, fontWeight:800, marginBottom:12 }}>Nova conversa</h3>
        <button onClick={() => { setShowNewChat(false); setShowNewGroup(true); }} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"12px 0", border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", borderBottom:`1px solid ${B.border}` }}>
          <div style={{ width:40, height:40, borderRadius:12, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ color:B.accent }}>{IC.users}</span></div>
          <span style={{ fontSize:14, fontWeight:600 }}>Criar grupo</span>
        </button>
        <p className="sl" style={{ marginTop:12, marginBottom:6 }}>Membros da equipe</p>
        {allProfiles.map(p => (
          <button key={p.id} onClick={() => startDM(p.id)} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 0", border:"none", background:"none", cursor:"pointer", fontFamily:"inherit" }}>
            <Av name={p.name} sz={38} fs={14} />
            <div style={{ textAlign:"left" }}><p style={{ fontSize:14, fontWeight:600 }}>{p.name}</p><p style={{ fontSize:11, color:B.muted }}>{p.email}</p></div>
          </button>
        ))}
        {allProfiles.length === 0 && <p style={{ fontSize:13, color:B.muted, padding:20, textAlign:"center" }}>Nenhum membro cadastrado ainda</p>}
      </div>
    </>
  ) : null;

  /* ── NEW GROUP MODAL ── */
  const NewGroupModal = showNewGroup ? (
    <>
      <div className="overlay" onClick={() => setShowNewGroup(false)} />
      <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:101, background:B.bgCard, borderRadius:"20px 20px 0 0", padding:20, maxHeight:"70vh", overflowY:"auto" }}>
        <h3 style={{ fontSize:16, fontWeight:800, marginBottom:12 }}>Novo grupo</h3>
        <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Nome do grupo" className="tinput" style={{ marginBottom:12 }} />
        <p className="sl" style={{ marginBottom:6 }}>Selecione os membros</p>
        {allProfiles.map(p => {
          const sel = groupMembers.includes(p.id);
          return (
            <button key={p.id} onClick={() => setGroupMembers(prev => sel ? prev.filter(x => x !== p.id) : [...prev, p.id])} style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:"10px 0", border:"none", background:"none", cursor:"pointer", fontFamily:"inherit" }}>
              <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${sel ? B.accent : B.border}`, background:sel ? B.accent : "none", display:"flex", alignItems:"center", justifyContent:"center" }}>
                {sel && <span style={{ color:B.text, display:"flex" }}>{IC.check}</span>}
              </div>
              <Av name={p.name} sz={34} fs={12} />
              <span style={{ fontSize:13, fontWeight:600 }}>{p.name}</span>
            </button>
          );
        })}
        <button onClick={createGroup} className="pill full accent" style={{ marginTop:16 }}>Criar grupo ({groupMembers.length} selecionados)</button>
      </div>
    </>
  ) : null;

  /* ── CONVERSATION LIST ── */
  const sortedConvs = [...convs].sort((a, b) => {
    const ta = a.lastMsg?.created_at || a.created_at;
    const tb = b.lastMsg?.created_at || b.created_at;
    return new Date(tb) - new Date(ta);
  });
  const filteredConvs = sortedConvs.filter(c => getOtherName(c).toLowerCase().includes(search.toLowerCase()));
  const groups = filteredConvs.filter(c => c.type === "group");
  const dms = filteredConvs.filter(c => c.type === "dm");
  const totalUnread = convs.reduce((a, c) => a + (c.unread || 0), 0);

  return (
    <div className="pg" style={{ paddingTop: TOP }}>
      {ToastEl}{NewChatModal}{NewGroupModal}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, paddingTop:8 }}>
        <h2 style={{ fontSize:18, fontWeight:800, flex:1 }}>Chat</h2>
        {totalUnread > 0 && <Tag color={B.accent}>{totalUnread} {totalUnread === 1 ? "nova" : "novas"}</Tag>}
        <button onClick={() => setShowNewChat(true)} className="ib" style={{ width:36, height:36, background:`${B.accent}15` }}>{IC.plus}</button>
      </div>
      {/* Search */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:B.muted, display:"flex" }}>{IC.search(B.muted)}</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar conversa..." className="tinput" style={{ paddingLeft:40 }} />
      </div>
      {loading && <p style={{ textAlign:"center", color:B.muted, padding:30, fontSize:13 }}>Carregando conversas...</p>}
      {!loading && groups.length > 0 && <>
        <p className="sl" style={{ marginBottom:6 }}>Grupos</p>
        {groups.map((c, i) => {
          const lastText = c.lastMsg?.file_url ? "📎 Arquivo" : (c.lastMsg?.content || "Sem mensagens");
          return (
            <Card key={c.id} delay={i*0.03} onClick={() => { setSelConv(c); setView("chat"); }} style={{ marginTop:i?6:0, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:42, height:42, borderRadius:14, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:B.accent, display:"flex" }}>{IC.users}</span>
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:c.unread?700:500 }}>{c.name || "Grupo"}</p>
                  <p style={{ fontSize:12, color:B.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lastText}</p>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <p style={{ fontSize:10, color:c.unread?B.accent:B.muted }}>{fmtTime(c.lastMsg?.created_at)}</p>
                  {c.unread > 0 && <div style={{ width:18, height:18, borderRadius:9, background:B.accent, color:B.text, fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", marginTop:4, marginLeft:"auto" }}>!</div>}
                </div>
              </div>
            </Card>
          );
        })}
      </>}
      {!loading && dms.length > 0 && <>
        <p className="sl" style={{ marginTop:14, marginBottom:6 }}>Conversas</p>
        {dms.map((c, i) => {
          const other = (c.members || []).find(m => m.id !== user.id);
          const lastText = c.lastMsg?.file_url ? "📎 Arquivo" : (c.lastMsg?.content || "Sem mensagens");
          const lastIsMe = c.lastMsg?.sender_id === user.id;
          return (
            <Card key={c.id} delay={(i+groups.length)*0.03} onClick={() => { setSelConv(c); setView("chat"); }} style={{ marginTop:i?6:0, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Av name={other?.name || "?"} sz={42} fs={16} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:14, fontWeight:c.unread?700:500 }}>{other?.name || "Usuário"}</p>
                  <p style={{ fontSize:12, color:B.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{lastIsMe ? "Você: " : ""}{lastText}</p>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <p style={{ fontSize:10, color:c.unread?B.accent:B.muted }}>{fmtTime(c.lastMsg?.created_at)}</p>
                  {c.unread > 0 && <div style={{ width:18, height:18, borderRadius:9, background:B.accent, color:B.text, fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", marginTop:4, marginLeft:"auto" }}>!</div>}
                </div>
              </div>
            </Card>
          );
        })}
      </>}
      {!loading && convs.length === 0 && <div style={{ textAlign:"center", padding:40 }}>
        <div style={{ width:60, height:60, borderRadius:16, background:`${B.accent}10`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px" }}>
          <span style={{ color:B.accent }}>{IC.chat}</span>
        </div>
        <p style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Nenhuma conversa</p>
        <p style={{ fontSize:12, color:B.muted, marginBottom:16 }}>Inicie uma conversa com sua equipe</p>
        <button onClick={() => setShowNewChat(true)} className="pill accent">Nova conversa</button>
      </div>}
    </div>
  );
}
