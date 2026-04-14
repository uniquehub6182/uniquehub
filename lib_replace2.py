import sys

FILE = "/Users/matheusbahiense/Desktop/uniquehub/src/UniqueHubApp.jsx"
NEW_LIB = "/Users/matheusbahiense/Desktop/uniquehub/lib_new.jsx"

with open(FILE, "r") as f:
    lines = f.readlines()

with open(NEW_LIB, "r") as f:
    new_func = f.read()

print(f"Original file: {len(lines)} lines")

# === STEP 1: Insert CRUD functions after supaUploadClientFile ===
crud_marker = "const supaDeleteFile = async (path) => {"
crud_line = -1
for i, line in enumerate(lines):
    if crud_marker in line:
        crud_line = i
        break

if crud_line < 0:
    print("ERROR: Could not find supaDeleteFile")
    sys.exit(1)

print(f"Found supaDeleteFile at line {crud_line + 1}")

crud_code = """/* ── Library Drive CRUD (library_files table) ── */
const libFetch = async (parentId = null, orgId = null) => {
  if (!supabase) return [];
  const oid = orgId || _currentOrgId;
  let q = supabase.from("library_files").select("*");
  if (oid) q = q.eq("org_id", oid);
  if (parentId) q = q.eq("parent_id", parentId); else q = q.is("parent_id", null);
  q = q.order("is_folder", { ascending: false }).order("name");
  const { data, error } = await q;
  if (error) { console.error("[LibDrive] fetch error:", error); return []; }
  return data || [];
};
const libCreateFolder = async (name, parentId = null) => {
  if (!supabase || !_currentOrgId) return null;
  const row = { org_id: _currentOrgId, parent_id: parentId||null, name, is_folder: true };
  const { data, error } = await supabase.from("library_files").insert(row).select().single();
  if (error) { console.error("[LibDrive] createFolder:", error); return null; }
  return data;
};
const libUploadFile = async (file, parentId = null) => {
  if (!supabase || !_currentOrgId) return null;
  try {
    const isImgFile = file.type?.startsWith("image/");
    const processed = isImgFile ? await compressImage(file) : file;
    const safeName = (processed.name||file.name).normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-zA-Z0-9._-]/g,"_");
    const path = "library/" + _currentOrgId + "/" + Date.now() + "_" + safeName;
    const { error: upErr } = await supabase.storage.from("demand-files").upload(path, processed, { upsert:true, cacheControl:"3600", contentType: processed.type||file.type||"application/octet-stream" });
    if (upErr) { console.error("[LibDrive] storage:", upErr); return null; }
    const { data: pub } = supabase.storage.from("demand-files").getPublicUrl(path);
    const url = pub?.publicUrl || "";
    const row = { org_id: _currentOrgId, parent_id: parentId||null, name: file.name, is_folder: false, size_bytes: processed.size || file.size, url, storage_path: path, mime_type: processed.type||file.type||"" };
    const { data, error: dbErr } = await supabase.from("library_files").insert(row).select().single();
    if (dbErr) { console.error("[LibDrive] insert:", dbErr); return null; }
    return data;
  } catch (e) { console.error("[LibDrive] upload catch:", e); return null; }
};
const libRename = async (id, name) => { if (!supabase) return false; const { error } = await supabase.from("library_files").update({ name, updated_at: new Date().toISOString() }).eq("id", id); return !error; };
const libMove = async (id, newParentId) => { if (!supabase) return false; const { error } = await supabase.from("library_files").update({ parent_id: newParentId||null, updated_at: new Date().toISOString() }).eq("id", id); return !error; };
const libDeleteItem = async (id) => {
  if (!supabase) return false;
  const { data: item } = await supabase.from("library_files").select("storage_path,is_folder").eq("id", id).single();
  if (item?.storage_path) { await supabase.storage.from("demand-files").remove([item.storage_path]).catch(()=>{}); }
  const { error } = await supabase.from("library_files").delete().eq("id", id);
  if (error) console.error("[LibDrive] delete:", error);
  return !error;
};
const libMigrateClientFiles = async (clients) => {
  if (!supabase || !_currentOrgId) return 0;
  const existing = await libFetch(null, _currentOrgId);
  if (existing.length > 0) return -1;
  let count = 0;
  for (const c of clients) {
    if (!c.files?.length) continue;
    for (const f of c.files) {
      const row = { org_id: _currentOrgId, parent_id: null, name: f.name||"Arquivo", is_folder: false, size_bytes: parseInt(f.size)||0, url: f.url||"", storage_path: f.storagePath||"", mime_type: f.mimeType||"", category: f.category||"Outros", client_id: c.supaId||c.id };
      const { error } = await supabase.from("library_files").insert(row);
      if (!error) count++;
    }
  }
  return count;
};
"""

# Insert CRUD before supaDeleteFile
crud_lines = crud_code.split('\n')
crud_lines = [l + '\n' for l in crud_lines]

new_lines = lines[:crud_line] + crud_lines + lines[crud_line:]
print(f"After CRUD insert: {len(new_lines)} lines (+{len(crud_lines)})")

# === STEP 2: Find and replace LibraryPage function ===
# Find the function declaration line
lib_start = -1
for i, line in enumerate(new_lines):
    if "function LibraryPage(" in line and "onBack" in line:
        lib_start = i
        break

if lib_start < 0:
    print("ERROR: Could not find LibraryPage")
    sys.exit(1)

print(f"Found LibraryPage at line {lib_start + 1}")

# Find the opening brace of the function BODY (the last { on the declaration line)
# We need to find the { after the closing ) of the params
decl_line = new_lines[lib_start]
# Find position of ") {" which marks end of params and start of body
body_start_char = decl_line.rfind(") {")
if body_start_char < 0:
    body_start_char = decl_line.rfind("){")

if body_start_char < 0:
    print("ERROR: Could not find function body opening brace")
    sys.exit(1)

# Now find matching closing brace starting from the body opening {
# Reconstruct content from lib_start onwards
rest_content = ''.join(new_lines[lib_start:])
# Find the position of ") {" in the rest_content
body_open = rest_content.find(") {")
if body_open >= 0:
    body_open += 2  # position of the {
else:
    body_open = rest_content.find("){")
    if body_open >= 0:
        body_open += 1

depth = 0
search_start = body_open
found_end_char = -1
for ci in range(search_start, len(rest_content)):
    if rest_content[ci] == '{':
        depth += 1
    elif rest_content[ci] == '}':
        depth -= 1
        if depth == 0:
            found_end_char = ci + 1
            break

if found_end_char < 0:
    print("ERROR: Could not find LibraryPage end brace")
    sys.exit(1)

# Count lines in the old function
old_func_text = rest_content[:found_end_char]
old_func_lines = old_func_text.count('\n')
lib_end = lib_start + old_func_lines

print(f"LibraryPage spans lines {lib_start+1}-{lib_end+1} ({old_func_lines} lines)")

# Replace with new function
new_func_lines = new_func.split('\n')
new_func_lines = [l + '\n' for l in new_func_lines if l != '' or True]
# Remove trailing empty line if present
if new_func_lines and new_func_lines[-1].strip() == '':
    new_func_lines = new_func_lines[:-1]

final_lines = new_lines[:lib_start] + new_func_lines + new_lines[lib_end+1:]

print(f"Final file: {len(final_lines)} lines")

with open(FILE, 'w') as f:
    f.writelines(final_lines)

print("SUCCESS: CRUD inserted + LibraryPage replaced")
