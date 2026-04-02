import sys

FILE = "/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx"
with open(FILE, "r") as f:
    content = f.read()

original_len = len(content)
changes = 0

# 1. Add IC.presentations icon (after gamify icon)
old1 = '  gamify: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>,'
new1 = old1 + '\n  presentations: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 9l3 3 7-7"/></svg>,'
if old1 in content:
    content = content.replace(old1, new1, 1)
    changes += 1
    print("1. IC.presentations icon added")
else:
    print("1. FAILED - gamify icon not found")

# 2. Add to sidebar items list (after notes)
old2 = '  { k: "notes", l: "Notas", i: (c) => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg> },'
new2 = old2 + '\n  { k: "presentations", l: "Apresentações", i: IC.presentations },'
if old2 in content:
    content = content.replace(old2, new2, 1)
    changes += 1
    print("2. Sidebar item added")
else:
    print("2. FAILED - notes sidebar item not found")

# 3. Add to moreItems (after notes)
old3 = '{ k:"notes", l:"Notas" }, { k:"gamify", l:"Ranking" }'
new3 = '{ k:"notes", l:"Notas" }, { k:"presentations", l:"Apresentações" }, { k:"gamify", l:"Ranking" }'
if old3 in content:
    content = content.replace(old3, new3, 1)
    changes += 1
    print("3. moreItems added")
else:
    print("3. FAILED - moreItems not found")

# 4. Add to searchItems (after Notas)
old4 = '{l:"Notas",k:"notes"},{l:"Academy",k:"academy"}'
new4 = '{l:"Notas",k:"notes"},{l:"Apresentações",k:"presentations"},{l:"Academy",k:"academy"}'
if old4 in content:
    content = content.replace(old4, new4, 1)
    changes += 1
    print("4. searchItems added")
else:
    # Try alternate pattern
    old4b = "{l:\"Notas\",k:\"notes\"}"
    idx4 = content.find(old4b)
    if idx4 > 0:
        print("4. PARTIAL - found Notas in searchItems but pattern slightly different, skipping (add manually)")
    else:
        print("4. FAILED - searchItems not found")

# 5. Add to MENU_ITEMS (after Feed Planner)
old5 = '    { k:"feedplanner", l:"Feed Planner", d:"Simulador de feed do Instagram", ic:IC.feed },'
new5 = old5 + '\n    { k:"presentations", l:"Apresentações", d:"Apresentações para clientes", ic:IC.presentations },'
if old5 in content:
    content = content.replace(old5, new5, 1)
    changes += 1
    print("5. MENU_ITEMS added")
else:
    print("5. FAILED - MENU_ITEMS feedplanner not found")

# 6. Add sub routing (after feedplanner line)
old6 = '        {sub === "feedplanner" && <FeedPlannerPage onBack={() => setSub(null)} clients={sharedClients} user={user} />}'
new6 = old6 + '\n        {sub === "presentations" && <PresentationsPage onBack={() => setSub(null)} clients={sharedClients} user={user} demands={sharedDemands} />}'
if old6 in content:
    content = content.replace(old6, new6, 1)
    changes += 1
    print("6. Sub routing added")
else:
    print("6. FAILED - feedplanner sub routing not found")

# 7. Add "presentations" to the goSub nav array (where it lists sub pages for bottom nav)
old7 = '"clients", "checkin", "academy", "financial", "calendar", "library", "reports", "news", "ideas", "gamify", "match4biz", "ai", "help", "search", "settings", "team", "inbox", "notes"'
new7 = '"clients", "checkin", "academy", "financial", "calendar", "library", "reports", "news", "ideas", "gamify", "match4biz", "ai", "help", "search", "settings", "team", "inbox", "notes", "presentations"'
if old7 in content:
    content = content.replace(old7, new7, 1)
    changes += 1
    print("7. goSub array updated")
else:
    print("7. FAILED - goSub array not found")

print(f"\n=== {changes}/7 changes applied ===")
print(f"Original length: {original_len}")
print(f"New length: {len(content)}")

with open(FILE, "w") as f:
    f.write(content)

print("File saved!")
