#!/usr/bin/env python3
"""
Remove 'production' stage from video/Reels flow.
- Remove from VIDEO_STAGES
- Remove production renderSection block in detail view
- Remove from KANBAN_STAGES
- Remove production kanban card rendering
- Remove from fileFields
"""
import os

JSX = '/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx'

with open(JSX, 'r') as f:
    content = f.read()

print(f"Before: {content.count(chr(10))} lines")

# ═══════════════════════════════════════
# 1. VIDEO_STAGES: remove "production"
# ═══════════════════════════════════════
old = 'const VIDEO_STAGES = ["idea","briefing","design","production","caption","review","client","scheduled","published"];'
new = 'const VIDEO_STAGES = ["idea","briefing","design","caption","review","client","scheduled","published"];'
assert content.count(old) == 1, f"VIDEO_STAGES not found uniquely: {content.count(old)}"
content = content.replace(old, new)
print("1. Removed production from VIDEO_STAGES ✓")

# ═══════════════════════════════════════
# 2. Remove production from forEach array (line ~504)
# ═══════════════════════════════════════
old2 = '["idea","briefing","design","caption","review","client","production","editing"].forEach'
new2 = '["idea","briefing","design","caption","review","client","editing"].forEach'
assert content.count(old2) == 1, f"forEach not found: {content.count(old2)}"
content = content.replace(old2, new2)
print("2. Removed production from forEach ✓")

# ═══════════════════════════════════════
# 3. Remove the entire production renderSection block
# ═══════════════════════════════════════
prod_start = '          {/* ── 3b. PRODUÇÃO (Vídeo — Audiovisual) ── */}\n          {sel.type === "video" && renderSection("production", <>'
prod_end = '          </>)}\n\n          {/* ── 3c. EDIÇÃO (Vídeo — Editor) ── */}'

start_idx = content.index(prod_start)
end_idx = content.index(prod_end, start_idx)
# Remove from prod_start to just before the editing comment
content = content[:start_idx] + '          ' + content[end_idx + len('          </>)\n\n'):]
print("3. Removed production renderSection block ✓")

# ═══════════════════════════════════════
# 4. Remove "production" from KANBAN_STAGES
# ═══════════════════════════════════════
old4 = '"idea","planning","briefing","creation","design","production","editing","caption","review","execution","client","ajuste","scheduled","published","completed"'
new4 = '"idea","planning","briefing","creation","design","editing","caption","review","execution","client","ajuste","scheduled","published","completed"'
assert content.count(old4) == 1, f"KANBAN_STAGES not found: {content.count(old4)}"
content = content.replace(old4, new4)
print("4. Removed production from KANBAN_STAGES ✓")

# ═══════════════════════════════════════
# 5. Remove production kanban card rendering
# Find the d.stage==="production" block in the kanban
# ═══════════════════════════════════════
prod_kanban_start = '{d.stage==="production"&&<div style={{marginBottom:8}}>'
prod_kanban_idx = content.index(prod_kanban_start)
# Find the end - it ends with </div>} followed by newline
# Search for the closing pattern
search_from = prod_kanban_idx
# The block ends with ...</label></div>}
# Find next line that starts with a new kanban stage check or other content
# The production block is one giant line, find the end of the line
line_end = content.index('\n', prod_kanban_idx)
# Remove the entire line
content = content[:prod_kanban_idx] + content[line_end+1:]
print("5. Removed production kanban card rendering ✓")

# ═══════════════════════════════════════
# 6. Remove "production" from fileFields
# ═══════════════════════════════════════
old6 = 'const fileFields=["design","production","editing"];'
new6 = 'const fileFields=["design","editing"];'
assert content.count(old6) == 1, f"fileFields not found: {content.count(old6)}"
content = content.replace(old6, new6)
print("6. Removed production from fileFields ✓")

# ═══════════════════════════════════════
# Write output
# ═══════════════════════════════════════
with open(JSX, 'w') as f:
    f.write(content)

print(f"After: {content.count(chr(10))} lines")
print("Done! ✓")
