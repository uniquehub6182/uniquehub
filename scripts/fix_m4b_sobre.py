#!/usr/bin/env python3
"""
Fix 1: Match4Biz crash - move lock screen AFTER all hooks (not before)
Fix 2: Sobre crash - guard aboutItems.map against null
"""
import os

UH = '/Users/matheusbahiense/Desktop/uniquehub'
JSX = os.path.join(UH, 'src/UniqueHubApp.jsx')

with open(JSX, 'r') as f:
    content = f.read()

lines_before = content.count('\n')
print(f"Before: {lines_before} lines")

# ─────────────────────────────────────────────
# FIX 1: Match4Biz - Extract the lock screen block
# and move it to just before the existing "if (!accepted)" return
# ─────────────────────────────────────────────

# Find the lock screen block boundaries
lock_start_marker = "  /* ── Lock Screen ── */"
lock_end_marker = "\n\n  const [accepted, setAccepted]"

lock_start = content.index(lock_start_marker)
lock_end = content.index(lock_end_marker, lock_start)

# Extract the lock screen code
lock_block = content[lock_start:lock_end]
print(f"Lock block extracted: {len(lock_block)} chars")

# Remove lock block from original position
content = content[:lock_start] + content[lock_end:]
print("Removed lock block from original position ✓")

# Now insert it just before "if (!accepted) return ("
insert_marker = "  if (!accepted) return ("
insert_pos = content.index(insert_marker)
content = content[:insert_pos] + lock_block + "\n\n  " + content[insert_pos:]
print("Inserted lock block before 'if (!accepted)' ✓")

# ─────────────────────────────────────────────
# FIX 2: Sobre crash - guard aboutItems?.map
# ─────────────────────────────────────────────
# The crash happens because aboutItems is null on first render
# Find the line: {aboutItems.map((item, i) => (
old_about = "aboutItems.map((item, i) =>"
new_about = "(aboutItems||[]).map((item, i) =>"
count = content.count(old_about)
print(f"Found {count} occurrences of aboutItems.map")
content = content.replace(old_about, new_about)
print(f"Fixed aboutItems null guard ✓")

# ─────────────────────────────────────────────
# Write
# ─────────────────────────────────────────────
with open(JSX, 'w') as f:
    f.write(content)

lines_after = content.count('\n')
print(f"After: {lines_after} lines")
print("All fixes applied! ✓")
