import sys
FILE = "/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx"
with open(FILE, "r") as f:
    lines = f.readlines()

# Find component boundaries
start = None
end = None
for i, line in enumerate(lines):
    if 'function PresentationsPage(' in line:
        start = i
    if start is not None and i > start and line.strip() == '}':
        if i + 1 < len(lines) and (lines[i+1].strip() == '' or 'FEED PLANNER' in lines[i+1]):
            end = i
            break

if start is None or end is None:
    print("FAILED: Could not find component boundaries")
    sys.exit(1)

print(f"Replacing lines {start+1} to {end+1} ({end-start+1} lines)")

# Read all parts
with open("/Users/matheusbahiense/Desktop/uniquehub/new_pres_component.txt") as f:
    part1 = f.read()
with open("/Users/matheusbahiense/Desktop/uniquehub/pres_views.txt") as f:
    part2 = f.read()
with open("/Users/matheusbahiense/Desktop/uniquehub/pres_create.txt") as f:
    part3 = f.read()
with open("/Users/matheusbahiense/Desktop/uniquehub/pres_list.txt") as f:
    part4 = f.read()

new_component = part1 + part2 + part3 + part4

# Replace
new_lines = lines[:start] + [new_component + "\n"] + lines[end+1:]

with open(FILE, "w") as f:
    f.writelines(new_lines)

import subprocess
r = subprocess.run(["wc", "-l", FILE], capture_output=True, text=True)
print(f"File: {r.stdout.strip()}")
print("SUCCESS!")
