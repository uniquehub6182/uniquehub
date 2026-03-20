#!/usr/bin/env python3
"""Replace ClientMatch4Biz using exact line numbers."""

main = '/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx'
new_comp = '/Users/matheusbahiense/Desktop/uniquehub/src/m4b_new.jsx'

with open(main, 'r') as f:
    lines = f.readlines()

with open(new_comp, 'r') as f:
    new_code = f.read()

print(f"Original: {len(lines)} lines")

# Lines 18787..19152 (1-indexed) = 0-indexed 18786..19151
start_0 = 18786
end_0 = 19151

# Verify boundaries
print(f"Start: {lines[start_0][:50].strip()}")
print(f"End:   {lines[end_0][:20].strip()}")
print(f"Next:  {lines[end_0+3][:50].strip()}")

assert lines[start_0].strip().startswith('/*'), f"Bad start: {lines[start_0][:40]}"
assert lines[end_0].strip() == '}', f"Bad end: {lines[end_0].strip()}"
assert 'ClientGamification' in lines[end_0+3], f"Bad next: {lines[end_0+3][:40]}"

removed = end_0 - start_0 + 1
print(f"Removing {removed} lines ({start_0+1}..{end_0+1})")

# Build new file: keep everything before, insert new, keep everything after
before = lines[:start_0]
after = lines[end_0+1:]
new_lines = before + [new_code.rstrip() + '\n'] + after
result = ''.join(new_lines)

# Safety checks
assert 'function ClientMatch4Biz' in result
assert 'function ClientGamification' in result
assert 'buyStep' in result
assert 'm4b-overlay-enter' in result
assert result.count('function ClientMatch4Biz') == 1

# Backup
with open(main + '.bak_m4b', 'w') as f:
    f.write(''.join(lines))

# Write
with open(main, 'w') as f:
    f.write(result)

new_count = result.count('\n') + 1
print(f"New: {new_count} lines (delta: {new_count - len(lines)})")
print("SUCCESS - All checks passed!")
