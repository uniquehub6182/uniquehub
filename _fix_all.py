with open("/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx", "r") as f:
    c = f.read()
print(f"Original: {len(c.splitlines())} lines")
changes = 0

# ═══════════════════════════════════════════════════════
# FIX 1: CSS — Constrain ALL internal pages on desktop
# ═══════════════════════════════════════════════════════
old_css = "html.uh-desktop .content{overflow:visible!important;height:auto!important;max-height:none!important;padding:0 0 120px!important;max-width:100%!important;margin:0 auto!important;box-sizing:border-box!important}"
new_css = "html.uh-desktop .content{overflow:visible!important;height:auto!important;max-height:none!important;padding:0 0 120px!important;max-width:1000px!important;margin:0 auto!important;box-sizing:border-box!important}\nhtml.uh-desktop .content:has(.desktop-dash){max-width:100%!important;padding:0 0 120px!important}"
if old_css in c:
    c = c.replace(old_css, new_css, 1)
    changes += 1
    print("OK 1: CSS — sub-pages constrained to 1000px, dashboard exempt")
else:
    print("FAIL 1: CSS not found")

# ═══════════════════════════════════════════════════════
# FIX 2: AI widget — remove dead local function, fix refs
# ═══════════════════════════════════════════════════════
old_ai_fn = '''              if (pk === "ai") {
                const quickPrompts = ["Crie uma legenda para post de produto","Ideia de Reels para engajamento","Estratégia de Stories para esta semana","Hashtags para Instagram"];
                const askAi = async (q) => {
                  if (!q.trim()||dAiLoad) return;
                  setAiLoad(true); setAiRes("");
                  try {
                    const gKey = await supaGetSetting("gemini_key"); if(!gKey){setDAiRes("Chave de IA não configurada. Configure em Configurações → Assistente IA.");setDAiLoad(false);return;} const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key="+gKey, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({contents:[{parts:[{text:"Você é um assistente de marketing digital. Responda de forma concisa e prática em português Pergunta: "+q}]}]}) });
                    const data = await res.json();
                    const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta";
                    setAiRes(txt);
                  } catch(e) { setAiRes("Erro: "+e.message); }
                  setAiLoad(false);
                };'''
new_ai_fn = '''              if (pk === "ai") {
                const quickPrompts = ["Crie uma legenda para post de produto","Ideia de Reels para engajamento","Estratégia de Stories para esta semana","Hashtags para Instagram"];'''
if old_ai_fn in c:
    c = c.replace(old_ai_fn, new_ai_fn, 1)
    changes += 1
    print("OK 2: AI widget — removed dead local askAi function")
else:
    print("FAIL 2: AI dead function not found")

# ═══════════════════════════════════════════════════════
# FIX 3: Content widget — show only 2 posts, bigger imgs
# ═══════════════════════════════════════════════════════
old_content_shown = "                const others = demands.filter(d => !(d.steps?.client?.mode === \"sent_to_client\" && !d.steps?.client?.status)).slice(0, 4 - Math.min(pending.length, 2));\n                const shown = [...pending.slice(0,2), ...others];"
new_content_shown = "                const others = demands.filter(d => !(d.steps?.client?.mode === \"sent_to_client\" && !d.steps?.client?.status)).slice(0, 2 - Math.min(pending.length, 2));\n                const shown = [...pending.slice(0,2), ...others].slice(0,2);"
if old_content_shown in c:
    c = c.replace(old_content_shown, new_content_shown, 1)
    changes += 1
    print("OK 3a: Content widget — max 2 posts")
else:
    print("FAIL 3a: Content shown not found")

# Make content images taller
old_img_h = "style={{cursor:\"pointer\",position:\"relative\",height:140,overflow:\"hidden\"}}"
new_img_h = "style={{cursor:\"pointer\",position:\"relative\",height:180,overflow:\"hidden\"}}"
if old_img_h in c:
    c = c.replace(old_img_h, new_img_h, 1)
    changes += 1
    print("OK 3b: Content widget — taller images (180px)")
else:
    print("FAIL 3b: Image height not found")

# ═══════════════════════════════════════════════════════
# FIX 4: dAskAi function — fix error handling
# ═══════════════════════════════════════════════════════
old_dask = '  const dAskAi = async (q) => {\n    if (!q.trim()||dAiLoad) return;\n    setDAiLoad(true); setDAiRes("");'
new_dask = '  const dAskAi = async (q) => {\n    if (!q.trim()||dAiLoad) return;\n    setDAiLoad(true); setDAiRes(""); setDAiQ(q);'
if old_dask in c:
    c = c.replace(old_dask, new_dask, 1)
    changes += 1
    print("OK 4: dAskAi — auto-set input on call")
else:
    print("FAIL 4: dAskAi not found")

# ═══════════════════════════════════════════════════════
# FIX 5: Also fix dAskAi error — setDAiRes was wrong
# ═══════════════════════════════════════════════════════
# Check if the component-level function has correct names
old_dask_res = '      setDAiRes(data?.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta");'
new_dask_res = '      setDAiRes(data?.candidates?.[0]?.content?.parts?.[0]?.text || "Não consegui gerar resposta. Verifique a chave de IA nas configurações.");'
if old_dask_res in c:
    c = c.replace(old_dask_res, new_dask_res, 1)
    changes += 1
    print("OK 5: Better error message for empty AI response")
else:
    print("FAIL 5: dAskAi response line not found")

# ═══════════════════════════════════════════════════════
# FIX 6: Also add sub-page .app constraint in client CSS
# ═══════════════════════════════════════════════════════
# The sub-pages create their own .app wrapper which goes full width
# Add constraint for sub-page apps
old_desktop_app = 'html.uh-desktop .app,html.uh-desktop .screen{position:relative!important;height:auto!important;min-height:100vh!important;overflow:visible!important;inset:auto!important}'
new_desktop_app = 'html.uh-desktop .app,html.uh-desktop .screen{position:relative!important;height:auto!important;min-height:100vh!important;overflow:visible!important;inset:auto!important;max-width:1200px!important;margin-left:auto!important;margin-right:auto!important}'
if old_desktop_app in c:
    c = c.replace(old_desktop_app, new_desktop_app, 1)
    changes += 1
    print("OK 6: .app/.screen constrained to 1200px on desktop")
else:
    print("FAIL 6: .app CSS not found")

with open("/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx", "w") as f:
    f.write(c)
print(f"\nTotal: {changes} changes, {len(c.splitlines())} lines")
