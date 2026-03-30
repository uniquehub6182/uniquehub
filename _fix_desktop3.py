import re

with open("/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx", "r") as f:
    code = f.read()

original_len = len(code.split("\n"))
print(f"Original: {original_len} lines")
changes = 0

# ═══ FIX 1: Wrap renderHome return in desktop-dash class ═══
old_return = '''  return <>
    {/* ═══ AGENCY-STYLE HEADER ═══ */}
    <div style={{ margin:"-14px -16px 0", background:H.bg, borderRadius:"0 0 40px 40px", paddingTop:"calc(env(safe-area-inset-top, 0px) + 16px)", paddingBottom:28, boxShadow:"0 6px 32px rgba(0,0,0,0.18)" }}>
      <div style={{ padding:"14px 24px 0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>'''

new_return = '''  return <div className={isDesktop?"desktop-dash":""} style={isDesktop?{maxWidth:1440,margin:"0 auto",paddingBottom:80}:{}}>
    {/* ═══ AGENCY-STYLE HEADER ═══ */}
    <div style={{ margin:isDesktop?"0":"-14px -16px 0", background:H.bg, borderRadius:isDesktop?"0 0 24px 24px":"0 0 40px 40px", paddingTop:isDesktop?"24px":"calc(env(safe-area-inset-top, 0px) + 16px)", paddingBottom:28, boxShadow:"0 6px 32px rgba(0,0,0,0.18)" }}>
      <div style={{ padding:isDesktop?"0 32px":"14px 24px 0", maxWidth:isDesktop?1440:"none", margin:isDesktop?"0 auto":"0", display:"flex", justifyContent:"space-between", alignItems:"center" }}>'''

if old_return in code:
    code = code.replace(old_return, new_return)
    changes += 1
    print("✅ Fix 1: Wrapped renderHome in desktop-dash")
else:
    print("❌ Fix 1: renderHome return not found")

# ═══ FIX 2: Close the desktop-dash div at the end of renderHome ═══
# Find the end marker of renderHome - there's a `<div style={{ height:16 }} />` near the end
old_end = '''    <div style={{ height:16 }} />
    {showCfg && <>'''
new_end = '''    <div style={{ height:16 }} />
    </div>
    {showCfg && <>'''

# Count occurrences to make sure we find the right one
count = code.count(old_end)
if count == 0:
    # Try alternate end
    old_end = '''    <div style={{ height:16 }} />\n'''
    idx = code.find(old_end, code.find('renderHome'))
    if idx > -1:
        print(f"  Found alternate end at offset {idx}")
    print("❌ Fix 2: renderHome end not found, trying alternate approach")
else:
    print(f"  Found {count} occurrences of end marker")

if old_end in code:
    code = code.replace(old_end, new_end, 1)
    changes += 1
    print("✅ Fix 2: Closed desktop-dash div")
else:
    print("❌ Fix 2: Could not close desktop-dash div")

# ═══ FIX 2: Close desktop-dash div ═══
# The renderHome ends with `</>; }` — change to `</div>; }`
old_close = '  </>; }\n\n      const renderContent'
new_close = '  </div>; }\n\n      const renderContent'

if old_close in code:
    code = code.replace(old_close, new_close, 1)
    changes += 1
    print("✅ Fix 2: Closed desktop-dash div")
else:
    print("❌ Fix 2: renderHome close not found")

# ═══ FIX 3: Add maxWidth to inner sections (search, appointments, cards, pills) ═══
# The inner header sections (search, appointments, cards) need max-width on desktop too
# They already have padding:"16px 24px 0" etc — just need to add isDesktop awareness

# Search bar
old_search = 'style={{ margin:"16px 24px 0", background:H.srch'
new_search = 'style={{ margin:isDesktop?"16px 32px 0":"16px 24px 0", background:H.srch'
if old_search in code:
    code = code.replace(old_search, new_search, 1)
    changes += 1
    print("✅ Fix 3a: Search bar desktop margin")
else:
    print("❌ Fix 3a: Search bar not found")

# Appointments + Clock row
old_appt = 'style={{ display:"flex", alignItems:"stretch", gap:10, padding:"14px 24px 0" }}'
new_appt = 'style={{ display:"flex", alignItems:"stretch", gap:10, padding:isDesktop?"14px 32px 0":"14px 24px 0" }}'
if old_appt in code:
    code = code.replace(old_appt, new_appt, 1)
    changes += 1
    print("✅ Fix 3b: Appointments row desktop padding")
else:
    print("❌ Fix 3b: Appointments row not found")

# Cards grid
old_cards = 'style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, padding:"16px 24px 0" }}'
new_cards = 'style={{ display:"grid", gridTemplateColumns:isDesktop?"repeat(4,1fr)":"1fr 1fr", gap:12, padding:isDesktop?"16px 32px 0":"16px 24px 0" }}'
if old_cards in code:
    code = code.replace(old_cards, new_cards, 1)
    changes += 1
    print("✅ Fix 3c: Cards grid - 4 cols on desktop")
else:
    print("❌ Fix 3c: Cards grid not found")

# ═══ FIX 4: Pills row — wrap on desktop ═══
old_pills = 'style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, scrollbarWidth:"none" }}>'
new_pills = 'style={{ display:"flex", gap:8, overflowX:isDesktop?"visible":"auto", flexWrap:isDesktop?"wrap":"nowrap", paddingBottom:4, scrollbarWidth:"none" }}>'
if old_pills in code:
    code = code.replace(old_pills, new_pills, 1)
    changes += 1
    print("✅ Fix 4: Pills wrap on desktop")
else:
    print("❌ Fix 4: Pills row not found")

# ═══ FIX 5: Sections container padding on desktop ═══
old_sections = '''    {/* SECTIONS */}
    <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:8 }}>'''
new_sections = '''    {/* SECTIONS */}
    <div style={{ display:"flex", flexDirection:"column", gap:isDesktop?20:8, marginTop:isDesktop?20:8, padding:isDesktop?"0 8px":0 }}>'''
if old_sections in code:
    code = code.replace(old_sections, new_sections, 1)
    changes += 1
    print("✅ Fix 5: Sections container desktop spacing")
else:
    print("❌ Fix 5: Sections container not found")

# ═══ FIX 6: Add desktop-dash CSS to client injected styles ═══
old_bnav_css = 'html.uh-desktop .bnav{position:fixed!important;bottom:16px!important;left:50%!important;transform:translateX(-50%)!important;z-index:100!important}'
new_bnav_css = '''html.uh-desktop .bnav{position:fixed!important;bottom:16px!important;left:50%!important;transform:translateX(-50%)!important;z-index:100!important}
html.uh-desktop .desktop-dash{max-width:1440px!important;margin:0 auto!important}
html.uh-desktop .content>div:has(.desktop-dash){max-width:100%!important;padding:0!important}
html.uh-desktop .d-dash-grid{display:grid!important;grid-template-columns:1fr 1fr!important;gap:20px!important;align-items:start!important}'''

if old_bnav_css in code:
    code = code.replace(old_bnav_css, new_bnav_css)
    changes += 1
    print("✅ Fix 6: Added desktop-dash CSS rules")
else:
    print("❌ Fix 6: bnav CSS not found")

with open("/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx", "w") as f:
    f.write(code)

new_len = len(code.split("\n"))
print(f"\nTotal changes: {changes}")
print(f"New: {new_len} lines (diff: {new_len - original_len})")
