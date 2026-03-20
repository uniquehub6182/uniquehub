function ClientMatch4Biz({ onBack, user }) {
  const [accepted, setAccepted] = useState(() => { try { return localStorage.getItem("uh_m4b_accepted")==="1"; } catch { return false; } });
  const [tab, setTab] = useState("discover");
  const [credits, setCredits] = useState(0);
  const [idx, setIdx] = useState(0);
  const [allClients, setAllClients] = useState([]);
  const [myClient, setMyClient] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anim, setAnim] = useState(null);
  const [showBuy, setShowBuy] = useState(false);
  const [chatMatch, setChatMatch] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [showProfile, setShowProfile] = useState(null);
  const [touchX, setTouchX] = useState(null);
  const [dragX, setDragX] = useState(0);
  const [celebration, setCelebration] = useState(null);
  const chatEnd = useRef(null);
  const chatFile = useRef(null);
  const [vpH, setVpH] = useState(window.innerHeight);
  const { showToast, ToastEl } = useToast();
  const LIME = "#BBF246";

  const planCredits = (v) => { v=parseFloat(v)||0; if(v>=4480) return 9999; if(v>=3480) return 30; if(v>=2480) return 20; return 10; };
  const unlimited = credits >= 9999;
  const ini = (n) => (n||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const col = (n) => { const c=["#10B981","#3B82F6","#8B5CF6","#EC4899","#F59E0B","#EF4444","#06B6D4","#84CC16"]; let h=0; for(let i=0;i<(n||"").length;i++) h=((h<<5)-h)+n.charCodeAt(i); return c[Math.abs(h)%c.length]; };
  const since = (d) => d ? new Date(d).getFullYear() : "";
  const accept = () => { setAccepted(true); try{localStorage.setItem("uh_m4b_accepted","1");}catch{} };

  useEffect(() => {
    if(!supabase||!user?.email){setLoading(false);return;}
    (async()=>{
      try {
        const{data:cl}=await supabase.from("clients").select("*").eq("contact_email",user.email).maybeSingle();
        if(!cl){setLoading(false);return;} setMyClient(cl);
        const pc=planCredits(cl.monthly_value);
        try{const ex=parseInt(localStorage.getItem("uh_m4b_credits_"+cl.id)||"0");setCredits(pc+ex);}catch{setCredits(pc);}
        const{data:cls}=await supabase.from("clients").select("*").neq("id",cl.id).eq("status","ativo");
        if(cls) setAllClients(cls);
        const{data:m}=await supabase.from("match4biz").select("*").or("client_a_id.eq."+cl.id+",client_b_id.eq."+cl.id);
        if(m) setMatches(m);
      }catch(e){console.warn("[M4B]",e);}
      setLoading(false);
    })();
  },[user?.email]);

  useEffect(()=>{if(!chatMatch)return;const vv=window.visualViewport;if(!vv)return;const fn=()=>{setVpH(vv.height);setTimeout(()=>chatEnd.current?.scrollIntoView({behavior:"smooth"}),50);};vv.addEventListener("resize",fn);return()=>vv.removeEventListener("resize",fn);},[chatMatch]);

  const liked = matches.map(m=>m.client_a_id===myClient?.id?m.client_b_id:m.client_a_id);
  const mutual = matches.filter(m=>m.client_a_confirmed&&m.client_b_confirmed);
  const avail = allClients.filter(c=>!liked.includes(c.id));
  const cur = avail.length>0 ? avail[idx%avail.length] : null;

  /* Actions */
  const like = async()=>{
    if(!cur||!myClient)return; if(!unlimited&&credits<10){setShowBuy(true);return;}
    setAnim("like");
    setTimeout(async()=>{
      try{
        const ex=matches.find(m=>(m.client_a_id===cur.id&&m.client_b_id===myClient.id)||(m.client_a_id===myClient.id&&m.client_b_id===cur.id));
        if(ex){const f=ex.client_a_id===myClient.id?"client_a_confirmed":"client_b_confirmed";await supabase.from("match4biz").update({[f]:true,status:"mutual"}).eq("id",ex.id);setMatches(p=>p.map(m=>m.id===ex.id?{...m,[f]:true,status:"mutual"}:m));setCelebration(cur);setTimeout(()=>setCelebration(null),3500);}
        else{const nm={client_a_id:myClient.id,client_a_name:myClient.name,client_b_id:cur.id,client_b_name:cur.name,status:"pending",messages:[],created_by:user?.name||"",client_a_confirmed:true,client_b_confirmed:false};const s=await supaCreateMatch(nm);if(s){setMatches(p=>[...p,s]);showToast("Match enviado!");}}
      }catch(e){}
      if(!unlimited){const nc=credits-10;setCredits(nc);try{localStorage.setItem("uh_m4b_credits_"+myClient.id,String(Math.max(0,nc-planCredits(myClient.monthly_value))));}catch{}}
      setIdx(i=>i+1);setAnim(null);setDragX(0);
    },400);
  };
  const pass=()=>{if(!cur)return;setAnim("pass");setTimeout(()=>{setIdx(i=>i+1);setAnim(null);setDragX(0);},350);};
  const onTS=(e)=>setTouchX(e.touches[0].clientX);
  const onTM=(e)=>{if(touchX===null)return;setDragX(e.touches[0].clientX-touchX);};
  const onTE=()=>{if(Math.abs(dragX)>80){dragX>0?like():pass();}else setDragX(0);setTouchX(null);};

  /* Chat */
  const sendMsg=async(t,type="text")=>{if(!chatMatch||(!t?.trim()&&type==="text"))return;const msg={from:myClient?.id,fromName:myClient?.name,text:t?.trim()||"",type,ts:new Date().toISOString()};const ms=[...(chatMatch.messages||[]),msg];try{await supabase.from("match4biz").update({messages:ms}).eq("id",chatMatch.id);}catch{}setMatches(p=>p.map(m=>m.id===chatMatch.id?{...m,messages:ms}:m));setChatMatch(p=>({...p,messages:ms}));setChatInput("");setTimeout(()=>chatEnd.current?.scrollIntoView({behavior:"smooth"}),100);};
  const onFile=async(e)=>{const f=e.target.files?.[0];if(!f||!supabase)return;const p=`m4b/${Date.now()}_${f.name}`;const{error}=await supabase.storage.from("demand-files").upload(p,f,{upsert:true});if(error){showToast("Erro no upload");return;}const{data:u}=supabase.storage.from("demand-files").getPublicUrl(p);sendMsg(u.publicUrl,/\.(jpg|jpeg|png|gif|webp)$/i.test(f.name)?"image":/\.(mp4|mov|webm)$/i.test(f.name)?"video":"file");e.target.value="";};
  const dealAction=async(a)=>{if(!chatMatch)return;const sm={close:"deal_closed",noclose:"deal_rejected",help:"agency_help"};const mm={close:"🤝 Negócio fechado!",noclose:"❌ Negócio não fechado",help:"🏢 Pediu ajuda da agência"};await sendMsg(mm[a],"system");try{await supabase.from("match4biz").update({status:sm[a]}).eq("id",chatMatch.id);}catch{}setMatches(p=>p.map(m=>m.id===chatMatch.id?{...m,status:sm[a]}:m));setChatMatch(p=>({...p,status:sm[a]}));showToast(a==="close"?"Parabéns! 🎉":a==="help"?"Agência notificada":"Atualizado");};
  const partner=(m)=>{const pid=m.client_a_id===myClient?.id?m.client_b_id:m.client_a_id;const pn=m.client_a_id===myClient?.id?m.client_b_name:m.client_a_name;return{id:pid,name:pn,...(allClients.find(c=>c.id===pid)||{})};};

  /* ═══ CELEBRATION ═══ */
  if(celebration){const p=celebration;const c=col(p.name);return(
    <div style={{position:"fixed",inset:0,zIndex:999,background:`linear-gradient(180deg,${LIME}15 0%,${c}20 50%,${B.bg} 100%)`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:B.text}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:28}}>
        <div style={{width:88,height:88,borderRadius:26,overflow:"hidden",border:"4px solid #fff",boxShadow:"0 8px 32px rgba(0,0,0,0.12)",zIndex:2,background:B.bgCard}}>
          {myClient?.logo_url?<img src={myClient.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{width:"100%",height:"100%",background:LIME,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:900,color:"#0D0D0D"}}>{ini(myClient?.name)}</div>}
        </div>
        <div style={{width:88,height:88,borderRadius:26,overflow:"hidden",border:"4px solid #fff",boxShadow:"0 8px 32px rgba(0,0,0,0.12)",marginLeft:-18,background:B.bgCard}}>
          {p.logo_url?<img src={p.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{width:"100%",height:"100%",background:c,display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:900,color:"#fff"}}>{ini(p.name)}</div>}
        </div>
      </div>
      <p style={{fontSize:13,fontWeight:700,color:B.muted,textTransform:"uppercase",letterSpacing:4}}>É um</p>
      <h1 style={{fontSize:52,fontWeight:900,margin:"4px 0",color:LIME,textShadow:`0 4px 24px ${LIME}40`}}>Match!</h1>
      <p style={{fontSize:14,color:B.muted,marginTop:8}}>Você e <strong style={{color:B.text}}>{p.name}</strong> podem conversar</p>
      <button onClick={()=>{setCelebration(null);setTab("matches");}} style={{marginTop:28,padding:"14px 40px",borderRadius:50,background:LIME,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:15,fontWeight:700,color:"#0D0D0D",boxShadow:`0 4px 20px ${LIME}50`}}>Conversar agora</button>
      <button onClick={()=>setCelebration(null)} style={{marginTop:12,background:"transparent",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:13,color:B.muted}}>Continuar descobrindo</button>
    </div>
  );}

  /* ═══ CHAT ═══ */
  if(chatMatch){const p=partner(chatMatch);const c=col(p.name);const ms=chatMatch.messages||[];const closed=chatMatch.status==="deal_closed"||chatMatch.status==="deal_rejected";return(
    <div style={{position:"fixed",top:0,left:0,right:0,height:vpH,display:"flex",flexDirection:"column",background:B.bg,color:B.text,zIndex:50}}>
      {ToastEl}<input ref={chatFile} type="file" accept="image/*,video/*,.pdf,.doc,.docx" style={{display:"none"}} onChange={onFile}/>
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 16px",borderBottom:"1px solid "+B.border,flexShrink:0,background:B.bgCard}}>
        <button onClick={()=>setChatMatch(null)} className="ib" style={{width:36,height:36}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        {p.logo_url?<img src={p.logo_url} style={{width:36,height:36,borderRadius:12,objectFit:"cover"}}/>:<div style={{width:36,height:36,borderRadius:12,background:c+"20",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:c}}>{ini(p.name)}</div>}
        <div style={{flex:1,minWidth:0}}><p style={{fontSize:14,fontWeight:700}}>{p.name}</p><p style={{fontSize:10,color:chatMatch.status==="deal_closed"?B.green:chatMatch.status==="agency_help"?"#6366F1":B.muted}}>{chatMatch.status==="deal_closed"?"Negócio fechado ✅":chatMatch.status==="agency_help"?"Agência participando":chatMatch.status==="deal_rejected"?"Não fechou":"Conectado"}</p></div>
      </div>
      {!closed&&<div style={{display:"flex",gap:6,padding:"8px 12px",borderBottom:"1px solid "+B.border,overflowX:"auto",scrollbarWidth:"none",flexShrink:0}}>
        <button onClick={()=>dealAction("close")} style={{padding:"6px 12px",borderRadius:20,border:"1.5px solid "+B.green+"40",background:B.green+"06",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:600,color:B.green,whiteSpace:"nowrap",flexShrink:0}}>🤝 Fechar Negócio</button>
        <button onClick={()=>dealAction("noclose")} style={{padding:"6px 12px",borderRadius:20,border:"1.5px solid #EF444440",background:"#EF444406",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:600,color:"#EF4444",whiteSpace:"nowrap",flexShrink:0}}>❌ Não Fechar</button>
        <button onClick={()=>dealAction("help")} style={{padding:"6px 12px",borderRadius:20,border:"1.5px solid #6366F140",background:"#6366F106",cursor:"pointer",fontFamily:"inherit",fontSize:10,fontWeight:600,color:"#6366F1",whiteSpace:"nowrap",flexShrink:0}}>🏢 Pedir Ajuda</button>
      </div>}

      <div style={{flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"12px 16px"}}>
        {ms.length===0&&<div style={{textAlign:"center",padding:"40px 20px"}}><div style={{width:64,height:64,borderRadius:20,background:LIME+"15",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div><p style={{fontSize:15,fontWeight:700}}>Vocês deram Match! 🎉</p><p style={{fontSize:12,color:B.muted,marginTop:6,lineHeight:1.5}}>Comecem a conversar sobre a parceria. Enviem propostas, arquivos e definam os próximos passos.</p></div>}
        {ms.map((m,i)=>{const me=m.from===myClient?.id;const ag=m.from==="agency";const sys=m.type==="system";
          if(sys)return<div key={i} style={{textAlign:"center",margin:"12px 0"}}><span style={{fontSize:10,color:B.muted,background:B.bg,padding:"4px 14px",borderRadius:20,border:"1px solid "+B.border}}>{m.text}</span></div>;
          return(<div key={i} style={{marginBottom:8}}>{ag&&<p style={{fontSize:9,fontWeight:700,color:"#6366F1",marginBottom:2}}>🏢 {m.by||"Unique Marketing"}</p>}<div style={{display:"flex",justifyContent:me?"flex-end":"flex-start"}}><div style={{maxWidth:"78%",padding:m.type==="image"?"4px":"10px 14px",borderRadius:18,background:ag?"#6366F108":me?LIME+"15":B.bgCard,border:"1px solid "+(ag?"#6366F120":me?LIME+"25":B.border),borderBottomRightRadius:me?4:18,borderBottomLeftRadius:me?18:4}}>
            {m.type==="image"&&<img src={m.text} style={{maxWidth:"100%",maxHeight:200,borderRadius:14,display:"block"}}/>}
            {m.type==="video"&&<video src={m.text} controls style={{maxWidth:"100%",maxHeight:200,borderRadius:14}}/>}
            {m.type==="file"&&<a href={m.text} target="_blank" rel="noopener noreferrer" style={{display:"flex",alignItems:"center",gap:6,color:B.accent,fontSize:12,fontWeight:600}}>📎 Arquivo</a>}
            {(m.type==="text"||!m.type)&&<p style={{fontSize:13,lineHeight:1.5,margin:0,wordBreak:"break-word"}}>{m.text}</p>}
            <p style={{fontSize:8,color:B.muted,marginTop:3,textAlign:"right"}}>{new Date(m.ts).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
          </div></div></div>);})}
        <div ref={chatEnd}/>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px 12px",borderTop:"1px solid "+B.border,background:B.bgCard,flexShrink:0}}>
        <button onClick={()=>chatFile.current?.click()} className="ib" style={{width:36,height:36}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg></button>
        <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg(chatInput);}}} placeholder="Mensagem..." className="tinput" style={{flex:1,padding:"10px 14px",fontSize:14}}/>
        <button onClick={()=>sendMsg(chatInput)} disabled={!chatInput.trim()} style={{width:36,height:36,borderRadius:12,background:chatInput.trim()?LIME:B.border,border:"none",cursor:chatInput.trim()?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={chatInput.trim()?"#0D0D0D":B.muted} strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>
      </div>
    </div>);}

  /* ═══ PROFILE ═══ */
  if(showProfile){const p=showProfile;const c=col(p.name);return(
    <div className="app" style={{background:B.bg,color:B.text}}>
      <div className="content" style={{padding:0}}>
        <div style={{height:300,position:"relative",overflow:"hidden"}}>
          {p.logo_url?<img src={p.logo_url} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{width:"100%",height:"100%",background:`linear-gradient(135deg,${c}40,${c}15)`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:80,fontWeight:900,color:c+"30"}}>{ini(p.name)}</span></div>}
          <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0) 30%,rgba(0,0,0,0.7) 100%)"}}/>
          <button onClick={()=>setShowProfile(null)} style={{position:"absolute",top:16,left:16,width:36,height:36,borderRadius:12,background:"rgba(255,255,255,0.2)",backdropFilter:"blur(10px)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
          <div style={{position:"absolute",bottom:16,left:16,right:16}}>
            <h2 style={{fontSize:26,fontWeight:900,color:"#fff",margin:0}}>{p.name}</h2>
            {p.contact_name&&<p style={{fontSize:14,color:"rgba(255,255,255,0.85)",marginTop:2}}>{p.contact_name}</p>}
            <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
              <span style={{padding:"4px 12px",borderRadius:20,background:LIME,fontSize:11,fontWeight:700,color:"#0D0D0D"}}>{p.plan?"Plano "+(p.plan.charAt(0).toUpperCase()+p.plan.slice(1)):"Cliente"}</span>
              {p.segment&&<span style={{padding:"4px 12px",borderRadius:20,background:"rgba(255,255,255,0.2)",backdropFilter:"blur(4px)",fontSize:11,fontWeight:600,color:"#fff"}}>{p.segment}</span>}
              {since(p.start_date)&&<span style={{padding:"4px 12px",borderRadius:20,background:"rgba(255,255,255,0.2)",fontSize:11,fontWeight:600,color:"#fff"}}>Desde {since(p.start_date)}</span>}
            </div>
          </div>
        </div>
        <div style={{padding:"16px"}}>
          {p.notes&&<div style={{background:B.bgCard,borderRadius:16,border:"1px solid "+B.border,padding:16,marginBottom:12}}><p style={{fontSize:11,fontWeight:700,color:B.muted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:8}}>Sobre a empresa</p><p style={{fontSize:13,lineHeight:1.7,color:B.text}}>{p.notes}</p></div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
            <div style={{background:B.bgCard,borderRadius:14,border:"1px solid "+B.border,padding:14,textAlign:"center"}}><p style={{fontSize:24,fontWeight:900,color:c}}>{p.start_date?new Date().getFullYear()-new Date(p.start_date).getFullYear()||"<1":"?"}</p><p style={{fontSize:10,color:B.muted}}>Anos conosco</p></div>
            <div style={{background:B.bgCard,borderRadius:14,border:"1px solid "+B.border,padding:14,textAlign:"center"}}><p style={{fontSize:24,fontWeight:900,color:LIME}}>✓</p><p style={{fontSize:10,color:B.muted}}>Verificado</p></div>
          </div>
          <div style={{display:"flex",gap:10,paddingBottom:30}}>
            <button onClick={()=>{setShowProfile(null);pass();}} style={{width:60,height:60,borderRadius:"50%",border:"2px solid #EF444430",background:"#EF444406",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            <button onClick={()=>{setShowProfile(null);like();}} style={{flex:1,padding:"16px",borderRadius:50,background:LIME,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:16,fontWeight:800,color:"#0D0D0D",boxShadow:"0 4px 20px "+LIME+"40"}}>❤️ Dar Match</button>
          </div>
        </div>
      </div>
    </div>);}

  /* ═══ TERMS ═══ */
  if(!accepted)return(
    <div className="app" style={{background:B.bg,color:B.text}}><Head title="Match4Biz" onBack={onBack}/><div className="content" style={{padding:"0 16px"}}>
      <div style={{textAlign:"center",padding:"20px 0 16px"}}><div style={{width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${LIME},#8BC34A)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:`0 8px 32px ${LIME}40`}}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg></div><h2 style={{fontSize:22,fontWeight:900}}>Match4Biz</h2><p style={{fontSize:13,color:B.muted,lineHeight:1.5,marginTop:4}}>Conecte-se com outros negócios e crie parcerias estratégicas</p></div>
      <Card style={{marginBottom:12}}><p style={{fontSize:14,fontWeight:700,marginBottom:10}}>Como funciona</p>{[{i:"🔍",t:"Descubra",d:"Veja perfis de empresas e encontre oportunidades"},{i:"❤️",t:"Dê Match",d:"Arraste pra direita ou toque no coração"},{i:"💬",t:"Converse",d:"Match mútuo abre chat exclusivo"},{i:"🤝",t:"Feche Negócios",d:"Negocie na plataforma com suporte da agência"}].map((s,i)=>(<div key={i} style={{display:"flex",gap:12,padding:"10px 0",borderBottom:i<3?"1px solid "+B.border:"none"}}><span style={{fontSize:20,flexShrink:0}}>{s.i}</span><div><p style={{fontSize:13,fontWeight:700}}>{s.t}</p><p style={{fontSize:11,color:B.muted,lineHeight:1.4}}>{s.d}</p></div></div>))}</Card>
      <Card style={{marginBottom:12,background:LIME+"06",border:"1.5px solid "+LIME+"20"}}><p style={{fontSize:12,fontWeight:700,color:LIME.replace("#BBF246","#7da832"),marginBottom:6}}>Créditos por Plano</p>{[{p:"Free",c:"10",m:"1 match grátis"},{p:"R$ 1.480",c:"10",m:"1 match"},{p:"R$ 2.480",c:"20",m:"2 matches"},{p:"R$ 3.480",c:"30",m:"3 matches"},{p:"R$ 4.480",c:"∞",m:"Ilimitado"}].map((x,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<4?"1px solid "+B.border:"none"}}><span style={{fontSize:12,fontWeight:600}}>{x.p}</span><span style={{fontSize:12,fontWeight:700,color:B.text}}>{x.c} créditos <span style={{color:B.muted,fontWeight:400}}>· {x.m}</span></span></div>))}<p style={{fontSize:10,color:B.muted,marginTop:8}}>Extras: R$ 100 = 10 créditos</p></Card>
      <Card style={{marginBottom:16,background:"#F59E0B06",border:"1.5px solid #F59E0B20"}}><p style={{fontSize:12,fontWeight:700,color:"#F59E0B",marginBottom:6}}>Termos de Uso</p><ul style={{fontSize:11,color:B.muted,lineHeight:1.8,paddingLeft:16,margin:0}}><li>Negociação <strong style={{color:B.text}}>dentro da plataforma</strong></li><li><strong style={{color:B.text}}>Taxa de 5-10%</strong> sobre parceria fechada</li><li>Unique Marketing como facilitadora</li><li>Informações são confidenciais</li></ul></Card>
      <button onClick={accept} style={{width:"100%",padding:"16px",borderRadius:50,background:LIME,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:15,fontWeight:700,color:"#0D0D0D",marginBottom:30,boxShadow:`0 4px 20px ${LIME}40`}}>Aceitar e Começar</button>
    </div></div>);

  const BuyModal=showBuy?(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowBuy(false)}><div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:430,background:B.bgCard,borderRadius:"24px 24px 0 0",padding:"20px 20px calc(20px + env(safe-area-inset-bottom,0px))"}}>
    <div style={{width:40,height:4,borderRadius:2,background:B.border,margin:"0 auto 16px"}}/><h3 style={{fontSize:18,fontWeight:800,marginBottom:4}}>Comprar Créditos</h3><p style={{fontSize:12,color:B.muted,marginBottom:16}}>10 créditos = 1 match</p>
    {[{n:10,p:"R$ 100",d:"1 match",pop:false},{n:30,p:"R$ 250",d:"3 matches · 17% off",pop:true},{n:50,p:"R$ 400",d:"5 matches · 20% off",pop:false}].map((x,i)=>(<button key={i} onClick={()=>{showToast("Redirecionando...");setShowBuy(false);}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"14px 16px",borderRadius:14,border:x.pop?"2px solid "+LIME:"1.5px solid "+B.border,background:x.pop?LIME+"08":"transparent",cursor:"pointer",fontFamily:"inherit",marginBottom:8,textAlign:"left"}}><div><p style={{fontSize:14,fontWeight:700}}>{x.n} créditos</p><p style={{fontSize:11,color:B.muted}}>{x.d}</p></div><div style={{textAlign:"right"}}><p style={{fontSize:16,fontWeight:800,color:LIME.replace("#BBF246","#7da832")}}>{x.p}</p>{x.pop&&<span style={{fontSize:9,fontWeight:700,background:LIME,color:"#0D0D0D",padding:"2px 8px",borderRadius:6}}>POPULAR</span>}</div></button>))}
  </div></div>):null;

  /* ═══ MAIN ═══ */
  const rot=dragX*0.06;const likeOp=Math.min(1,Math.max(0,dragX/100));const nopeOp=Math.min(1,Math.max(0,-dragX/100));
  return(
    <div className="app" style={{background:B.bg,color:B.text}}>
      {ToastEl}{BuyModal}
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",flexShrink:0}}>
        <button onClick={onBack} className="ib" style={{width:36,height:36}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg></button>
        <p style={{fontSize:17,fontWeight:800}}>Match4Biz</p>
        <button onClick={()=>setShowBuy(true)} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 14px",borderRadius:50,background:LIME+"15",border:"1px solid "+LIME+"30",cursor:"pointer",fontFamily:"inherit"}}><span style={{fontSize:12,fontWeight:700,color:LIME.replace("#BBF246","#7da832")}}>{unlimited?"∞":credits} ⚡</span></button>
      </div>
      {/* Tabs */}
      <div style={{display:"flex",gap:0,margin:"0 16px 12px",borderRadius:14,overflow:"hidden",border:"1.5px solid "+B.border}}>
        <button onClick={()=>setTab("discover")} style={{flex:1,padding:"10px",border:"none",background:tab==="discover"?LIME:"transparent",color:tab==="discover"?"#0D0D0D":B.muted,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>🔍 Descobrir</button>
        <button onClick={()=>setTab("matches")} style={{flex:1,padding:"10px",border:"none",borderLeft:"1.5px solid "+B.border,background:tab==="matches"?LIME:"transparent",color:tab==="matches"?"#0D0D0D":B.muted,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>💬 Conexões{mutual.length>0?" ("+mutual.length+")":""}</button>
      </div>

      {loading?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:40,height:40,border:"3px solid "+B.border,borderTopColor:LIME,borderRadius:"50%",animation:"spin .8s linear infinite"}}/></div>
      :tab==="discover"?(<div style={{flex:1,display:"flex",flexDirection:"column",padding:"0 16px",minHeight:0}}>
        {avail.length>0&&cur?(<>
          {/* THE CARD */}
          <div onTouchStart={onTS} onTouchMove={onTM} onTouchEnd={onTE}
            style={{flex:1,borderRadius:24,overflow:"hidden",position:"relative",boxShadow:"0 8px 40px rgba(0,0,0,0.12)",
              transform:`translateX(${anim==="like"?350:anim==="pass"?-350:dragX}px) rotate(${anim==="like"?18:anim==="pass"?-18:rot}deg)`,
              opacity:anim?0:1,transition:anim||!dragX?"all .45s cubic-bezier(0.34,1.56,0.64,1)":"none"}}>

            {/* BG */}
            {cur.logo_url?<img src={cur.logo_url} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
            :<div style={{position:"absolute",inset:0,background:`linear-gradient(160deg,${col(cur.name)}35,${col(cur.name)}10,${B.bgCard})`,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:140,fontWeight:900,color:col(cur.name)+"12"}}>{ini(cur.name)}</span></div>}

            {/* Gradient */}
            <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,transparent 35%,rgba(0,0,0,0.75) 100%)"}}/>

            {/* MATCH stamp */}
            {(likeOp>0.15||anim==="like")&&<div style={{position:"absolute",top:"15%",left:24,zIndex:5,padding:"10px 28px",border:`4px solid ${LIME}`,borderRadius:14,transform:"rotate(-20deg)",opacity:anim==="like"?1:likeOp,background:LIME+"15"}}><span style={{fontSize:36,fontWeight:900,color:LIME,letterSpacing:6}}>MATCH</span></div>}

            {/* NOPE stamp */}
            {(nopeOp>0.15||anim==="pass")&&<div style={{position:"absolute",top:"15%",right:24,zIndex:5,padding:"10px 28px",border:"4px solid #EF4444",borderRadius:14,transform:"rotate(20deg)",opacity:anim==="pass"?1:nopeOp,background:"#EF444415"}}><span style={{fontSize:36,fontWeight:900,color:"#EF4444",letterSpacing:6}}>NOPE</span></div>}

            {/* Lock */}
            {!unlimited&&credits<10&&<div style={{position:"absolute",inset:0,zIndex:8,background:"rgba(255,255,255,0.92)",backdropFilter:"blur(10px)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRadius:24}}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <p style={{fontSize:18,fontWeight:800,marginTop:12}}>Sem créditos</p><p style={{fontSize:12,color:B.muted,marginTop:4}}>Compre créditos para continuar</p>
              <button onClick={()=>setShowBuy(true)} style={{marginTop:16,padding:"12px 32px",borderRadius:50,background:LIME,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,color:"#0D0D0D"}}>Comprar créditos</button>
            </div>}

            {/* Info */}
            <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 18px",zIndex:3}}>
              <h2 style={{fontSize:28,fontWeight:900,color:"#fff",margin:0,textShadow:"0 2px 12px rgba(0,0,0,0.5)"}}>{cur.name}</h2>
              {cur.contact_name&&<p style={{fontSize:13,color:"rgba(255,255,255,0.85)",marginTop:3}}>{cur.contact_name}</p>}
              <div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
                <span style={{padding:"3px 10px",borderRadius:20,background:LIME,fontSize:10,fontWeight:700,color:"#0D0D0D"}}>{cur.plan?(cur.plan.charAt(0).toUpperCase()+cur.plan.slice(1)):"Cliente"}</span>
                {cur.segment&&<span style={{padding:"3px 10px",borderRadius:20,background:"rgba(255,255,255,0.2)",backdropFilter:"blur(4px)",fontSize:10,fontWeight:600,color:"#fff"}}>{cur.segment}</span>}
                {since(cur.start_date)&&<span style={{padding:"3px 10px",borderRadius:20,background:"rgba(255,255,255,0.2)",fontSize:10,fontWeight:600,color:"#fff"}}>Desde {since(cur.start_date)}</span>}
              </div>
              {cur.notes&&<p style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:10,lineHeight:1.5,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{cur.notes}</p>}
            </div>

            {/* View profile btn */}
            <button onClick={()=>setShowProfile(cur)} style={{position:"absolute",top:14,right:14,zIndex:4,padding:"8px 14px",borderRadius:50,background:"rgba(255,255,255,0.2)",backdropFilter:"blur(8px)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:"inherit",fontSize:11,fontWeight:600,color:"#fff"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Ver perfil
            </button>
          </div>

          {/* Buttons */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:18,padding:"14px 0 6px",flexShrink:0}}>
            <button onClick={pass} style={{width:54,height:54,borderRadius:"50%",background:"#fff",border:"2px solid #EF444430",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 2px 12px rgba(0,0,0,0.06)"}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            <button onClick={like} style={{width:66,height:66,borderRadius:"50%",background:LIME,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 6px 24px ${LIME}50`}}><svg width="30" height="30" viewBox="0 0 24 24" fill="#0D0D0D" stroke="#0D0D0D" strokeWidth="1"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>
          </div>
          <p style={{textAlign:"center",fontSize:10,color:B.muted,paddingBottom:4}}>{avail.length} empresa{avail.length>1?"s":""} · {unlimited?"∞":credits} créditos</p>
        </>):(
          <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"0 24px"}}>
            <div style={{width:80,height:80,borderRadius:24,background:LIME+"10",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:20}}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></div>
            <p style={{fontSize:18,fontWeight:800}}>{allClients.length===0?"Nenhuma empresa":"Tudo visto!"}</p>
            <p style={{fontSize:13,color:B.muted,marginTop:8,textAlign:"center",lineHeight:1.5}}>{allClients.length===0?"Novas empresas aparecerão em breve.":"Confira suas conexões!"}</p>
          </div>
        )}
      </div>

      :<div className="content" style={{padding:"0 16px"}}>
        {matches.length===0?<div style={{textAlign:"center",padding:"50px 20px"}}><div style={{width:64,height:64,borderRadius:20,background:LIME+"10",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div><p style={{fontSize:16,fontWeight:700}}>Nenhuma conexão</p><p style={{fontSize:12,color:B.muted,marginTop:6}}>Dê match pra começar!</p></div>
        :(<>
          {mutual.length>0&&<><p className="sl" style={{marginBottom:8}}>Chat disponível</p>
            {mutual.map(m=>{const p=partner(m);const c=col(p.name);const last=(m.messages||[]).filter(x=>x.type!=="system").slice(-1)[0];return(
              <Card key={m.id} onClick={()=>setChatMatch(m)} style={{marginBottom:8,cursor:"pointer",padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  {p.logo_url?<img src={p.logo_url} style={{width:48,height:48,borderRadius:14,objectFit:"cover"}}/>:<div style={{width:48,height:48,borderRadius:14,background:c+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:c,flexShrink:0}}>{ini(p.name)}</div>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><p style={{fontSize:14,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</p><Tag color={m.status==="deal_closed"?B.green:m.status==="agency_help"?"#6366F1":LIME}>{m.status==="deal_closed"?"Fechado ✅":m.status==="agency_help"?"Agência":"Ativo"}</Tag></div>
                    <p style={{fontSize:11,color:B.muted,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{last?(last.from===myClient?.id?"Você: ":"")+last.text.substring(0,40):"Toque para conversar"}</p>
                  </div>
                </div>
              </Card>);})}</>}
          {matches.filter(m=>!m.client_a_confirmed||!m.client_b_confirmed).length>0&&<><p className="sl" style={{marginBottom:8,marginTop:mutual.length>0?16:0}}>Aguardando match</p>
            {matches.filter(m=>!m.client_a_confirmed||!m.client_b_confirmed).map(m=>{const p=partner(m);return(
              <Card key={m.id} style={{marginBottom:8,opacity:0.6}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}><Av name={p.name} sz={44} fs={15}/><div><p style={{fontSize:13,fontWeight:600}}>{p.name}</p><p style={{fontSize:10,color:B.muted}}>Aguardando...</p></div></div>
              </Card>);})}</>}
        </>)}
        <div style={{height:30}}/>
      </div>}
    </div>);
}
