#!/usr/bin/env python3
"""Fix Match4Biz hardcoded dark colors → use B.* theme variables."""

main = '/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx'

with open(main, 'r') as f:
    lines = f.readlines()

print(f"Original: {len(lines)} lines")

# Find component range
start_line = None
end_line = None
for i, l in enumerate(lines):
    if 'function ClientMatch4Biz' in l and start_line is None:
        # Go back to find comment block
        j = i
        while j > 0 and not lines[j-1].strip().startswith('/*'):
            j -= 1
        start_line = j if lines[j].strip().startswith('/*') else i
        # Actually let's just start from the function line itself
        start_line = i
    if i > 18700 and 'function ClientGamification' in l:
        end_line = i
        break

print(f"Component: lines {start_line+1}..{end_line}")

# Extract component section
section = ''.join(lines[start_line:end_line])
original_len = len(section)

import re

# Replacements to apply within ClientMatch4Biz only
# Order matters - more specific first

replacements = [
    # ─── APP/PAGE BACKGROUNDS ───
    ('background:"#000"', 'background:B.bg'),
    ('background:"#000",', 'background:B.bg,'),
    
    # ─── CARD BACKGROUNDS ───
    ('background:"#111"', 'background:B.bgCard'),
    ('background:"#111",', 'background:B.bgCard,'),
    
    # ─── SECONDARY/INPUT BACKGROUNDS ───  
    ('background:"#1a1a1a"', 'background:B.bg'),
    ('background:"#1a1a1a",', 'background:B.bg,'),
    
    # ─── TAB ACTIVE BG ───
    ('background:"#222"', 'background:B.accent+"15"'),
    
    # ─── DIVIDER LINES (thin bg elements) ───
    ('background:"#333"', 'background:B.border'),
    ('background:"#333",', 'background:B.border,'),
    
    # ─── BORDERS ───
    ('"1px solid #222"', '"1px solid "+B.border'),
    ('"1.5px solid #222"', '"1.5px solid "+B.border'),
    ('"2px solid #222"', '"2px solid "+B.border'),
    ('"1px solid #1a1a1a"', '"1px solid "+B.border'),
    ('"1.5px solid #333"', '"1.5px solid "+B.border'),
    ('"2px solid #333"', '"2px solid "+B.border'),
    ('"2px solid transparent"', '"2px solid transparent"'),  # keep as-is
    ('"1px solid #333"', '"1px solid "+B.border'),
    
    # ─── MUTED TEXT COLORS ───
    ('color:"#888"', 'color:B.muted'),
    ('color:"#777"', 'color:B.muted'),
    ('color:"#666"', 'color:B.muted'),
    ('color:"#555"', 'color:B.muted'),
    ('color:"#999"', 'color:B.muted'),
    
    # ─── CONTENT TEXT (lighter in dark, should be text in light) ───
    ('color:"#ccc"', 'color:B.text'),
    
    # ─── STROKE COLORS ───
    ('stroke="#888"', 'stroke={B.muted}'),
    ('stroke:"#888"', 'stroke:B.muted'),

    # ─── GRAB HANDLE ───
    ('fill="#333"', 'fill={B.border}'),
]

# ─── SPECIAL: color:#fff needs context-aware replacement ───
# Avatar initials on colored bg must stay #fff
# Everything else becomes B.text

# Step 1: Protect avatar initials (white text on colored gradient)
avatar_protect = [
    ('color:"#fff" }}>{getInitials', 'color:"__KEEP_WHITE__" }}>{getInitials'),
]

# Step 2: Replace all remaining #fff text → B.text
white_replace = [
    ('color:"#fff"', 'color:B.text'),
]

# Step 3: Restore protected ones
avatar_restore = [
    ('color:"__KEEP_WHITE__"', 'color:"#fff"'),
]

# Apply all replacements
for old, new in avatar_protect:
    section = section.replace(old, new)

for old, new in replacements:
    section = section.replace(old, new)

for old, new in white_replace:
    section = section.replace(old, new)

for old, new in avatar_restore:
    section = section.replace(old, new)

print(f"Section changed: {len(section) - original_len} chars delta")

# ─── Also fix specific patterns that need special handling ───

# The celebration background should stay dramatic (dark overlay effect)
# But for now, let's keep it themed since user wants light

# Fix the tab active bg more precisely - in light mode #222 is too dark
# The tab replacement already handles it: background:B.accent+"15"

# Fix confetti piece background (should stay colorful - already ok, uses named colors)

# ─── Reassemble the file ───
new_lines = lines[:start_line] + [section] + lines[end_line:]
result = ''.join(new_lines)

# Verify
assert 'function ClientMatch4Biz' in result
assert 'function ClientGamification' in result
assert result.count('function ClientMatch4Biz') == 1

# Check no remaining hardcoded dark colors in component
new_section = section
remaining_000 = new_section.count('background:"#000"')
remaining_111 = new_section.count('background:"#111"')
remaining_222_border = new_section.count('"1px solid #222"') + new_section.count('"2px solid #222"')
print(f"Remaining #000 bgs: {remaining_000}")
print(f"Remaining #111 bgs: {remaining_111}")
print(f"Remaining #222 borders: {remaining_222_border}")

# Write
with open(main, 'w') as f:
    f.write(result)

final_lines = result.count('\n') + 1
print(f"Final: {final_lines} lines")
print("SUCCESS - Theme colors fixed!")
