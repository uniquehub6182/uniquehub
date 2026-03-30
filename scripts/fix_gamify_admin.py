#!/usr/bin/env python3
"""
Fix gamification admin panel:
1. Flickering - move ranking loadRank() from render IIFE to useEffect
2. Save buttons - ensure toast feedback works
3. Missions - add predefined trackable action types
"""
import os

UH = '/Users/matheusbahiense/Desktop/uniquehub'
JSX = os.path.join(UH, 'src/UniqueHubApp.jsx')

with open(JSX, 'r') as f:
    content = f.read()

print(f"Before: {content.count(chr(10))} lines")

# ═══════════════════════════════════════════════════
# FIX 1: Add useEffect for ranking data loading
# Insert after the ranking state variables
# ═══════════════════════════════════════════════════

old_rank_states = '''  const [gAddPtsPillar, setGAddPtsPillar] = useState("execucao");
  const [gAddPtsDesc, setGAddPtsDesc] = useState("");'''

new_rank_states = '''  const [gAddPtsPillar, setGAddPtsPillar] = useState("execucao");
  const [gAddPtsDesc, setGAddPtsDesc] = useState("");
  /* ── Load ranking data via useEffect (not in render) ── */
  useEffect(() => {
    if (gTab !== "ranking" || gRankData || gRankLoading) return;
    setGRankLoading(true);
    (async () => {
      try {
        const { data: scores } = await supabase.from("client_scores").select("*").order("created_at", { ascending: false });
        const byClient = {};
        (scores||[]).forEach(s => {
          if (!byClient[s.client_id]) byClient[s.client_id] = { total:0, execucao:0, estrategia:0, educacao:0, ecossistema:0, crescimento:0, history:[], count:0 };
          byClient[s.client_id].total += Number(s.points);
          if (s.pillar) byClient[s.client_id][s.pillar] = (byClient[s.client_id][s.pillar]||0) + Number(s.points);
          byClient[s.client_id].history.push(s);
          byClient[s.client_id].count++;
        });
        setGRankData(byClient);
      } catch(e) { console.error("Rank load:", e); }
      setGRankLoading(false);
    })();
  }, [gTab, gRankData]);'''

assert content.count(old_rank_states) == 1, f"rank states not found"
content = content.replace(old_rank_states, new_rank_states)
print("1. Added ranking useEffect ✓")


# ═══════════════════════════════════════════════════
# FIX 2: Replace the ranking IIFE with proper JSX
# The IIFE calls loadRank() during render = infinite loop
# ═══════════════════════════════════════════════════

# Find the IIFE block
iife_start = content.index('{gTab === "ranking" && (() => {')
# Find matching closing: })()}  followed by newlines and the zones tab
iife_end_search = '})()}\n'
# Find the end - it's right before {gTab === "zones"
zones_marker = '        {gTab === "zones" && <>'
zones_pos = content.index(zones_marker, iife_start)

# The IIFE block is from iife_start to zones_pos
old_iife = content[iife_start:zones_pos]
print(f"IIFE block: {len(old_iife)} chars, ends before zones tab")

# Build the replacement - flat JSX using already-loaded gRankData
new_ranking = '''{gTab === "ranking" && (() => {
          const cls = (propClients||[]).filter(c => c.name && c.status !== "inativo");
          const ranked = cls.map(c => {
            const cid = c.supaId || c.id;
            const s = gRankData?.[cid] || gRankData?.[c.id] || { total:0, execucao:0, estrategia:0, educacao:0, ecossistema:0, crescimento:0, history:[], count:0 };
            return { ...c, cid, score: Math.min(100, Math.round(s.total)), ...s };
          }).sort((a,b) => b.score - a.score);
          const getZone = (s) => s >= 96 ? "Escala" : s >= 81 ? "Crescimento" : s >= 61 ? "Estratégica" : s >= 41 ? "Organização" : "Estruturação";
          const zoneColor = (s) => s >= 96 ? "#3B82F6" : s >= 81 ? "#10B981" : s >= 61 ? "#BBF246" : s >= 41 ? "#F59E0B" : "#EF4444";
          const pillarNames = { execucao:"Execução", estrategia:"Estratégia", educacao:"Educação", ecossistema:"Ecossistema", crescimento:"Crescimento" };
          const resetClient = async (cid) => {
            if (!confirm("Tem certeza que deseja zerar o score deste cliente?")) return;
            try { await supabase.from("client_scores").delete().eq("client_id", cid); showToast("Score zerado ✓"); setGRankData(null); } catch(e) { showToast("Erro: " + e.message); }
          };
          const resetAll = async () => {
            if (!confirm("ATENÇÃO: Isso vai zerar o ranking de TODOS os clientes. Continuar?")) return;
            if (!confirm("Última chance. Tem certeza absoluta?")) return;
            try { await supabase.from("client_scores").delete().neq("client_id", "___none___"); showToast("Ranking zerado ✓"); setGRankData(null); } catch(e) { showToast("Erro: " + e.message); }
          };
          const addPoints = async (cid) => {
            const pts = parseFloat(gAddPtsVal);
            if (!pts || isNaN(pts)) { showToast("Informe os pontos"); return; }
            try { await supabase.from("client_scores").insert({ client_id: cid, points: pts, pillar: gAddPtsPillar, description: gAddPtsDesc || "Ajuste manual (admin)", action: "admin_adjust" }); showToast((pts > 0 ? "+" : "") + pts + " pontos ✓"); setGAddPtsClient(null); setGAddPtsVal(""); setGAddPtsDesc(""); setGRankData(null); } catch(e) { showToast("Erro: " + e.message); }
          };
          const unlockM4B = async (cid) => {
            const month = new Date().toISOString().slice(0,7);
            try {
              const { data: existing } = await supabase.from("app_settings").select("value").eq("key","m4b_unlocks").maybeSingle();
              let unlocks = {}; if (existing?.value) { try { unlocks = typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value; } catch {} }
              unlocks[cid + "_" + month] = true;
              await supabase.from("app_settings").upsert({ key: "m4b_unlocks", value: unlocks }, { onConflict: "key" });
              showToast("Match4Biz desbloqueado ✓");
            } catch(e) { showToast("Erro: " + e.message); }
          };
          return <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <p style={{ fontSize:11, color:B.muted }}>{ranked.length} clientes ativos</p>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>setGRankData(null)} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid "+B.border, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.muted }}>↻ Atualizar</button>
                <button onClick={resetAll} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid "+(B.red||"#EF4444")+"30", background:(B.red||"#EF4444")+"08", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.red||"#EF4444" }}>Zerar tudo</button>
              </div>
            </div>
            {gRankLoading ? <Card style={{textAlign:"center",padding:30}}><p style={{fontSize:12,color:B.muted}}>Carregando ranking...</p></Card> :
            ranked.length === 0 ? <Card style={{textAlign:"center",padding:30}}><p style={{fontSize:12,color:B.muted}}>Nenhum cliente ativo.</p></Card> :
            ranked.map((c,i) => {
              const expanded = gRankExpanded === c.cid;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i+1)+"°";
              return (
                <Card key={c.cid} style={{ marginBottom:8, borderLeft:"3px solid "+zoneColor(c.score), cursor:"pointer" }} onClick={()=>setGRankExpanded(expanded ? null : c.cid)}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:i<3?22:14, width:32, textAlign:"center", flexShrink:0 }}>{medal}</span>
                    <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700 }}>{c.name}</div><div style={{ fontSize:11, color:B.muted }}>{getZone(c.score)} · {c.count} ações</div></div>
                    <div style={{ textAlign:"right" }}><div style={{ fontSize:20, fontWeight:800, color:zoneColor(c.score) }}>{c.score}</div><div style={{ fontSize:9, color:B.muted }}>pts</div></div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2" style={{ transform:expanded?"rotate(180deg)":"none", transition:"transform .2s" }}><path d="M6 9l6 6 6-6"/></svg>
                  </div>
                  {expanded && <>
                    <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:4, textAlign:"center" }}>
                      {Object.entries(pillarNames).map(([k,v]) => (<div key={k} style={{ padding:"6px 2px", borderRadius:8, background:B.bg, border:"1px solid "+B.border }}><div style={{ fontSize:14, fontWeight:800 }}>{Math.min(100, Math.round(c[k]||0))}</div><div style={{ fontSize:8, color:B.muted, marginTop:2 }}>{v}</div></div>))}
                    </div>
                    {(c.history||[]).length > 0 && <><div style={{ fontSize:10, fontWeight:700, color:B.muted, marginTop:12, marginBottom:6 }}>Últimas ações</div>
                      {(c.history||[]).slice(0,5).map((h,hi) => (<div key={hi} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", fontSize:11 }}><span style={{ color:B.muted }}>{h.description || h.action}</span><span style={{ fontWeight:700, color:h.points > 0 ? (B.green||"#10B981") : (B.red||"#EF4444") }}>{h.points > 0 ? "+" : ""}{h.points}</span></div>))}
                    </>}
                    <div style={{ display:"flex", gap:6, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={e=>{e.stopPropagation();setGAddPtsClient(c.cid);}} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid "+accent+"30", background:accent+"10", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:700, color:accent }}>± Pontos</button>
                      <button onClick={e=>{e.stopPropagation();unlockM4B(c.cid);}} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid "+(B.blue||"#3B82F6")+"30", background:(B.blue||"#3B82F6")+"10", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:700, color:B.blue||"#3B82F6" }}>🔓 Match4Biz</button>
                      <button onClick={e=>{e.stopPropagation();resetClient(c.cid);}} style={{ padding:"6px 12px", borderRadius:8, border:"1px solid "+(B.red||"#EF4444")+"30", background:(B.red||"#EF4444")+"08", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:700, color:B.red||"#EF4444" }}>Zerar score</button>
                    </div>
                    {gAddPtsClient === c.cid && <div onClick={e=>e.stopPropagation()} style={{ marginTop:10, padding:12, borderRadius:12, background:B.bg, border:"1px solid "+B.border }}>
                      <div style={{ fontSize:11, fontWeight:700, marginBottom:8 }}>Adicionar/Remover Pontos</div>
                      <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                        <div style={{ flex:1 }}><label style={{ fontSize:9, color:B.muted }}>Pontos</label><input type="number" value={gAddPtsVal} onChange={e=>setGAddPtsVal(e.target.value)} className="tinput" placeholder="Ex: 5 ou -3" style={{ textAlign:"center" }} /></div>
                        <div style={{ flex:1 }}><label style={{ fontSize:9, color:B.muted }}>Pilar</label><select value={gAddPtsPillar} onChange={e=>setGAddPtsPillar(e.target.value)} className="tinput"><option value="execucao">Execução</option><option value="estrategia">Estratégia</option><option value="crescimento">Crescimento</option><option value="educacao">Educação</option><option value="ecossistema">Ecossistema</option></select></div>
                      </div>
                      <label style={{ fontSize:9, color:B.muted }}>Motivo</label>
                      <input value={gAddPtsDesc} onChange={e=>setGAddPtsDesc(e.target.value)} className="tinput" placeholder="Ex: Bônus por indicação" />
                      <div style={{ display:"flex", gap:6, marginTop:8 }}>
                        <button onClick={()=>setGAddPtsClient(null)} style={{ flex:1, padding:"8px 0", borderRadius:10, border:"1px solid "+B.border, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.muted }}>Cancelar</button>
                        <button onClick={()=>addPoints(c.cid)} style={{ flex:1, padding:"8px 0", borderRadius:10, border:"none", background:accent, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:"#0D0D0D" }}>Confirmar</button>
                      </div>
                    </div>}
                  </>}
                </Card>
              );
            })}
          </>;
        })()}

'''

content = content[:iife_start] + new_ranking + content[zones_pos:]
print("2. Replaced ranking IIFE (removed loadRank from render) ✓")


# ═══════════════════════════════════════════════════
# FIX 3: Add mission action type dropdown 
# Replace free-text missions with predefined trackable types
# ═══════════════════════════════════════════════════

# Replace the missions tab content with version that has action type dropdown
old_missions_tab = '''        {gTab === "missions" && <>
          <p style={{ fontSize:11, color:B.muted, marginBottom:10 }}>Defina as missões mensais que os clientes devem completar.</p>
          {missions.map((m,i) => (
            <Card key={i} style={{ marginBottom:8 }}>
              <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                <div style={{ flex:1 }}><label style={{ fontSize:10, color:B.muted }}>Missão</label><input value={m.title||""} onChange={e=>{const v=e.target.value;const nm=[...missions];nm[i]={...nm[i],title:v};setGMissions(nm);}} className="tinput" /></div>
                <div style={{ width:60 }}><label style={{ fontSize:10, color:B.muted }}>Pontos</label><input type="number" value={m.pts||0} onChange={e=>{const v=parseFloat(e.target.value)||0;const nm=[...missions];nm[i]={...nm[i],pts:v};setGMissions(nm);}} className="tinput" style={{textAlign:"center"}} /></div>
                <button onClick={()=>{const nm=[...missions];nm.splice(i,1);setGMissions(nm);}} style={{ width:30, height:30, borderRadius:8, background:`${B.red||"#FF6B6B"}10`, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:B.red||"#FF6B6B", fontSize:14, fontWeight:900, alignSelf:"flex-end", marginBottom:2 }}>×</button>
              </div>
              <label style={{ fontSize:10, color:B.muted }}>Pilar</label>
              <select value={m.pillar||"execucao"} onChange={e=>{const nm=[...missions];nm[i]={...nm[i],pillar:e.target.value};setGMissions(nm);}} className="tinput">
                <option value="execucao">Execução</option><option value="estrategia">Estratégia</option><option value="crescimento">Crescimento</option><option value="educacao">Educação</option><option value="ecossistema">Ecossistema</option>
              </select>
            </Card>
          ))}
          <button onClick={()=>setGMissions([...missions,{title:"",pts:1,pillar:"execucao"}])} style={{ width:"100%", padding:"10px 0", borderRadius:10, border:`1.5px dashed ${B.border}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.muted, marginBottom:8 }}>+ Adicionar missão</button>
          <button onClick={()=>saveGamify("gamify_missions", missions)} style={{ width:"100%", padding:"14px 0", borderRadius:14, background:accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#0D0D0D" }}>Salvar missões</button>
        </>}'''

new_missions_tab = '''        {gTab === "missions" && (() => {
          const MISSION_TYPES = [
            { value:"approve_posts", label:"Aprovar posts pendentes", icon:"✅", autoTrack:true },
            { value:"complete_course", label:"Completar 1 curso na Academy", icon:"🎓", autoTrack:true },
            { value:"create_event", label:"Criar evento no calendário", icon:"📅", autoTrack:true },
            { value:"view_reports", label:"Acessar relatórios de performance", icon:"📈", autoTrack:true },
            { value:"visit_match4biz", label:"Visitar o Match4Biz", icon:"🤝", autoTrack:true },
            { value:"read_news", label:"Ler uma notícia no News", icon:"📰", autoTrack:true },
            { value:"respond_briefing", label:"Responder briefing de campanha", icon:"📝", autoTrack:true },
            { value:"send_feedback", label:"Enviar feedback/avaliação", icon:"⭐", autoTrack:true },
            { value:"share_content", label:"Compartilhar conteúdo nas redes", icon:"📱", autoTrack:false },
            { value:"referral", label:"Indicar novo cliente", icon:"🎯", autoTrack:false },
            { value:"custom", label:"Personalizado (manual)", icon:"⚡", autoTrack:false },
          ];
          const getMissionLabel = (type) => MISSION_TYPES.find(t => t.value === type)?.label || type;
          const getMissionIcon = (type) => MISSION_TYPES.find(t => t.value === type)?.icon || "⚡";
          const isAuto = (type) => MISSION_TYPES.find(t => t.value === type)?.autoTrack || false;
          return <>
            <p style={{ fontSize:11, color:B.muted, marginBottom:4 }}>Defina as missões mensais para os clientes. Missões automáticas são validadas pelo sistema.</p>
            <p style={{ fontSize:10, color:B.accent, marginBottom:12 }}>🔒 Completar todas as missões desbloqueia o Match4Biz</p>
            {missions.map((m,i) => {
              const mType = m.type || "custom";
              const auto = isAuto(mType);
              return (
              <Card key={i} style={{ marginBottom:8, borderLeft: auto ? "3px solid "+(B.green||"#10B981") : "3px solid "+B.border }}>
                <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:10, color:B.muted }}>Tipo da missão</label>
                    <select value={mType} onChange={e=>{const v=e.target.value;const nm=[...missions];const found=MISSION_TYPES.find(t=>t.value===v);nm[i]={...nm[i],type:v,title:found?.label||nm[i].title,icon:found?.icon||"⚡"};setGMissions(nm);}} className="tinput">
                      {MISSION_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                    </select>
                  </div>
                  <button onClick={()=>{const nm=[...missions];nm.splice(i,1);setGMissions(nm);}} style={{ width:30, height:30, borderRadius:8, background:(B.red||"#FF6B6B")+"10", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", color:B.red||"#FF6B6B", fontSize:14, fontWeight:900, marginTop:18 }}>×</button>
                </div>
                {mType === "custom" && <><label style={{ fontSize:10, color:B.muted, marginTop:6, display:"block" }}>Título personalizado</label>
                <input value={m.title||""} onChange={e=>{const nm=[...missions];nm[i]={...nm[i],title:e.target.value};setGMissions(nm);}} className="tinput" placeholder="Descreva a missão" /></>}
                <div style={{ display:"flex", gap:8, marginTop:6 }}>
                  <div style={{ width:80 }}><label style={{ fontSize:10, color:B.muted }}>Pontos</label><input type="number" value={m.pts||0} onChange={e=>{const nm=[...missions];nm[i]={...nm[i],pts:parseFloat(e.target.value)||0};setGMissions(nm);}} className="tinput" style={{textAlign:"center"}} /></div>
                  <div style={{ flex:1 }}><label style={{ fontSize:10, color:B.muted }}>Pilar</label><select value={m.pillar||"execucao"} onChange={e=>{const nm=[...missions];nm[i]={...nm[i],pillar:e.target.value};setGMissions(nm);}} className="tinput"><option value="execucao">Execução</option><option value="estrategia">Estratégia</option><option value="crescimento">Crescimento</option><option value="educacao">Educação</option><option value="ecossistema">Ecossistema</option></select></div>
                </div>
                <div style={{ marginTop:6, fontSize:10, color: auto ? (B.green||"#10B981") : B.muted }}>
                  {auto ? "✓ Validação automática pelo sistema" : "⚠ Validação manual pelo admin"}
                </div>
              </Card>);
            })}
            <button onClick={()=>setGMissions([...missions,{type:"approve_posts",title:"Aprovar posts pendentes",icon:"✅",pts:1.5,pillar:"execucao"}])} style={{ width:"100%", padding:"10px 0", borderRadius:10, border:"1.5px dashed "+B.border, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.muted, marginBottom:8 }}>+ Adicionar missão</button>
            <button onClick={async()=>{await saveGamify("gamify_missions", missions);}} style={{ width:"100%", padding:"14px 0", borderRadius:14, background:accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#0D0D0D" }}>Salvar missões</button>
          </>;
        })()}'''

assert content.count(old_missions_tab) == 1, f"missions tab not found uniquely, count={content.count(old_missions_tab)}"
content = content.replace(old_missions_tab, new_missions_tab)
print("3. Replaced missions tab with trackable types ✓")

# ═══════════════════════════════════════════════════
# FIX 4: Make zones and podium save buttons async  
# ═══════════════════════════════════════════════════

# Zones save button
old_zones_save = 'onClick={()=>saveGamify("gamify_zones", zones)}'
new_zones_save = 'onClick={async()=>{await saveGamify("gamify_zones", zones);}}'
content = content.replace(old_zones_save, new_zones_save)
print("4. Fixed zones save button ✓")

# Podium save button
old_podium_save = 'onClick={()=>saveGamify("gamify_podium", podium)}'
new_podium_save = 'onClick={async()=>{await saveGamify("gamify_podium", podium);}}'
content = content.replace(old_podium_save, new_podium_save)
print("5. Fixed podium save button ✓")

# ═══════════════════════════════════════════════════
# Write output
# ═══════════════════════════════════════════════════
with open(JSX, 'w') as f:
    f.write(content)

print(f"After: {content.count(chr(10))} lines")
print("All fixes applied! ✓")
