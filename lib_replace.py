import sys

FILE = "/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx"
NEW_FILE = "/Users/matheusbahiense/Desktop/uniquehub/lib_new.jsx"

with open(FILE, "r") as f:
    content = f.read()

with open(NEW_FILE, "r") as f:
    new_func = f.read()

# Find old function boundaries
marker = "function LibraryPage({ onBack, clients: propClients, onUpdateClients, isClientView, clientFilter }) {"
start_idx = content.find(marker)
if start_idx < 0:
    print("ERROR: Could not find LibraryPage")
    sys.exit(1)

# Find matching closing brace
depth = 0
i = start_idx
found_end = -1
while i < len(content):
    if content[i] == '{':
        depth += 1
    elif content[i] == '}':
        depth -= 1
        if depth == 0:
            found_end = i + 1
            break
    i += 1

if found_end < 0:
    print("ERROR: Could not find LibraryPage end")
    sys.exit(1)

old_func = content[start_idx:found_end]
old_lines = old_func.count('\n')
new_lines = new_func.count('\n')
print(f"Old function: {len(old_func)} chars, ~{old_lines} lines")
print(f"New function: {len(new_func)} chars, ~{new_lines} lines")

# Replace
new_content = content[:start_idx] + new_func + content[found_end:]

# Verify
old_total = content.count('\n')
new_total = new_content.count('\n')
print(f"File: {old_total} -> {new_total} lines (delta: {new_total - old_total})")

# Write
with open(FILE, "w") as f:
    f.write(new_content)

print("SUCCESS: LibraryPage replaced")
