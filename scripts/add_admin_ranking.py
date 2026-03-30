#!/usr/bin/env python3
"""
Add Admin Ranking tab to Gamificação settings.
Features:
- View all clients ranked by Growth Score
- See each client's pillar breakdown
- View mission completion status per client
- Reset individual client scores
- Reset ALL scores
- Manually add/remove points
- Unlock Match4Biz for a client
"""
import os

UH = '/Users/matheusbahiense/Desktop/uniquehub'
JSX = os.path.join(UH, 'src/UniqueHubApp.jsx')

with open(JSX, 'r') as f:
    content = f.read()

print(f"Before: {content.count(chr(10))} lines")

# ─────────────────────────────────────────────
# 1. Add "Ranking" tab to TABS array
# ─────────────────────────────────────────────
old_tabs = 'const TABS = [{k:"zones",l:"Zonas"},{k:"podium",l:"Pódio"},{k:"missions",l:"Missões"}];'
new_tabs = 'const TABS = [{k:"ranking",l:"Ranking"},{k:"zones",l:"Zonas"},{k:"podium",l:"Pódio"},{k:"missions",l:"Missões"}];'
assert content.count(old_tabs) == 1
content = content.replace(old_tabs, new_tabs)
print("1. Added Ranking tab ✓")

# ─────────────────────────────────────────────
# 2. Add ranking state variables after gTab state
# ─────────────────────────────────────────────
old_gtab = '  const [gTab, setGTab] = useState("zones");'
new_gtab = '  const [gTab, setGTab] = useState("ranking");\n  const [gRankData, setGRankData] = useState(null);\n  const [gRankLoading, setGRankLoading] = useState(false);\n  const [gRankExpanded, setGRankExpanded] = useState(null);\n  const [gAddPtsClient, setGAddPtsClient] = useState(null);\n  const [gAddPtsVal, setGAddPtsVal] = useState("");\n  const [gAddPtsPillar, setGAddPtsPillar] = useState("execucao");\n  const [gAddPtsDesc, setGAddPtsDesc] = useState("");'
assert content.count(old_gtab) == 1
content = content.replace(old_gtab, new_gtab)
print("2. Added ranking state ✓")


# ─────────────────────────────────────────────
# 3. Add ranking load function + UI after missions tab block
# ─────────────────────────────────────────────

# Find the end of the missions tab section to insert ranking tab
missions_end_marker = """        {gTab === "missions" && <>"""

# We'll insert the ranking tab BEFORE the zones tab
zones_start = '{gTab === "zones" && <>'
assert content.count(zones_start) == 1

ranking_ui = r'''
        {gTab === "ranking" && (() => {
          /* ── Load ranking data on mount ── */
          const loadRank = async () => {
            setGRankLoading(true);
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
          };
          if (!gRankData && !gRankLoading) loadRank();
          const cls = (propClients||[]).filter(c => c.name && c.status !== "inativo");
          const ranked = cls.map(c => {
            const s = gRankData?.[c.id] || gRankData?.[c.supaId] || { total:0, execucao:0, estrategia:0, educacao:0, ecossistema:0, crescimento:0, history:[], count:0 };
            const cid = c.supaId || c.id;
            return { ...c, cid, score: Math.min(100, Math.round(s.total)), ...s };
          }).sort((a,b) => b.score - a.score);
          const getZone = (s) => s >= 96 ? "Escala" : s >= 81 ? "Crescimento" : s >= 61 ? "Estratégica" : s >= 41 ? "Organização" : "Estruturação";
          const zoneColor = (s) => s >= 96 ? "#3B82F6" : s >= 81 ? "#10B981" : s >= 61 ? "#BBF246" : s >= 41 ? "#F59E0B" : "#EF4444";
          const pillarNames = { execucao:"Execução", estrategia:"Estratégia", educacao:"Educação", ecossistema:"Ecossistema", crescimento:"Crescimento" };
          const resetClient = async (cid) => {
            if (!confirm("Tem certeza que deseja zerar o score deste cliente?")) return;
            try {
              await supabase.from("client_scores").delete().eq("client_id", cid);
              showToast("Score zerado ✓");
              setGRankData(null);
            } catch(e) { showToast("Erro: " + e.message); }
          };
          const resetAll = async () => {
            if (!confirm("ATENÇÃO: Isso vai zerar o ranking de TODOS os clientes. Continuar?")) return;
            if (!confirm("Última chance. Tem certeza absoluta?")) return;
            try {
              await supabase.from("client_scores").delete().neq("client_id", "___none___");
              showToast("Ranking zerado ✓");
              setGRankData(null);
            } catch(e) { showToast("Erro: " + e.message); }
          };
          const addPoints = async (cid) => {
            const pts = parseFloat(gAddPtsVal);
            if (!pts || isNaN(pts)) { showToast("Informe os pontos"); return; }
            try {
              await supabase.from("client_scores").insert({ client_id: cid, points: pts, pillar: gAddPtsPillar, description: gAddPtsDesc || "Ajuste manual (admin)", action: "admin_adjust" });
              showToast(`${pts > 0 ? "+" : ""}${pts} pontos adicionados ✓`);
              setGAddPtsClient(null); setGAddPtsVal(""); setGAddPtsDesc("");
              setGRankData(null);
            } catch(e) { showToast("Erro: " + e.message); }
          };
          const unlockM4B = async (cid) => {
            const month = new Date().toISOString().slice(0,7);
            try {
              const { data: existing } = await supabase.from("app_settings").select("value").eq("key","m4b_unlocks").maybeSingle();
              let unlocks = {};
              if (existing?.value) { try { unlocks = typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value; } catch {} }
              unlocks[cid + "_" + month] = true;
              await supabase.from("app_settings").upsert({ key: "m4b_unlocks", value: unlocks }, { onConflict: "key" });
              showToast("Match4Biz desbloqueado ✓");
            } catch(e) { showToast("Erro: " + e.message); }
          };
          return <>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <p style={{ fontSize:11, color:B.muted }}>Ranking de {ranked.length} clientes ativos</p>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>setGRankData(null)} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${B.border}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.muted }}>↻ Atualizar</button>
                <button onClick={resetAll} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${B.red||"#EF4444"}30`, background:`${B.red||"#EF4444"}08`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.red||"#EF4444" }}>Zerar tudo</button>
              </div>
            </div>
            {gRankLoading ? <Card style={{textAlign:"center",padding:30}}><p style={{fontSize:12,color:B.muted}}>Carregando ranking...</p></Card> :
            ranked.length === 0 ? <Card style={{textAlign:"center",padding:30}}><p style={{fontSize:12,color:B.muted}}>Nenhum cliente ativo encontrado.</p></Card> :
            ranked.map((c,i) => {
              const expanded = gRankExpanded === c.cid;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}°`;
              return (
                <Card key={c.cid} style={{ marginBottom:8, borderLeft:`3px solid ${zoneColor(c.score)}`, cursor:"pointer" }} onClick={()=>setGRankExpanded(expanded ? null : c.cid)}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:i<3?22:14, width:32, textAlign:"center", flexShrink:0 }}>{medal}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{c.name}</div>
                      <div style={{ fontSize:11, color:B.muted }}>{getZone(c.score)} · {c.count} ações</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:20, fontWeight:800, color:zoneColor(c.score) }}>{c.score}</div>
                      <div style={{ fontSize:9, color:B.muted }}>pts</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2" style={{ transform:expanded?"rotate(180deg)":"none", transition:"transform .2s" }}><path d="M6 9l6 6 6-6"/></svg>
                  </div>
                  {expanded && <>
                    {/* Pillar breakdown */}
                    <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:4, textAlign:"center" }}>
                      {Object.entries(pillarNames).map(([k,v]) => (
                        <div key={k} style={{ padding:"6px 2px", borderRadius:8, background:B.bg, border:`1px solid ${B.border}` }}>
                          <div style={{ fontSize:14, fontWeight:800 }}>{Math.min(100, Math.round(c[k]||0))}</div>
                          <div style={{ fontSize:8, color:B.muted, marginTop:2 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    {/* Recent actions */}
                    {(c.history||[]).length > 0 && <>
                      <div style={{ fontSize:10, fontWeight:700, color:B.muted, marginTop:12, marginBottom:6 }}>Últimas ações</div>
                      {(c.history||[]).slice(0,5).map((h,hi) => (
                        <div key={hi} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:hi<4?`1px solid ${B.border}00`:"none", fontSize:11 }}>
                          <span style={{ color:B.muted }}>{h.description || h.action}</span>
                          <span style={{ fontWeight:700, color:h.points > 0 ? (B.green||"#10B981") : (B.red||"#EF4444") }}>{h.points > 0 ? "+" : ""}{h.points}</span>
                        </div>
                      ))}
                    </>}
                    {/* Admin actions */}
                    <div style={{ display:"flex", gap:6, marginTop:12, flexWrap:"wrap" }}>
                      <button onClick={e=>{e.stopPropagation();setGAddPtsClient(c.cid);}} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${accent}30`, background:`${accent}10`, cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:700, color:accent }}>± Pontos</button>
                      <button onClick={e=>{e.stopPropagation();unlockM4B(c.cid);}} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${B.blue||"#3B82F6"}30`, background:`${B.blue||"#3B82F6"}10`, cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:700, color:B.blue||"#3B82F6" }}>🔓 Match4Biz</button>
                      <button onClick={e=>{e.stopPropagation();resetClient(c.cid);}} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${B.red||"#EF4444"}30`, background:`${B.red||"#EF4444"}08`, cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:700, color:B.red||"#EF4444" }}>Zerar score</button>
                    </div>
                    {/* Add points modal */}
                    {gAddPtsClient === c.cid && <div onClick={e=>e.stopPropagation()} style={{ marginTop:10, padding:12, borderRadius:12, background:B.bg, border:`1px solid ${B.border}` }}>
                      <div style={{ fontSize:11, fontWeight:700, marginBottom:8 }}>Adicionar/Remover Pontos</div>
                      <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                        <div style={{ flex:1 }}><label style={{ fontSize:9, color:B.muted }}>Pontos</label><input type="number" value={gAddPtsVal} onChange={e=>setGAddPtsVal(e.target.value)} className="tinput" placeholder="Ex: 5 ou -3" style={{ textAlign:"center" }} /></div>
                        <div style={{ flex:1 }}><label style={{ fontSize:9, color:B.muted }}>Pilar</label><select value={gAddPtsPillar} onChange={e=>setGAddPtsPillar(e.target.value)} className="tinput"><option value="execucao">Execução</option><option value="estrategia">Estratégia</option><option value="crescimento">Crescimento</option><option value="educacao">Educação</option><option value="ecossistema">Ecossistema</option></select></div>
                      </div>
                      <label style={{ fontSize:9, color:B.muted }}>Motivo (opcional)</label>
                      <input value={gAddPtsDesc} onChange={e=>setGAddPtsDesc(e.target.value)} className="tinput" placeholder="Ex: Bônus por indicação" />
                      <div style={{ display:"flex", gap:6, marginTop:8 }}>
                        <button onClick={()=>setGAddPtsClient(null)} style={{ flex:1, padding:"8px 0", borderRadius:10, border:`1px solid ${B.border}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.muted }}>Cancelar</button>
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

content = content.replace('        ' + zones_start, ranking_ui + '        ' + zones_start)
print("3. Added ranking UI ✓")

# ─────────────────────────────────────────────
# Write
# ─────────────────────────────────────────────
with open(JSX, 'w') as f:
    f.write(content)

print(f"After: {content.count(chr(10))} lines")
print("Done! ✓")
