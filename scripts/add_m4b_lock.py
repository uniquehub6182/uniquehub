#!/usr/bin/env python3
"""
Add Match4Biz lock mechanism:
- Lock Match4Biz by default in the client app
- Unlock when all monthly challenges are completed
- Show beautiful lock screen with challenge progress
"""
import os

UH = '/Users/matheusbahiense/Desktop/uniquehub'
JSX = os.path.join(UH, 'src/UniqueHubApp.jsx')

with open(JSX, 'r') as f:
    content = f.read()

original_len = len(content)
print(f"Original: {content.count(chr(10))} lines, {original_len} chars")

# ──────────────────────────────────────────────────────
# 1. Update ClientMatch4Biz function signature to accept clients + demands
# ──────────────────────────────────────────────────────
old_sig = 'function ClientMatch4Biz({ onBack, user }) {'
new_sig = 'function ClientMatch4Biz({ onBack, user, clients, demands }) {'
assert content.count(old_sig) == 1, f"Expected 1 occurrence of sig, found {content.count(old_sig)}"
content = content.replace(old_sig, new_sig)
print("1. Updated ClientMatch4Biz signature ✓")

# ──────────────────────────────────────────────────────
# 2. Add lock screen logic right after the function opening
#    Insert after the signature line, before the existing state
# ──────────────────────────────────────────────────────

# The lock screen code to insert right after the function signature
lock_code = '''
  /* ── M4B LOCK: locked by default, unlock when all monthly challenges completed ── */
  const [m4bMissions, setM4bMissions] = useState([]);
  const [m4bUnlockFlag, setM4bUnlockFlag] = useState(false);
  const [m4bLoading, setM4bLoading] = useState(true);
  const resolvedClientId = (() => {
    const rc = (clients||[]).find(c => (c.contact_email||"").toLowerCase() === (user?.email||"").toLowerCase())
            || (clients||[]).find(c => (c.name||"").toLowerCase() === (user?.company||"").toLowerCase())
            || (clients||[]).find(c => (c.name||"").toLowerCase() === (user?.name||"").toLowerCase());
    return rc?.id || rc?.supaId || null;
  })();
  const currentMonth = new Date().toISOString().slice(0,7); /* YYYY-MM */
  useEffect(() => {
    if (!supabase) { setM4bLoading(false); return; }
    (async () => {
      try {
        /* Load missions + unlock flag */
        const keys = ["gamify_missions", "m4b_unlocks"];
        const { data } = await supabase.from("app_settings").select("key,value").in("key", keys);
        let missions = null, unlocks = null;
        (data||[]).forEach(d => {
          try {
            const v = typeof d.value === "string" ? JSON.parse(d.value) : d.value;
            if (d.key === "gamify_missions") missions = v;
            if (d.key === "m4b_unlocks") unlocks = v;
          } catch {}
        });
        /* Check explicit unlock for this client this month */
        if (unlocks && resolvedClientId) {
          const key = resolvedClientId + "_" + currentMonth;
          if (unlocks[key]) setM4bUnlockFlag(true);
        }
        /* Build missions list */
        const pendingApprovals = (demands||[]).filter(d => d.steps?.client?.mode === "sent_to_client" && !d.steps?.client?.status).length;
        const approvedThisMonth = (demands||[]).filter(d => {
          if (d.steps?.client?.status !== "approved") return false;
          const dt = d.steps?.client?.date || d.updatedAt || "";
          return dt.startsWith && dt.startsWith(currentMonth.replace("-","/").slice(2));
        }).length;
        const defaultM = [
          { id:1, title:"Aprovar todos os posts pendentes", icon:"\\u2705", done: pendingApprovals === 0 && approvedThisMonth > 0 },
          { id:2, title:"Acessar os relatórios de performance", icon:"\\uD83D\\uDCC8", done: false },
          { id:3, title:"Completar 1 curso na Academy", icon:"\\uD83C\\uDF93", done: false },
          { id:4, title:"Responder um briefing de campanha", icon:"\\uD83D\\uDCDD", done: false },
          { id:5, title:"Avaliar o Growth Score do mês", icon:"\\uD83C\\uDFC6", done: false },
        ];
        /* Merge custom missions or use defaults */
        let finalMissions;
        if (missions && missions.length) {
          finalMissions = missions.map((m,i) => ({ id:i+1, title:m.title, icon:m.icon||"\\u2B50", done: false }));
        } else {
          finalMissions = defaultM;
        }
        /* Check per-mission completion from app_settings */
        if (resolvedClientId) {
          try {
            const { data: progressData } = await supabase.from("app_settings").select("value").eq("key", "m4b_progress_" + resolvedClientId).maybeSingle();
            if (progressData?.value) {
              const prog = typeof progressData.value === "string" ? JSON.parse(progressData.value) : progressData.value;
              if (prog.month === currentMonth && prog.done) {
                prog.done.forEach(doneId => {
                  const m = finalMissions.find(mm => mm.id === doneId);
                  if (m) m.done = true;
                });
              }
            }
          } catch {}
        }
        setM4bMissions(finalMissions);
      } catch(e) { console.error("M4B lock check:", e); }
      setM4bLoading(false);
    })();
  }, []);
  const m4bCompleted = m4bMissions.filter(m => m.done).length;
  const m4bTotal = m4bMissions.length || 1;
  const m4bAllDone = m4bCompleted >= m4bTotal && m4bTotal > 0;
  const m4bUnlocked = m4bUnlockFlag || m4bAllDone;

  /* ── Lock Screen ── */
  if (!m4bLoading && !m4bUnlocked) {
    const pct = Math.round((m4bCompleted / m4bTotal) * 100);
    return (
      <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:B.bg, zIndex:50, display:"flex", flexDirection:"column", fontFamily:"'Figtree',sans-serif" }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"calc(env(safe-area-inset-top,0px) + 16px) 20px 12px" }}>
          <button onClick={onBack} style={{ width:38, height:38, borderRadius:"50%", background:B.card, border:`1px solid ${B.border}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <span style={{ fontWeight:700, fontSize:17, color:B.text }}>Match4Biz</span>
        </div>
        {/* Lock Content */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"0 24px 100px", textAlign:"center" }}>
          {/* Lock Icon */}
          <div style={{ width:80, height:80, borderRadius:24, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
          <h2 style={{ fontSize:22, fontWeight:800, color:B.text, margin:"0 0 8px", letterSpacing:"-0.5px" }}>Match4Biz Bloqueado</h2>
          <p style={{ fontSize:14, color:B.muted, margin:"0 0 28px", lineHeight:1.6, maxWidth:320 }}>
            Complete todos os desafios do mês para desbloquear o Match4Biz e conectar com outros clientes da agência.
          </p>
          {/* Progress */}
          <div style={{ width:"100%", maxWidth:360, marginBottom:24 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
              <span style={{ fontSize:12, fontWeight:700, color:B.muted }}>Progresso do mês</span>
              <span style={{ fontSize:12, fontWeight:800, color:B.accent }}>{m4bCompleted}/{m4bTotal}</span>
            </div>
            <div style={{ height:10, borderRadius:5, background:B.border, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${pct}%`, borderRadius:5, background:`linear-gradient(90deg, ${B.accent}, #10B981)`, transition:"width .5s ease" }} />
            </div>
          </div>
          {/* Challenges List */}
          <div style={{ width:"100%", maxWidth:360 }}>
            {m4bMissions.map(m => (
              <div key={m.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", borderRadius:14, background:B.card, border:`1px solid ${m.done ? B.accent+"30" : B.border}`, marginBottom:8 }}>
                <span style={{ fontSize:22, flexShrink:0 }}>{m.icon}</span>
                <span style={{ flex:1, fontSize:13, fontWeight:600, color:B.text, textAlign:"left" }}>{m.title}</span>
                <div style={{ width:24, height:24, borderRadius:"50%", background:m.done ? B.accent : B.border, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {m.done ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg> : <span style={{ fontSize:10, color:B.muted }}>—</span>}
                </div>
              </div>
            ))}
          </div>
          {/* CTA to go to challenges */}
          <button onClick={() => { onBack(); setTimeout(() => { try { document.querySelector('[data-sub="gamify"]')?.click(); } catch {} }, 200); }} style={{ marginTop:20, padding:"14px 28px", borderRadius:14, background:B.accent, color:"#0D0D0D", fontWeight:700, fontSize:14, border:"none", cursor:"pointer", fontFamily:"inherit" }}>
            Ver meus desafios
          </button>
        </div>
      </div>
    );
  }
'''

# Insert the lock code right after the function signature
old_after_sig = '''function ClientMatch4Biz({ onBack, user, clients, demands }) {
  const [accepted, setAccepted] = useState'''
new_after_sig = '''function ClientMatch4Biz({ onBack, user, clients, demands }) {''' + lock_code + '''
  const [accepted, setAccepted] = useState'''

assert content.count(old_after_sig) == 1, f"Expected 1 occurrence, found {content.count(old_after_sig)}"
content = content.replace(old_after_sig, new_after_sig)
print("2. Inserted lock screen code ✓")

# ──────────────────────────────────────────────────────
# 3. Update the render call to pass clients + demands to ClientMatch4Biz
# ──────────────────────────────────────────────────────
old_render = 'sub === "match4biz" ? <ClientMatch4Biz onBack={() => setSub(null)} user={user} />'
new_render = 'sub === "match4biz" ? <ClientMatch4Biz onBack={() => setSub(null)} user={user} clients={clients} demands={demands} />'
assert content.count(old_render) == 1, f"Expected 1 render occurrence, found {content.count(old_render)}"
content = content.replace(old_render, new_render)
print("3. Updated render call with clients+demands props ✓")

# ──────────────────────────────────────────────────────
# Write output
# ──────────────────────────────────────────────────────
with open(JSX, 'w') as f:
    f.write(content)

new_lines = content.count('\n')
print(f"Final: {new_lines} lines, {len(content)} chars")
print(f"Delta: +{len(content) - original_len} chars, +{new_lines - (original_len and content.count(chr(10)))} lines")
print("Done! ✓")
