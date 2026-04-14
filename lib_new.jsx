function LibraryPage({ onBack, clients: propClients, onUpdateClients, isClientView, clientFilter }) {
  const isLibDesktop = useIsDesktop();
  const CDATA = propClients || [];
  const { showToast, ToastEl } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
  const [search, setSearch] = useState("");
  const [viewFile, setViewFile] = useState(null);
  const [libView, setLibView] = useState("grid");
  const [dragOver, setDragOver] = useState(false);
  const [dragOverFolder, setDragOverFolder] = useState(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [contextMenu, setContextMenu] = useState(null);
  const [migrated, setMigrated] = useState(false);
  const [pgC, setPgC] = useState(false);
  const pgRef = useRef(null);

  /* Load items from Supabase */
  const loadItems = useCallback(async (parentId = null) => {
    setLoading(true);
    const data = await libFetch(parentId);
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => { loadItems(currentFolderId); }, [currentFolderId, loadItems]);

  /* Auto-migrate old client files on first load */
  useEffect(() => {
    if (migrated || isClientView) return;
    (async () => {
      const hasFiles = CDATA.some(c => (c.files||[]).length > 0);
      if (!hasFiles) { setMigrated(true); return; }
      const existing = await libFetch(null);
      if (existing.length > 0) { setMigrated(true); return; }
      const count = await libMigrateClientFiles(CDATA);
      if (count > 0) { showToast(count + " arquivos migrados para a Biblioteca"); loadItems(null); }
      setMigrated(true);
    })();
  }, [CDATA, migrated, isClientView]);

  /* Navigate into folder */
  const navigateToFolder = (folder) => {
    setFolderPath(p => [...p, { id: folder.id, name: folder.name }]);
    setCurrentFolderId(folder.id);
    setViewFile(null); setContextMenu(null); setSearch("");
  };
  /* Navigate to specific breadcrumb */
  const navigateTo = (index) => {
    if (index < 0) { setFolderPath([]); setCurrentFolderId(null); }
    else { setFolderPath(p => p.slice(0, index + 1)); setCurrentFolderId(folderPath[index].id); }
    setViewFile(null); setSearch("");
  };

  /* File helpers */
  const IMG_EXTS = ["jpg","jpeg","png","gif","webp","heic","heif","svg","bmp","ico"];
  const VID_EXTS = ["mp4","mov","avi","mkv","webm","m4v"];
  const getExt = (name) => { const p = (name||"").split("."); return p.length > 1 ? p.pop().toLowerCase() : ""; };
  const isImg = (item) => IMG_EXTS.includes(getExt(item.name)) || (item.mime_type||"").startsWith("image/");
  const isVid = (item) => VID_EXTS.includes(getExt(item.name)) || (item.mime_type||"").startsWith("video/");
  const fmtSize = (bytes) => { if (!bytes) return "—"; const b = parseInt(bytes); if (b >= 1048576) return (b/1048576).toFixed(1)+"MB"; if (b >= 1024) return (b/1024).toFixed(0)+"KB"; return b+"B"; };
  const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}); } catch { return "—"; } };

  const fileIcon = (item) => {
    if (item.is_folder) return { ic: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>, c: B.accent };
    const ext = getExt(item.name);
    if (IMG_EXTS.includes(ext)) return { ic: IC.img, c: B.pink };
    if (VID_EXTS.includes(ext)) return { ic: IC.vid, c: B.orange };
    if (ext === "pdf") return { ic: IC.doc, c: B.red };
    if (["psd","ai","fig","xd","sketch"].includes(ext)) return { ic: IC.palette, c: B.purple };
    if (["doc","docx","txt","rtf"].includes(ext)) return { ic: IC.doc, c: B.blue };
    if (["xls","xlsx","csv"].includes(ext)) return { ic: IC.doc, c: B.green };
    if (["zip","rar","7z","tar","gz"].includes(ext)) return { ic: IC.doc, c: B.cyan };
    return { ic: IC.doc, c: B.muted };
  };

  /* Upload handler — multi-file */
  const handleUpload = async (fileList) => {
    if (!fileList?.length) return;
    setUploading(true);
    const files = Array.from(fileList);
    let ok = 0;
    for (let i = 0; i < files.length; i++) {
      setUploadProgress(`${i+1}/${files.length} — ${files[i].name}`);
      const result = await libUploadFile(files[i], currentFolderId);
      if (result) ok++;
    }
    setUploading(false); setUploadProgress("");
    if (ok > 0) { showToast(ok + " arquivo(s) enviado(s) ✓"); loadItems(currentFolderId); }
    else showToast("Erro no upload");
  };

  /* Drag & drop handler */
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files?.length) handleUpload(files);
  };

  /* Move item via drag & drop */
  const handleItemDrop = async (e, targetFolderId) => {
    e.preventDefault(); e.stopPropagation(); setDragOverFolder(null);
    const raw = e.dataTransfer?.getData("application/uh-lib-item");
    if (!raw) return;
    try {
      const item = JSON.parse(raw);
      if (item.id === targetFolderId) return;
      const ok = await libMove(item.id, targetFolderId);
      if (ok) { showToast("Movido para pasta ✓"); loadItems(currentFolderId); }
      else showToast("Erro ao mover");
    } catch {}
  };

  /* Create folder */
  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = await libCreateFolder(name, currentFolderId);
    if (folder) { showToast("Pasta criada ✓"); setShowNewFolder(false); setNewFolderName(""); loadItems(currentFolderId); }
    else showToast("Erro ao criar pasta");
  };

  /* Rename */
  const handleRename = async () => {
    const name = renameVal.trim();
    if (!name || !renamingId) return;
    const ok = await libRename(renamingId, name);
    if (ok) { showToast("Renomeado ✓"); setRenamingId(null); setRenameVal(""); loadItems(currentFolderId); if (viewFile?.id === renamingId) setViewFile(p => ({...p, name})); }
    else showToast("Erro ao renomear");
  };

  /* Delete */
  const handleDelete = async (item) => {
    if (!confirm(`Apagar "${item.name}"${item.is_folder?" e todo seu conteúdo":""}?`)) return;
    const ok = await libDeleteItem(item.id);
    if (ok) { showToast("Apagado ✓"); if (viewFile?.id === item.id) setViewFile(null); loadItems(currentFolderId); }
    else showToast("Erro ao apagar");
  };

  /* Filter */
  const filtered = search.trim() ? items.filter(it => it.name.toLowerCase().includes(search.toLowerCase())) : items;
  const folders = filtered.filter(it => it.is_folder);
  const files = filtered.filter(it => !it.is_folder);
  const totalItems = items.length;
  const totalFolders = items.filter(it => it.is_folder).length;
  const totalFiles = items.filter(it => !it.is_folder).length;

  /* Breadcrumbs */
  const Breadcrumbs = () => (
    <div style={{ display:"flex", alignItems:"center", gap:4, flexWrap:"wrap", padding:"0 0 8px" }}>
      <button onClick={()=>navigateTo(-1)} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, color:folderPath.length?B.accent:B.text, padding:"4px 6px", borderRadius:6 }}>Biblioteca</button>
      {folderPath.map((fp, i) => (
        <React.Fragment key={fp.id}>
          <span style={{ color:B.muted, fontSize:10 }}>/</span>
          <button onClick={()=>navigateTo(i)} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:i===folderPath.length-1?700:500, color:i===folderPath.length-1?B.text:B.accent, padding:"4px 6px", borderRadius:6, maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fp.name}</button>
        </React.Fragment>
      ))}
    </div>
  );

  /* New Folder Modal */
  const NewFolderModal = () => showNewFolder ? (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setShowNewFolder(false)}>
      <div onClick={e=>e.stopPropagation()} style={{ background:B.bgCard, borderRadius:16, padding:24, width:340, border:`1px solid ${B.border}` }}>
        <p style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>Nova Pasta</p>
        <input value={newFolderName} onChange={e=>setNewFolderName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleCreateFolder();}} placeholder="Nome da pasta" autoFocus style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1.5px solid ${B.border}`, background:B.bg, fontFamily:"inherit", fontSize:13, outline:"none", boxSizing:"border-box" }} />
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <button onClick={()=>setShowNewFolder(false)} style={{ flex:1, padding:"10px 0", borderRadius:10, border:`1px solid ${B.border}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.text }}>Cancelar</button>
          <button onClick={handleCreateFolder} style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none", background:B.accent, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, color:B.dark }}>Criar</button>
        </div>
      </div>
    </div>
  ) : null;

  /* Rename Modal */
  const RenameModal = () => renamingId ? (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setRenamingId(null)}>
      <div onClick={e=>e.stopPropagation()} style={{ background:B.bgCard, borderRadius:16, padding:24, width:340, border:`1px solid ${B.border}` }}>
        <p style={{ fontSize:15, fontWeight:700, marginBottom:14 }}>Renomear</p>
        <input value={renameVal} onChange={e=>setRenameVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleRename();}} autoFocus style={{ width:"100%", padding:"10px 14px", borderRadius:10, border:`1.5px solid ${B.border}`, background:B.bg, fontFamily:"inherit", fontSize:13, outline:"none", boxSizing:"border-box" }} />
        <div style={{ display:"flex", gap:8, marginTop:14 }}>
          <button onClick={()=>setRenamingId(null)} style={{ flex:1, padding:"10px 0", borderRadius:10, border:`1px solid ${B.border}`, background:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.text }}>Cancelar</button>
          <button onClick={handleRename} style={{ flex:1, padding:"10px 0", borderRadius:10, border:"none", background:B.accent, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, color:B.dark }}>Salvar</button>
        </div>
      </div>
    </div>
  ) : null;

  /* Upload overlay */
  const UploadOverlay = () => uploading ? (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:B.bgCard, borderRadius:16, padding:32, textAlign:"center", border:`1px solid ${B.border}` }}>
        <div style={{ width:40, height:40, borderRadius:20, border:`3px solid ${B.accent}30`, borderTopColor:B.accent, animation:"spin 1s linear infinite", margin:"0 auto 12px" }} />
        <p style={{ fontSize:14, fontWeight:700 }}>Enviando...</p>
        <p style={{ fontSize:11, color:B.muted, marginTop:4 }}>{uploadProgress}</p>
      </div>
    </div>
  ) : null;

  /* Single item renderer for grid */
  const GridItem = ({ item }) => {
    const fi = fileIcon(item);
    const ext = getExt(item.name);
    const isSel = viewFile?.id === item.id;
    const isImage = isImg(item);
    const isVideo = isVid(item);
    return (
      <div draggable onDragStart={e=>{e.dataTransfer.setData("application/uh-lib-item",JSON.stringify({id:item.id,name:item.name,is_folder:item.is_folder}));e.dataTransfer.effectAllowed="move";}} onDragOver={e=>{if(item.is_folder){e.preventDefault();e.stopPropagation();setDragOverFolder(item.id);}}} onDragLeave={()=>setDragOverFolder(null)} onDrop={e=>{if(item.is_folder)handleItemDrop(e,item.id);}} onClick={()=>{if(item.is_folder)navigateToFolder(item);else setViewFile(item);}} onContextMenu={e=>{e.preventDefault();setContextMenu({x:e.clientX,y:e.clientY,item});}} style={{ borderRadius:14, border:isSel?`2px solid ${B.accent}`:dragOverFolder===item.id?`2px solid ${B.green}`:`1.5px solid ${B.border}`, overflow:"hidden", cursor:"pointer", background:dragOverFolder===item.id?`${B.green}06`:B.bgCard, transition:"all .15s", boxShadow:isSel?`0 0 0 3px ${B.accent}20`:"none" }} onMouseEnter={e=>{if(!isSel&&dragOverFolder!==item.id){e.currentTarget.style.borderColor=B.accent;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.08)";}}} onMouseLeave={e=>{if(!isSel&&dragOverFolder!==item.id){e.currentTarget.style.borderColor=B.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}}>
        <div style={{ width:"100%", height:item.is_folder?80:110, background:item.is_folder?`${B.accent}08`:isImage&&item.url?`url(${item.url}) center/cover`:`${fi.c}08`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", overflow:"hidden" }}>
          {item.is_folder && <svg width="40" height="40" viewBox="0 0 24 24" fill={`${B.accent}20`} stroke={B.accent} strokeWidth="1.5" strokeLinecap="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>}
          {!item.is_folder && isVideo && item.url && <><video src={item.url+"#t=0.1"} preload="metadata" muted style={{ width:"100%", height:"100%", objectFit:"cover" }} /><div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.3)" }}><svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21"/></svg></div></>}
          {!item.is_folder && !isImage && !isVideo && <div style={{ color:fi.c, opacity:0.6, transform:"scale(1.5)" }}>{fi.ic}</div>}
          {!item.is_folder && <span style={{ position:"absolute", top:6, right:6, fontSize:8, fontWeight:700, padding:"2px 5px", borderRadius:4, background:"rgba(0,0,0,0.5)", color:"#fff", textTransform:"uppercase" }}>{ext}</span>}
        </div>
        <div style={{ padding:"8px 10px" }}>
          <p style={{ fontSize:11, fontWeight:700, color:B.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</p>
          <p style={{ fontSize:9, color:B.muted, marginTop:2 }}>{item.is_folder?"Pasta":fmtSize(item.size_bytes)} {item.is_folder?"":"· "+fmtDate(item.created_at)}</p>
        </div>
      </div>
    );
  };

  /* Context menu */
  const ContextMenuEl = () => contextMenu ? (
    <div style={{ position:"fixed", inset:0, zIndex:9998 }} onClick={()=>setContextMenu(null)}>
      <div onClick={e=>e.stopPropagation()} style={{ position:"fixed", left:contextMenu.x, top:contextMenu.y, background:B.bgCard, borderRadius:12, border:`1px solid ${B.border}`, boxShadow:"0 8px 24px rgba(0,0,0,0.15)", padding:4, minWidth:160, zIndex:9999 }}>
        {contextMenu.item.is_folder && <button onClick={()=>{navigateToFolder(contextMenu.item);setContextMenu(null);}} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, background:"transparent", color:B.text, textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background=`${B.accent}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>📂 Abrir</button>}
        {!contextMenu.item.is_folder && contextMenu.item.url && <button onClick={()=>{window.open(contextMenu.item.url,"_blank");setContextMenu(null);}} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, background:"transparent", color:B.text, textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background=`${B.accent}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>🔗 Abrir</button>}
        {!contextMenu.item.is_folder && contextMenu.item.url && <button onClick={()=>{const a=document.createElement("a");a.href=contextMenu.item.url;a.download=contextMenu.item.name;a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);showToast("Download ✓");setContextMenu(null);}} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, background:"transparent", color:B.text, textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background=`${B.accent}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>⬇️ Baixar</button>}
        <button onClick={()=>{setRenamingId(contextMenu.item.id);setRenameVal(contextMenu.item.name);setContextMenu(null);}} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, background:"transparent", color:B.text, textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background=`${B.accent}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>✏️ Renomear</button>
        {!contextMenu.item.is_folder && contextMenu.item.url && <button onClick={()=>{navigator.clipboard.writeText(contextMenu.item.url);showToast("Link copiado ✓");setContextMenu(null);}} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, background:"transparent", color:B.text, textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background=`${B.accent}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>📋 Copiar link</button>}
        {currentFolderId && <button onClick={async()=>{const ok=await libMove(contextMenu.item.id,null);if(ok){showToast("Movido para raiz ✓");loadItems(currentFolderId);}setContextMenu(null);}} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, background:"transparent", color:B.text, textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background=`${B.accent}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>📤 Mover para raiz</button>}
        <div style={{ height:1, background:B.border, margin:"2px 8px" }} />
        <button onClick={()=>{handleDelete(contextMenu.item);setContextMenu(null);}} style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, background:"transparent", color:B.red||"#EF4444", textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background=`${B.red||"#EF4444"}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>🗑️ Apagar</button>
      </div>
    </div>
  ) : null;

  /* Empty state */
  const EmptyState = () => (
    <div style={{ textAlign:"center", padding:"60px 20px" }}>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="1.2" strokeLinecap="round" style={{ margin:"0 auto 14px", display:"block", opacity:0.3 }}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      <p style={{ fontSize:15, fontWeight:700, color:B.muted }}>{search?"Nenhum resultado":"Pasta vazia"}</p>
      <p style={{ fontSize:11, color:B.muted, marginTop:4 }}>{search?"Tente outra busca":"Arraste arquivos ou clique nos botões acima"}</p>
    </div>
  );

  /* Detail panel (desktop) */
  const DetailPanel = () => {
    if (!viewFile) return null;
    const fi = fileIcon(viewFile);
    const ext = getExt(viewFile.name);
    const image = isImg(viewFile);
    const video = isVid(viewFile);
    return (
      <div style={{ width:320, flexShrink:0, background:B.bgCard, borderRadius:16, border:`1px solid ${B.border}`, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"10px 14px", borderBottom:`1px solid ${B.border}`, display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={()=>setViewFile(null)} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${B.border}`, background:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          <p style={{ fontSize:13, fontWeight:700, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{viewFile.name}</p>
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {viewFile.url && image && <div style={{ background:B.dark, padding:8 }}><img src={viewFile.url} alt={viewFile.name} style={{ width:"100%", maxHeight:200, objectFit:"contain", display:"block", margin:"0 auto", borderRadius:8 }}/></div>}
          {viewFile.url && video && <div style={{ background:B.dark }}><video src={viewFile.url} controls style={{ width:"100%", maxHeight:200, display:"block" }}/></div>}
          {!(viewFile.url && (image||video)) && <div style={{ padding:"30px 16px", textAlign:"center", background:`${fi.c}04` }}><div style={{ color:fi.c, margin:"0 auto", display:"flex", justifyContent:"center", transform:"scale(2)", marginBottom:16 }}>{fi.ic}</div><p style={{ fontSize:12, fontWeight:700, color:fi.c }}>{ext?.toUpperCase()||"FILE"}</p></div>}
          <div style={{ padding:"12px 14px" }}>
            {[{l:"Tamanho",v:fmtSize(viewFile.size_bytes)},{l:"Tipo",v:viewFile.mime_type||"—"},{l:"Criado",v:fmtDate(viewFile.created_at)},{l:"Modificado",v:fmtDate(viewFile.updated_at)}].map((item,ii)=>(
              <div key={ii} style={{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderTop:ii?`1px solid ${B.border}`:"none" }}>
                <span style={{ fontSize:10, color:B.muted }}>{item.l}</span>
                <span style={{ fontSize:12, fontWeight:600, maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.v||"—"}</span>
              </div>
            ))}

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginTop:12 }}>
              {viewFile.url && <button onClick={()=>{const a=document.createElement("a");a.href=viewFile.url;a.download=viewFile.name;a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);showToast("Download ✓");}} style={{ padding:"8px 0", borderRadius:8, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.dark }}>Baixar</button>}
              {viewFile.url && <button onClick={()=>window.open(viewFile.url,"_blank","noopener")} style={{ padding:"8px 0", borderRadius:8, background:`${B.accent}10`, border:`1px solid ${B.accent}30`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.accent }}>Abrir</button>}
            </div>
            {viewFile.url && <button onClick={()=>{navigator.clipboard.writeText(viewFile.url);showToast("Link copiado ✓");}} style={{ width:"100%", padding:"8px 0", borderRadius:8, background:`${B.blue}08`, border:`1px solid ${B.blue}20`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.blue, marginTop:6 }}>Copiar link</button>}
            <button onClick={()=>{setRenamingId(viewFile.id);setRenameVal(viewFile.name);}} style={{ width:"100%", padding:"8px 0", borderRadius:8, background:`${B.accent}08`, border:`1px solid ${B.accent}20`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.accent, marginTop:6 }}>Renomear</button>
            <button onClick={()=>handleDelete(viewFile)} style={{ width:"100%", padding:"8px 0", borderRadius:8, background:(B.red||"#EF4444")+"08", border:"1px solid "+(B.red||"#EF4444")+"20", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.red||"#EF4444", marginTop:6, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>Apagar</button>
          </div>
        </div>
      </div>
    );
  };

  /* ══════════ DESKTOP VIEW ══════════ */
  if (isLibDesktop) return (
    <div className="content-wide" style={{ paddingTop:TOP, minHeight:"100%", display:"flex", flexDirection:"column" }}>
      {ToastEl}<NewFolderModal /><RenameModal /><UploadOverlay /><ContextMenuEl />
      <CollapseHeader icon={IC.library} label="Arquivos" title="Biblioteca" onBack={onBack} collapsed={false} stats={[]} />
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginTop:12, flex:1, minHeight:0 }}>
        {/* Toolbar */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <Breadcrumbs />
          <div style={{ flex:1 }} />
          <div style={{ position:"relative" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2" strokeLinecap="round" style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." style={{ padding:"8px 12px 8px 32px", borderRadius:10, border:`1.5px solid ${B.border}`, background:B.bgCard, fontFamily:"inherit", fontSize:12, outline:"none", width:200 }} />
          </div>
          <div style={{ display:"flex", borderRadius:10, border:`1.5px solid ${B.border}`, overflow:"hidden" }}>
            <button onClick={()=>setLibView("grid")} style={{ padding:"7px 9px", border:"none", cursor:"pointer", background:libView==="grid"?`${B.accent}12`:"transparent", color:libView==="grid"?B.accent:B.muted, display:"flex" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>
            <button onClick={()=>setLibView("list")} style={{ padding:"7px 9px", border:"none", cursor:"pointer", background:libView==="list"?`${B.accent}12`:"transparent", color:libView==="list"?B.accent:B.muted, display:"flex" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></button>
          </div>
          <button onClick={()=>{setShowNewFolder(true);setNewFolderName("");}} style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 12px", borderRadius:10, background:`${B.accent}10`, border:`1px solid ${B.accent}30`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.accent }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>Pasta</button>
          <label style={{ display:"flex", alignItems:"center", gap:5, padding:"8px 14px", borderRadius:10, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.dark }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Enviar
            <input type="file" multiple style={{display:"none"}} onChange={e=>handleUpload(e.target.files)} />
          </label>
        </div>

        {/* Content area */}
        <div style={{ flex:1, display:"flex", gap:12, minHeight:0 }}>
          {/* Files area with drag & drop */}
          <div onDragOver={e=>{e.preventDefault();if(!e.dataTransfer.types.includes("application/uh-lib-item"))setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={handleDrop} style={{ flex:1, background:B.bgCard, borderRadius:16, border:dragOver?`2px dashed ${B.accent}`:`1px solid ${B.border}`, overflow:"hidden", display:"flex", flexDirection:"column", transition:"border .2s", position:"relative", minWidth:0 }}>
            {dragOver && <div style={{ position:"absolute", inset:0, background:`${B.accent}08`, zIndex:10, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:16 }}><div style={{ textAlign:"center" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="1.5" strokeLinecap="round" style={{ margin:"0 auto 8px" }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><p style={{ fontSize:14, fontWeight:700, color:B.accent }}>Solte os arquivos aqui</p></div></div>}
            {/* Stats bar */}
            <div style={{ padding:"8px 14px", borderBottom:`1px solid ${B.border}`, display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:11, color:B.muted }}>{loading?"Carregando...":`${totalFolders} pasta${totalFolders!==1?"s":""} · ${totalFiles} arquivo${totalFiles!==1?"s":""}`}</span>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:libView==="grid"?"12px":"6px 8px" }}>
              {!loading && filtered.length===0 && <EmptyState />}

              {/* GRID VIEW */}
              {libView==="grid" && filtered.length>0 && <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(155px, 1fr))", gap:10 }}>
                {filtered.map(item => <GridItem key={item.id} item={item} />)}
              </div>}
              {/* LIST VIEW */}
              {libView==="list" && filtered.length>0 && filtered.map(item => {
                const fi = fileIcon(item);
                const isSel = viewFile?.id === item.id;
                return (
                  <div key={item.id} draggable onDragStart={e=>{e.dataTransfer.setData("application/uh-lib-item",JSON.stringify({id:item.id,name:item.name,is_folder:item.is_folder}));e.dataTransfer.effectAllowed="move";}} onDragOver={e=>{if(item.is_folder){e.preventDefault();e.stopPropagation();setDragOverFolder(item.id);}}} onDragLeave={()=>setDragOverFolder(null)} onDrop={e=>{if(item.is_folder)handleItemDrop(e,item.id);}} onClick={()=>{if(item.is_folder)navigateToFolder(item);else setViewFile(item);}} onContextMenu={e=>{e.preventDefault();setContextMenu({x:e.clientX,y:e.clientY,item});}} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 10px", borderRadius:10, cursor:"pointer", background:isSel?`${B.accent}06`:dragOverFolder===item.id?`${B.green}06`:"transparent", border:isSel?`1.5px solid ${B.accent}20`:dragOverFolder===item.id?`1.5px solid ${B.green}`:"1.5px solid transparent", marginBottom:2 }} onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background=`${B.accent}04`;}} onMouseLeave={e=>{if(!isSel&&dragOverFolder!==item.id)e.currentTarget.style.background="transparent";}}>
                    {item.is_folder ? <div style={{ width:40, height:40, borderRadius:8, background:`${B.accent}10`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill={`${B.accent}20`} stroke={B.accent} strokeWidth="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></div> : isImg(item)&&item.url ? <div style={{ width:40, height:40, borderRadius:8, background:`url(${item.url}) center/cover`, flexShrink:0 }}/> : <div style={{ width:40, height:40, borderRadius:8, background:`${fi.c}10`, display:"flex", alignItems:"center", justifyContent:"center", color:fi.c, flexShrink:0 }}>{fi.ic}</div>}
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</p>
                      <p style={{ fontSize:10, color:B.muted }}>{item.is_folder?"Pasta":fmtSize(item.size_bytes)}</p>
                    </div>
                    {!item.is_folder && <span style={{ fontSize:8, fontWeight:700, padding:"2px 6px", borderRadius:4, background:`${fi.c}10`, color:fi.c, textTransform:"uppercase" }}>{getExt(item.name)}</span>}
                    <span style={{ fontSize:10, color:B.muted }}>{fmtDate(item.created_at)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Detail panel */}
          <DetailPanel />
        </div>
      </div>
    </div>
  );

  /* ══════════ MOBILE: File detail ══════════ */
  if (viewFile && !isLibDesktop) {
    const fi = fileIcon(viewFile);
    const ext = getExt(viewFile.name);
    const image = isImg(viewFile);
    const video = isVid(viewFile);
    return (
      <div className="pg">{ToastEl}<RenameModal />
        <Head title={viewFile.name} onBack={()=>setViewFile(null)} />
        <Card>
          {viewFile.url && image && <img src={viewFile.url} alt={viewFile.name} style={{ width:"100%", maxHeight:250, objectFit:"contain", borderRadius:10, display:"block", marginBottom:12 }} />}
          {viewFile.url && video && <video src={viewFile.url} controls style={{ width:"100%", maxHeight:250, borderRadius:10, display:"block", marginBottom:12 }} />}
          {!(viewFile.url && (image||video)) && <div style={{ textAlign:"center", padding:24, background:`${fi.c}06`, borderRadius:12, marginBottom:12 }}><div style={{ color:fi.c, display:"flex", justifyContent:"center", transform:"scale(2.5)", marginBottom:20 }}>{fi.ic}</div><p style={{ fontSize:14, fontWeight:700, color:fi.c }}>{ext?.toUpperCase()||"FILE"}</p></div>}
          {[{l:"Nome",v:viewFile.name},{l:"Tamanho",v:fmtSize(viewFile.size_bytes)},{l:"Tipo",v:viewFile.mime_type||"—"},{l:"Criado",v:fmtDate(viewFile.created_at)}].map((item,i)=>(<div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderTop:i?`1px solid ${B.border}`:"none" }}><span style={{ fontSize:11, color:B.muted }}>{item.l}</span><span style={{ fontSize:13, fontWeight:600, maxWidth:"60%", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.v}</span></div>))}
        </Card>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:8 }}>
          {viewFile.url && <button onClick={()=>{const a=document.createElement("a");a.href=viewFile.url;a.download=viewFile.name;a.target="_blank";document.body.appendChild(a);a.click();document.body.removeChild(a);showToast("Download ✓");}} className="pill full accent" style={{ padding:"12px 0" }}>Baixar</button>}
          {viewFile.url && <button onClick={()=>window.open(viewFile.url,"_blank")} className="pill full" style={{ padding:"12px 0", background:`${B.accent}10`, border:`1px solid ${B.accent}30`, color:B.accent }}>Abrir</button>}
        </div>
        <button onClick={()=>{setRenamingId(viewFile.id);setRenameVal(viewFile.name);}} className="pill full" style={{ marginTop:6, padding:"12px 0", background:`${B.accent}08`, border:`1px solid ${B.accent}20`, color:B.accent }}>Renomear</button>
        <button onClick={()=>handleDelete(viewFile)} className="pill full" style={{ marginTop:6, padding:"12px 0", background:(B.red||"#EF4444")+"08", border:"1px solid "+(B.red||"#EF4444")+"20", color:B.red||"#EF4444" }}>Apagar</button>
      </div>
    );
  }

  /* ══════════ MOBILE: Main list ══════════ */
  return (
    <div style={{ paddingTop:TOP, minHeight:"100%", display:"flex", flexDirection:"column" }}>
      {ToastEl}<NewFolderModal /><RenameModal /><UploadOverlay />
      <CollapseHeader icon={IC.library} label="Arquivos" title="Biblioteca" collapsed={pgC} stats={[]} onBack={onBack} />
      <div ref={pgRef} onScroll={e=>setPgC(e.currentTarget.scrollTop>60)} style={{flex:1,overflowY:"auto",padding:"14px 16px 0"}}>

      {/* Breadcrumbs */}
      <Breadcrumbs />

      {/* Action bar */}
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        <button onClick={()=>{setShowNewFolder(true);setNewFolderName("");}} style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:10, background:`${B.accent}10`, border:`1px solid ${B.accent}30`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.accent }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>Pasta
        </button>
        <label style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 14px", borderRadius:10, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.dark }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Enviar
          <input type="file" multiple style={{display:"none"}} onChange={e=>handleUpload(e.target.files)} />
        </label>
        <div style={{ flex:1 }} />
        <span style={{ fontSize:10, color:B.muted, alignSelf:"center" }}>{totalItems} ite{totalItems!==1?"ns":"m"}</span>
      </div>

      {/* Search */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <div style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:B.muted, display:"flex" }}>{IC.search(B.muted)}</div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." className="tinput" style={{ paddingLeft:"40px" }} />
      </div>

      {/* Loading */}
      {loading && <div style={{ textAlign:"center", padding:30 }}><p style={{ fontSize:12, color:B.muted }}>Carregando...</p></div>}

      {/* Empty */}
      {!loading && filtered.length===0 && <EmptyState />}

      {/* Folders */}
      {folders.length>0 && <p className="sl" style={{ marginBottom:4 }}>Pastas</p>}
      {folders.map(item => {
        const fi = fileIcon(item);
        return (
          <Card key={item.id} onClick={()=>navigateToFolder(item)} style={{ marginTop:4, cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:`${B.accent}10`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill={`${B.accent}20`} stroke={B.accent} strokeWidth="1.5"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg></div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</p>
                <p style={{ fontSize:10, color:B.muted, marginTop:1 }}>Pasta · {fmtDate(item.created_at)}</p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </Card>
        );
      })}

      {/* Files */}
      {files.length>0 && <p className="sl" style={{ marginTop:folders.length?10:0, marginBottom:4 }}>Arquivos</p>}
      {files.map(item => {
        const fi = fileIcon(item);
        return (
          <Card key={item.id} onClick={()=>setViewFile(item)} style={{ marginTop:4, cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:`${fi.c}10`, display:"flex", alignItems:"center", justifyContent:"center", color:fi.c, flexShrink:0 }}>{fi.ic}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</p>
                <p style={{ fontSize:10, color:B.muted, marginTop:2 }}>{fmtSize(item.size_bytes)} · {fmtDate(item.created_at)}</p>
              </div>
              <span style={{ fontSize:8, fontWeight:700, padding:"2px 6px", borderRadius:4, background:`${fi.c}10`, color:fi.c, textTransform:"uppercase" }}>{getExt(item.name)}</span>
            </div>
          </Card>
        );
      })}

      </div>
    </div>
  );
}
