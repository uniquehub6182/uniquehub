import React, { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* ── Error Boundary ── */
class DemandDetailBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("DemandDetail crash:", error, info); }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", { className: "pg", style: { padding: 20, textAlign: "center" } },
        React.createElement("p", { style: { fontSize: 40, marginBottom: 12 } }, "⚠️"),
        React.createElement("h3", { style: { fontSize: 16, fontWeight: 700, marginBottom: 8 } }, "Erro ao carregar demanda"),
        React.createElement("p", { style: { fontSize: 12, color: "#888", marginBottom: 16, lineHeight: 1.6 } }, "Essa demanda tem dados incompletos. Tente excluí-la e criar novamente."),
        React.createElement("p", { style: { fontSize: 10, color: "#ccc", fontFamily: "monospace", wordBreak: "break-all" } }, String(this.state.error)),
        React.createElement("button", { onClick: () => { this.setState({ hasError: false, error: null }); if (this.props.onBack) this.props.onBack(); }, style: { marginTop: 16, padding: "10px 20px", borderRadius: 10, background: "#00D1A7", color: "#fff", border: "none", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" } }, "← Voltar")
      );
    }
    return this.props.children;
  }
}

class SettingsBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("SettingsPage crash:", error, info); }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", { style: { padding: 30, textAlign: "center" } },
        React.createElement("p", { style: { fontSize: 40, marginBottom: 12 } }, "⚠️"),
        React.createElement("h3", { style: { fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#f44" } }, "Erro nas Configurações"),
        React.createElement("p", { style: { fontSize: 12, color: "#888", marginBottom: 10, fontFamily: "monospace", wordBreak: "break-all" } }, String(this.state.error)),
        React.createElement("button", { onClick: () => this.setState({ hasError: false, error: null }), style: { marginTop: 10, padding: "8px 20px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer", fontFamily: "inherit" } }, "Tentar novamente")
      );
    }
    return this.props.children;
  }
}

/* ═══════════════════════ SUPABASE ═══════════════════════ */
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

/* Capture Meta OAuth params from URL BEFORE Supabase can consume them */
const _metaOAuthCapture = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (code && (state?.startsWith("meta_connect_") || state?.startsWith("ig_connect_") || sessionStorage.getItem("uh_meta_oauth_client") || sessionStorage.getItem("uh_ig_oauth_client"))) {
      const isInstagram = state?.startsWith("ig_connect_") || !!sessionStorage.getItem("uh_ig_oauth_client");
      const clientId = state?.startsWith("meta_connect_") ? state.replace("meta_connect_", "") 
        : state?.startsWith("ig_connect_") ? state.replace("ig_connect_", "")
        : sessionStorage.getItem("uh_ig_oauth_client") || sessionStorage.getItem("uh_meta_oauth_client");
      const actualRedirectUri = window.location.origin + window.location.pathname;
      console.log("[OAuth Capture] code length:", code.length, "clientId:", clientId, "isInstagram:", isInstagram, "redirectUri:", actualRedirectUri);
      window.history.replaceState({}, "", window.location.pathname);
      sessionStorage.removeItem("uh_meta_oauth_client");
      sessionStorage.removeItem("uh_ig_oauth_client");
      return { code, clientId, redirectUri: actualRedirectUri, isInstagram };
    }
  } catch {}
  return null;
})();

const supabase = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;

/* ═══════════════════════ LAYOUT ═══════════════════════ */
const TOP = "env(safe-area-inset-top, 16px)";

/* ═══════════════════════ SUPABASE HELPERS ═══════════════════════ */
const supaLoadClients = async () => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("clients").select("*").order("name");
    if (error) { console.error("Supa clients error:", error); return null; }
    return data;
  } catch (e) { console.error("Supa clients catch:", e); return null; }
};

const PLAN_MAP_TO_DB = { "Traction": "traction", "Growth 360": "growth360", "Partner": "partner" };
const PLAN_MAP_FROM_DB = { "traction": "Traction", "growth360": "Growth 360", "partner": "Partner" };
const PLAN_VALUES = { "Traction": "R$ 1.480", "Growth 360": "R$ 2.480", "Partner": "R$ 4.480" };
/* Parse BRL "R$ 4.480" or "R$ 2.480,50" → number */
const parseBRL = (s) => {
  if (!s) return 0;
  const clean = String(s).replace(/[^\d.,]/g, "");
  /* If has both dot and comma: dot=thousand, comma=decimal (BR format) */
  if (clean.includes(".") && clean.includes(",")) return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
  /* If only comma: it's decimal separator */
  if (clean.includes(",")) return parseFloat(clean.replace(",", ".")) || 0;
  /* If only dot: check if it's thousand separator (e.g. "4.480" = 4480) or decimal */
  if (clean.includes(".")) {
    const parts = clean.split(".");
    if (parts[parts.length - 1].length === 3) return parseFloat(clean.replace(/\./g, "")) || 0;
    return parseFloat(clean) || 0;
  }
  return parseFloat(clean) || 0;
};

const supaCreateClient = async (c) => {
  if (!supabase) return { data: null, err: "no supabase" };
  try {
    const payload = {
      name: c.name, contact_name: c.contact || null, contact_email: c.email || null,
      contact_phone: c.phone || null, plan: PLAN_MAP_TO_DB[c.plan] || "traction",
      monthly_value: parseBRL(c.monthly),
      status: c.status === "trial" ? "ativo" : (c.status || "ativo"), score: c.score || 0, segment: c.segment || null,
    };
    const { data, error } = await supabase.from("clients").insert(payload).select().single();
    if (error) { console.error("Supa create client error:", error); return { data: null, err: error.message || error.code }; }
    return { data, err: null };
  } catch (e) { console.error("Supa create client catch:", e); return { data: null, err: e.message }; }
};

const supaUpdateClient = async (id, updates) => {
  if (!supabase) return null;
  try {
    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.contact !== undefined) payload.contact_name = updates.contact;
    if (updates.email !== undefined) payload.contact_email = updates.email;
    if (updates.phone !== undefined) payload.contact_phone = updates.phone;
    if (updates.plan !== undefined) payload.plan = PLAN_MAP_TO_DB[updates.plan] || updates.plan.toLowerCase();
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.score !== undefined) payload.score = updates.score;
    if (updates.monthly !== undefined) payload.monthly_value = parseBRL(updates.monthly);
    if (updates.cnpj !== undefined) payload.cnpj = updates.cnpj;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.segment !== undefined) payload.segment = updates.segment;
    if (updates.notes !== undefined) payload.notes = updates.notes;
    if (Object.keys(payload).length === 0) return null;
    const { data, error } = await supabase.from("clients").update(payload).eq("id", id).select().single();
    if (error) { console.error("Supa update client error:", error); return null; }
    return data;
  } catch (e) { console.error("Supa update client catch:", e); return null; }
};

const supaDeleteClient = async (id) => {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) { console.error("Supa delete client error:", error); return false; }
    return true;
  } catch (e) { return false; }
};

/* Helper: merge Supabase client row into app format */
const mergeSupaClient = (row, existing) => ({
  id: row.id, supaId: row.id, name: row.name,
  plan: PLAN_MAP_FROM_DB[row.plan] || "Traction",
  status: row.status || "ativo",
  monthly: row.monthly_value ? `R$ ${Number(row.monthly_value).toLocaleString("pt-BR")}` : "R$ 0",
  pending: existing?.pending || 0, score: row.score || 0,
  contact: row.contact_name || "", phone: row.contact_phone || "",
  email: row.contact_email || "", cnpj: row.cnpj || existing?.cnpj || "", address: row.address || existing?.address || "",
  segment: row.segment || existing?.segment || "", notes: row.notes || existing?.notes || "",
  since: existing?.since || new Date(row.created_at).toLocaleDateString("pt-BR",{month:"2-digit",year:"numeric"}),
  socials: existing?.socials || { instagram:{connected:false}, facebook:{connected:false}, google:{connected:false}, tiktok:{connected:false}, linkedin:{connected:false}, youtube:{connected:false} },
  files: existing?.files || [],
});

/* ═══════════════════════ CONSTANTS ═══════════════════════ */

/* ── Supabase Demand Helpers ── */
const supaLoadDemands = async () => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("demands").select("*").order("created_at", { ascending: false });
    if (error) { console.error("Supa demands error:", error); return null; }
    return data;
  } catch (e) { console.error("Supa demands catch:", e); return null; }
};

const supaCreateDemand = async (d, clientId) => {
  if (!supabase) return { data: null, err: "no supabase" };
  try {
    const isUUID = (v) => typeof v === "string" && /^[0-9a-f]{8}-/.test(v);
    if (!isUUID(clientId)) {
      /* Try to find client UUID by name */
      const { data: cl } = await supabase.from("clients").select("id").eq("name", d.client).limit(1).single();
      if (cl) clientId = cl.id;
      else return { data: null, err: "Cliente não encontrado no banco" };
    }
    const payload = {
      client_id: clientId,
      title: d.title || "Nova demanda",
      type: d.type || "social",
      stage: d.stage || "idea",
      priority: d.priority || "média",
    };
    /* Save steps with creator info */
    if (d.steps) payload.steps = d.steps;
    const { data, error } = await supabase.from("demands").insert(payload).select().single();
    if (error) { return { data: null, err: JSON.stringify(error) }; }
    return { data, err: null };
  } catch (e) { return { data: null, err: e.message }; }
};

const supaUpdateDemand = async (id, updates) => {
  if (!supabase) return null;
  try {
    const payload = {};
    const map = { stage:1, title:1, priority:1, steps:1, scheduling:1, traffic:1, format:1, networks:1, sponsored:1, description:1, client_id:1 };
    for (const k of Object.keys(updates)) { if (map[k] !== undefined) payload[k] = updates[k]; }
    if (Object.keys(payload).length === 0) return null;
    const { error } = await supabase.from("demands").update(payload).eq("id", id);
    if (error) console.error("Supa update demand error:", error);
  } catch (e) { console.error(e); }
};

const supaDeleteDemand = async (id) => {
  if (!supabase) return;
  try { await supabase.from("demands").delete().eq("id", id); } catch(e) {}
};

/* ── Supabase Storage: compress + upload files for demands ── */
const compressImage = (file, maxWidth = 1200, quality = 0.75) => {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/") || file.type === "image/gif") { resolve(file); return; }
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      c.toBlob((blob) => {
        if (blob && blob.size < file.size) {
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
        } else { resolve(file); }
      }, "image/jpeg", quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
};

const supaUploadFile = async (file, demandId) => {
  if (!supabase) return { error: "Supabase offline" };
  try {
    const compressed = await compressImage(file);
    const maxSize = 100 * 1024 * 1024;
    if (compressed.size > maxSize) return { error: `Arquivo muito grande (${(compressed.size/1024/1024).toFixed(0)}MB). Máximo: 100MB` };
    const path = `${demandId}/${Date.now()}_${compressed.name.replace(/\s+/g,"_")}`;
    const { data, error } = await supabase.storage.from("demand-files").upload(path, compressed, { upsert: true, cacheControl: "3600" });
    if (error) { console.error("Upload error:", error.message); return { error: error.message }; }
    const { data: pub } = supabase.storage.from("demand-files").getPublicUrl(path);
    return { name: file.name, path, url: pub?.publicUrl || "", size: compressed.size, type: compressed.type };
  } catch (e) { console.error("Upload catch:", e); return { error: e.message }; }
};
const supaUploadClientFile = async (file, clientId) => {
  if (!supabase) return { error: "Supabase offline" };
  try {
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) return { error: `Arquivo muito grande (${(file.size/1024/1024).toFixed(0)}MB). Máximo: 100MB` };
    const safeName = file.name.replace(/\s+/g, "_");
    const path = `client_${clientId}/${Date.now()}_${safeName}`;
    /* Try demand-files bucket first (already exists), fallback gracefully */
    const { data, error } = await supabase.storage.from("demand-files").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) { console.error("Client upload error:", error.message); return { error: error.message }; }
    const { data: pub } = supabase.storage.from("demand-files").getPublicUrl(path);
    return { name: file.name, path, url: pub?.publicUrl || "", size: file.size, type: file.type };
  } catch (e) { console.error("Client upload catch:", e); return { error: e.message }; }
};
const supaDeleteFile = async (path) => {
  if (!supabase) return;
  try { await supabase.storage.from("demand-files").remove([path]); } catch(e) {}
};
/* ═══ CLIENT LOGO UPLOAD ═══ */
const supaUploadClientLogo = async (clientId, file) => {
  if (!supabase || !file) return null;
  try {
    const compressed = await compressImage(file, 400, 0.85);
    const path = `client-logos/${clientId}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("demand-files").upload(path, compressed, { upsert: true, cacheControl: "3600", contentType: "image/jpeg" });
    if (error) { console.error("Logo upload error:", error); return null; }
    const { data: pub } = supabase.storage.from("demand-files").getPublicUrl(path);
    const url = pub?.publicUrl || null;
    if (url) await supaSetSetting(`client_logo_${clientId}`, url);
    return url;
  } catch(e) { console.error("Logo upload catch:", e); return null; }
};
const mergeSupaDemand = (row) => {
  /* Ensure steps is always a valid object */
  let steps;
  if (typeof row.steps === "object" && row.steps !== null && Object.keys(row.steps).length > 0) {
    steps = row.steps;
  } else {
    steps = { idea: { by: (typeof row.created_by_name === "string" ? row.created_by_name : "Equipe"), text: row.description || "", date: row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }) : "" } };
  }
  /* Ensure all step sub-objects exist */
  ["idea","briefing","design","caption","review","client","production","editing"].forEach(k => {
    if (!steps[k] || typeof steps[k] !== "object") steps[k] = {};
    if (steps[k].files && !Array.isArray(steps[k].files)) steps[k].files = [];
  });
  return {
    id: row.id, supaId: row.id, type: row.type || "social",
    client: "Sem cliente", title: row.title || "",
    stage: row.stage || "idea", priority: row.priority || "média",
    network: Array.isArray(row.networks) ? row.networks.join(", ") : (row.networks || "Instagram"),
    format: row.format || "Feed",
    sponsored: row.sponsored || false,
    assignees: (() => {
      const byName = steps?.idea?.by;
      if (byName && typeof byName === "string") return [byName];
      if (row.created_by_name && typeof row.created_by_name === "string") return [row.created_by_name];
      return ["Equipe"];
    })(),
    createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }) : "",
    steps,
    scheduling: (row.scheduling && typeof row.scheduling === "object" && Object.keys(row.scheduling).length > 0) ? row.scheduling : { date: row.schedule_date || "", time: row.schedule_time || "" },
    traffic: (row.traffic && typeof row.traffic === "object" && Object.keys(row.traffic).length > 0) ? row.traffic : { budget: row.traffic_budget ? `R$ ${Number(row.traffic_budget).toLocaleString("pt-BR")}` : "" },
    ...(row.type === "campaign" ? { campaign: { desc: row.description || "", milestones: [], refs:"", dateStart:"", dateEnd:"", location:"", needs:[], clientTeam:[], budget:"", budgetBreakdown:[] } } : {}),
  };
};

/* ── Supabase Events (Calendar) Helpers ── */
const supaLoadEvents = async () => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("events").select("*").order("date", { ascending: true });
    if (error) { console.error("Supa events error:", error); return null; }
    return data;
  } catch (e) { return null; }
};
const supaCreateEvent = async (e) => {
  if (!supabase) return null;
  try {
    const d = new Date(e.year, e.month, e.day);
    const payload = {
      title: e.title, type: e.type || "task",
      date: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      time: e.time || null, description: e.notes || null, color: e.color || null,
      client_name: e.client || null, completed: false,
    };
    const { data, error } = await supabase.from("events").insert(payload).select().single();
    if (error) { console.error("Supa event error:", error); return null; }
    return data;
  } catch (e2) { return null; }
};
const supaDeleteEvent = async (id) => {
  if (!supabase) return;
  try { await supabase.from("events").delete().eq("id", id); } catch(e) {}
};
const mergeSupaEvent = (row) => {
  const d = new Date(row.date + "T12:00:00");
  return {
    id: row.id, supaId: row.id, type: row.type || "task", title: row.title,
    time: row.time || "09:00", color: row.color || "#3B82F6",
    day: d.getDate(), month: d.getMonth(), year: d.getFullYear(),
    createdBy: row.created_by_name || "Equipe", notes: row.description || "", client: row.client_name || "",
    completed: row.completed || false,
  };
};

/* ── Supabase Ideas Helpers ── */
const supaLoadIdeas = async () => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("ideas").select("*").order("created_at", { ascending: false });
    if (error) { console.error("Supa ideas error:", error); return null; }
    return data;
  } catch (e) { return null; }
};
const supaCreateIdea = async (idea) => {
  if (!supabase) return null;
  try {
    const payload = {
      title: idea.title, description: idea.desc || null, author: idea.author || "Equipe",
      client_name: idea.client || "Todos", tags: idea.tags || [], votes: 0, status: "pending",
    };
    const { data, error } = await supabase.from("ideas").insert(payload).select().single();
    if (error) { console.error("Supa idea error:", error); return null; }
    return data;
  } catch (e) { return null; }
};
const supaUpdateIdea = async (id, updates) => {
  if (!supabase) return;
  try { await supabase.from("ideas").update(updates).eq("id", id); } catch(e) {}
};
const supaDeleteIdea = async (id) => {
  if (!supabase) return false;
  try { const { error } = await supabase.from("ideas").delete().eq("id", id); return !error; } catch(e) { return false; }
};

/* ── Supabase: XP / Gamification ── */
const supaLoadAllXp = async () => {
  if (!supabase) return [];
  try {
    /* Try RPC function first (bypasses RLS, sees all users' XP) */
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_all_xp_events");
    if (!rpcError && rpcData) return rpcData;
    /* Fallback: direct query (limited by RLS to own user only) */
    const { data, error } = await supabase.from("xp_events").select("*").order("created_at", { ascending: false }).limit(500);
    if (error) return [];
    return data || [];
  } catch(e) { return []; }
};
const supaAddXp = async (userId, action, description, xpAmount) => {
  if (!supabase) return null;
  try { const { data, error } = await supabase.from("xp_events").insert({ user_id: userId, action, description, xp_amount: xpAmount }).select().single(); if (error) { console.error("xp insert:", error); return null; } return data; } catch(e) { return null; }
};
const supaResetXp = async (userId) => {
  if (!supabase) return false;
  try {
    if (userId) { const { error } = await supabase.from("xp_events").delete().eq("user_id", userId); if (error) { console.error("resetXp user:", error); return false; } }
    else { const { error } = await supabase.from("xp_events").delete().gte("created_at", "2000-01-01"); if (error) { console.error("resetXp all:", error); return false; } }
    return true;
  } catch(e) { console.error("resetXp catch:", e); return false; }
};

/* ── Supabase: News CRUD ── */
const supaLoadNews = async () => {
  if (!supabase) return [];
  try { const { data } = await supabase.from("news").select("*").order("created_at", { ascending: false }); return data || []; } catch(e) { return []; }
};
const supaCreateNews = async (article) => {
  if (!supabase) return null;
  try {
    const payload = { title: article.title, body: article.body || "", category: article.category || "geral", summary: article.summary || "", source: article.source || "", read_time: article.read_time || "", pinned: article.pinned || false, tags: article.tags || [], photo: article.photo || null };
    if (article.author) payload.author = article.author;
    const { data, error } = await supabase.from("news").insert(payload).select();
    if (error) { console.warn("supaCreateNews:", error.message); return null; }
    return data?.[0] || null;
  } catch(e) { return null; }
};
const supaUpdateNews = async (id, updates) => {
  if (!supabase) return;
  try {
    /* Strip any legacy __PHOTO__ prefix from body */
    const cleanBody = (updates.body || "").replace(/^__PHOTO__:[^\n]*\n?/, "");
    const payload = { ...updates, body: cleanBody };
    await supabase.from("news").update(payload).eq("id", id);
  } catch(e) {}
};
const supaDeleteNews = async (id) => {
  if (!supabase) return;
  try { await supabase.from("news").delete().eq("id", id); } catch(e) {}
};

/* ── Normalize category text → key (handles DB values like "Marketing Digital" → "mktdigital") ── */
const CAT_TEXT_TO_KEY = { "marketing digital":"mktdigital", "branding":"branding", "estratégia":"estrategia", "estrategia":"estrategia", "publicidade":"publicidade", "carreira":"carreira", "novidade":"novidade", "tendências":"trends", "tendencia":"trends", "tendência":"trends", "atualização":"updates", "atualizacao":"updates", "dica":"tips", "dicas":"tips", "case":"cases", "ferramenta":"tools", "ferramentas":"tools", "inteligência artificial":"ia", "inteligencia artificial":"ia", "ia":"ia" };
const normalizeCat = (cat) => {
  if (!cat) return "geral";
  const lower = cat.toLowerCase().trim();
  return CAT_TEXT_TO_KEY[lower] || cat;
};

/* ── Parse a raw supabase news row into app article format ── */
const parseNewsRow = (r) => {
  const srcParts = (r.source || "").split("||");
  const sourceName = srcParts[0] || "";
  const sourceUrl = srcParts[1] || "";
  const rawBody = r.body || "";
  let photo = r.photo || null;
  let body = rawBody;
  if (rawBody.startsWith("__PHOTO__:")) {
    const nl = rawBody.indexOf("\n");
    const photoLine = nl === -1 ? rawBody : rawBody.slice(0, nl);
    photo = photo || photoLine.replace("__PHOTO__:", "").trim();
    body = nl === -1 ? "" : rawBody.slice(nl + 1);
  }
  return {
    id: r.id, cat: normalizeCat(r.category || "geral"), title: r.title, summary: r.summary || "",
    body, date: new Date(r.created_at).toLocaleDateString("pt-BR"),
    readTime: r.read_time || "", source: sourceName, sourceUrl, pinned: r.pinned || false,
    tags: r.tags || [], supaId: r.id, photo
  };
};

/* ── Supabase: Team CRUD ── */
const supaLoadTeam = async () => {
  if (!supabase) return [];
  try { const { data } = await supabase.from("agency_members").select("*").order("created_at"); return data || []; } catch(e) { return []; }
};
const supaCreateMember = async (m) => {
  if (!supabase) return null;
  try {
    const payload = { name: m.name||"", role: m.role||"", job_title: m.role||"", email: m.email||"", phone: m.phone||"", since: m.since||"", skills: m.skills||[], status: m.status||"pendente", ...(m.user_id ? { user_id: m.user_id } : {}) };
    const { data, error } = await supabase.from("agency_members").insert(payload).select();
    if (error) { console.error("supaCreateMember error:", error); return null; }
    return data?.[0] || null;
  } catch(e) { console.error("supaCreateMember catch:", e); return null; }
};
const supaUpdateMember = async (id, updates) => {
  if (!supabase) return;
  try { await supabase.from("agency_members").update(updates).eq("id", id); } catch(e) {}
};
const supaDeleteMember = async (id, userId) => {
  if (!supabase) return;
  try {
    /* Delete agency_members row */
    await supabase.from("agency_members").delete().eq("id", id);
    /* If user has auth account, delete it entirely via RPC */
    if (userId) {
      /* Clean up related data first */
      await supabase.from("xp_events").delete().eq("user_id", userId);
      await supabase.from("checkins").delete().eq("user_id", userId);
      await supabase.from("messages").delete().eq("sender_id", userId);
      await supabase.from("conversation_members").delete().eq("user_id", userId);
      await supabase.from("profiles").delete().eq("id", userId);
      /* Delete auth user via database function */
      const { error } = await supabase.rpc("delete_user_account", { target_user_id: userId });
      if (error) console.error("delete_user_account error:", error);
    }
  } catch(e) { console.error("supaDeleteMember:", e); }
};
/* ── Supabase: Invite check (Team→Registration link) ── */
/* ── Supabase: App Settings (admin-only key-value store) ── */
const supaGetSetting = async (key) => {
  if (!supabase) return null;
  try { const { data } = await supabase.from("app_settings").select("value").eq("key", key).single(); return data?.value || null; } catch(e) { return null; }
};
/* Bulk load multiple settings in ONE query */
const supaGetSettingsBulk = async (keys) => {
  if (!supabase || !keys?.length) return {};
  try {
    const { data } = await supabase.from("app_settings").select("key, value").in("key", keys);
    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });
    return map;
  } catch(e) { return {}; }
};
const supaSetSetting = async (key, value) => {
  if (!supabase) { console.warn("[setSetting] supabase is null!"); return false; }
  try {
    console.log("[setSetting] upserting key:", key, "value length:", value?.length);
    const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) { console.error("[setSetting] ERROR:", key, error.message, error.code); return false; }
    console.log("[setSetting] OK:", key);
    return true;
  } catch(e) { console.error("[setSetting] CATCH:", key, e); return false; }
};
const supaGetAIKeys = async () => {
  if (!supabase) return {};
  try {
    const { data } = await supabase.from("app_settings").select("key, value").in("key", ["openai_key", "gemini_key", "claude_key", "ai_provider"]);
    const map = {};
    (data || []).forEach(r => { map[r.key] = r.value; });
    return map;
  } catch(e) { return {}; }
};

/* ── Notifications ── */
const supaCreateNotification = async (userId, type, title, body, icon, link) => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("notifications").insert({ user_id: userId, type, title, body: body || "", link: link || "" }).select().single();
    if (error) console.error("[Notif] create error:", error.message);
    return data;
  } catch(e) { return null; }
};
const supaCreateNotificationForAll = async (type, title, body, icon, link, excludeUserId) => {
  if (!supabase) return;
  try {
    const { data: profiles } = await supabase.from("profiles").select("id");
    const users = (profiles || []);
    if (users.length === 0) return;
    const rows = users.map(u => ({ user_id: u.id, type, title, body: body || "", link: link || "" }));
    await supabase.from("notifications").insert(rows);
  } catch(e) { console.error("[Notif] broadcast error:", e); }
};
const supaLoadNotifications = async (userId, limit = 30) => {
  if (!supabase || !userId) return [];
  try {
    const { data } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    return data || [];
  } catch(e) { return []; }
};
const supaMarkNotificationRead = async (id) => {
  if (!supabase) return;
  await supabase.from("notifications").update({ read: true }).eq("id", id);
};
const supaMarkAllNotificationsRead = async (userId) => {
  if (!supabase || !userId) return;
  await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
};

/* ── Invoices (cobranças) ── */
const supaLoadInvoices = async () => { if (!supabase) return []; try { const { data } = await supabase.from("invoices").select("*").order("due_date", { ascending: false }); return data || []; } catch { return []; } };
const supaCreateInvoice = async (inv) => { if (!supabase) return null; try { const { data, error } = await supabase.from("invoices").insert(inv).select().single(); if (error) console.error("[Invoice]", error.message); return data; } catch { return null; } };
const supaUpdateInvoice = async (id, upd) => { if (!supabase) return null; try { const { data } = await supabase.from("invoices").update({ ...upd, updated_at: new Date().toISOString() }).eq("id", id).select().single(); return data; } catch { return null; } };
const supaDeleteInvoice = async (id) => { if (!supabase) return; await supabase.from("invoices").delete().eq("id", id); };

/* ── Expenses (despesas) ── */
const supaLoadExpenses = async () => { if (!supabase) return []; try { const { data } = await supabase.from("expenses").select("*").order("date", { ascending: false }); return data || []; } catch { return []; } };
const supaCreateExpense = async (exp) => { if (!supabase) return null; try { const { data, error } = await supabase.from("expenses").insert(exp).select().single(); if (error) console.error("[Expense]", error.message); return data; } catch { return null; } };
const supaDeleteExpense = async (id) => { if (!supabase) return; await supabase.from("expenses").delete().eq("id", id); };

/* ── Asaas API (via edge function proxy) ── */
const asaasCall = async (action, data = {}) => {
  if (!supabase || !SUPA_URL) return { error: "Supabase não configurado" };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/asaas-proxy`, {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ action, data })
    });
    return await res.json();
  } catch(e) { return { error: e.message }; }
};

const META_APP_ID = "1557196698688426";
const META_CONFIG_ID = "1251666086415367";
const META_REDIRECT_URI = `${window.location.origin}/`;
const META_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts,read_insights";

const startMetaOAuth = (clientId) => {
  /* Store which client we're connecting, to use after redirect */
  try { sessionStorage.setItem("uh_meta_oauth_client", clientId); } catch {}
  /* Use explicit scope — config_id wasn't granting pages_read_engagement */
  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(META_REDIRECT_URI)}&scope=${encodeURIComponent(META_SCOPES)}&response_type=code&state=meta_connect_${clientId}&auth_type=rerequest`;
  console.log("[Meta OAuth] Starting, redirect_uri:", META_REDIRECT_URI);
  window.location.href = url;
};

const handleMetaOAuthCallback = async (code, capturedRedirectUri) => {
  if (!supabase || !SUPA_URL) return { error: "Supabase não configurado" };
  if (!code) return { error: "Código OAuth vazio" };
  const redirectUri = capturedRedirectUri || META_REDIRECT_URI;
  const bodyObj = { code: String(code), client_id: String(META_APP_ID), redirect_uri: String(redirectUri), action: "list_pages" };
  console.log("Meta OAuth: sending to edge function (list_pages), redirect_uri:", redirectUri, "code length:", code.length);
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/meta-oauth-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify(bodyObj)
    });
    let data;
    try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}: resposta inválida` }; }
    console.log("Meta OAuth response:", res.status, JSON.stringify(data).substring(0, 300));
    if (data.error) { console.error("Meta OAuth error:", data.error); return { error: typeof data.error === "string" ? data.error : JSON.stringify(data.error) }; }
    return data;
  } catch(e) { 
    console.error("Meta OAuth callback error:", e); 
    return { error: `Conexão falhou: ${e.message}` };
  }
};

const saveMetaSelectedPage = async (clientId, page) => {
  if (!supabase || !SUPA_URL) return { error: "Supabase não configurado" };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/meta-oauth-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ action: "save_page", client_id: clientId, page_id: page.page_id, page_name: page.page_name, page_token: page.page_token, ig_user_id: page.ig_user_id, ig_username: page.ig_username })
    });
    const data = await res.json();
    if (data.error) return { error: data.error };
    /* Also save to app_settings for local use */
    await saveMetaToken(clientId, page);
    return data;
  } catch(e) { return { error: e.message }; }
};

const saveMetaToken = async (clientId, tokenData) => {
  if (!supabase) return false;
  try {
    /* Save to app_settings as JSON (social_tokens table may have schema issues) */
    const key = `meta_token_${clientId}`;
    const value = JSON.stringify({
      page_id: tokenData.page_id,
      page_name: tokenData.page_name,
      page_token: tokenData.page_token,
      ig_user_id: tokenData.ig_user_id,
      ig_username: tokenData.ig_username,
      pages: tokenData.pages,
      updated_at: new Date().toISOString()
    });
    return await supaSetSetting(key, value);
  } catch(e) { console.error("saveMetaToken catch:", e); return false; }
};

const getMetaConnection = async (clientId) => {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from("social_tokens").select("*").eq("client_id", clientId).eq("platform", "meta").single();
    return data || null;
  } catch(e) { return null; }
};

const publishToMeta = async (clientId, imageUrl, caption, platforms) => {
  if (!supabase || !SUPA_URL) return null;
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/facebook-publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ client_id: clientId, image_url: imageUrl, caption })
    });
    return await res.json();
  } catch(e) { console.error("publishToMeta error:", e); return { error: e.message }; }
};

/* ── Instagram Platform API (Direct Login via Instagram) ── */
const IG_APP_ID = "1380216083791935";
const IG_SCOPES = "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages,instagram_business_manage_comments";

/* Helper: compute scheduled unix timestamp from scheduling object {date:"2026-03-10", time:"18:00"} */
const getScheduledTimestamp = (scheduling) => {
  if (!scheduling?.date || !scheduling?.time) return null;
  try {
    const dt = new Date(`${scheduling.date}T${scheduling.time}:00`);
    if (isNaN(dt.getTime())) return null;
    const ts = Math.floor(dt.getTime() / 1000);
    /* Must be at least 10 min in the future */
    if (ts < Math.floor(Date.now() / 1000) + 600) return null;
    return ts;
  } catch { return null; }
};

const publishToInstagram = async (clientId, imageUrls, caption, mediaType = "FEED", scheduledTime = null) => {
  if (!supabase || !SUPA_URL) return { error: "Supabase não configurado" };
  try {
    const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
    const body = { client_id: clientId, image_urls: urls, caption, media_type: mediaType };
    if (scheduledTime) body.scheduled_publish_time = scheduledTime;
    const res = await fetch(`${SUPA_URL}/functions/v1/instagram-publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    console.log("[IG Publish] Response:", JSON.stringify(data).substring(0, 300));
    return data;
  } catch(e) { console.error("publishToInstagram error:", e); return { error: e.message }; }
};

/* ═══ FETCH META/IG INSIGHTS (via Edge Function proxy) ═══ */
const fetchGraphInsights = async (clientId, since, until) => {
  if (!supabase || !SUPA_URL) return null;
  try {
    const body = { client_id: clientId };
    if (since) body.since = since;
    if (until) body.until = until;
    const res = await fetch(`${SUPA_URL}/functions/v1/social-insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (data.error) { console.warn("social-insights:", data.error); return null; }
    return data;
  } catch (e) { console.error("fetchGraphInsights:", e); return null; }
};
const sumInsight = (data, name) => { if (!data) return 0; const m = data.find(x => x.name === name); return m?.values ? m.values.reduce((a, v) => a + (v.value || 0), 0) : 0; };
const dailyInsight = (data, name) => { if (!data) return []; const m = data.find(x => x.name === name); return (m?.values || []).map(v => ({ date: v.end_time?.split("T")[0] || "", value: v.value || 0 })); };

const startInstagramOAuth = (clientId) => {
  try { sessionStorage.setItem("uh_ig_oauth_client", clientId); } catch {}
  const redirectUri = encodeURIComponent(window.location.origin + "/");
  const url = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${IG_APP_ID}&redirect_uri=${redirectUri}&scope=${encodeURIComponent(IG_SCOPES)}&response_type=code&state=ig_connect_${clientId}`;
  console.log("[Instagram OAuth] Starting with IG Business Login API, redirect_uri:", window.location.origin + "/");
  window.location.href = url;
};

const handleInstagramOAuthCallback = async (code, redirectUri) => {
  if (!supabase || !SUPA_URL) return { error: "Supabase não configurado" };
  if (!code) return { error: "Código OAuth vazio" };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/instagram-oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ code, redirect_uri: redirectUri, client_id: "" })
    });
    let data;
    try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
    console.log("[Instagram OAuth] Response:", res.status, JSON.stringify(data).substring(0, 300));
    if (data.error) return { error: typeof data.error === "string" ? data.error : JSON.stringify(data.error) };
    return data;
  } catch(e) { return { error: e.message }; }
};

const saveInstagramToken = async (clientId, igData) => {
  if (!supabase) return false;
  try {
    const key = `ig_token_${clientId}`;
    const value = JSON.stringify({
      ig_user_id: igData.ig_user_id, username: igData.username,
      profile_picture_url: igData.profile_picture_url, followers_count: igData.followers_count,
      access_token: igData.access_token, account_type: igData.account_type,
      updated_at: new Date().toISOString()
    });
    return await supaSetSetting(key, value);
  } catch(e) { console.error("saveInstagramToken:", e); return false; }
};

const supaCheckInvite = async (email) => {
  if (!supabase || !email) return null;
  try {
    const { data } = await supabase.from("agency_members").select("*").eq("email", email).eq("status", "pendente").limit(1);
    return data?.[0] || null;
  } catch(e) { return null; }
};
const supaLinkInvite = async (inviteId, userId) => {
  if (!supabase) return;
  try {
    await supabase.from("agency_members").update({ user_id: userId, status: "ativo" }).eq("id", inviteId);
    /* Remove duplicate auto-created row from trigger */
    const { data: dupes } = await supabase.from("agency_members").select("id").eq("user_id", userId).neq("id", inviteId);
    if (dupes?.length) { for (const d of dupes) { await supabase.from("agency_members").delete().eq("id", d.id); } }
  } catch(e) {}
};

/* ── Supabase: Chat CRUD ── */

/* ── Supabase: Role Permissions CRUD ── */
const supaLoadPermissions = async () => {
  if (!supabase) return {};
  try {
    const { data } = await supabase.from("role_permissions").select("*");
    const map = {};
    (data || []).forEach(r => { map[r.role] = r.permissions || {}; });
    return map;
  } catch(e) { return {}; }
};
const supaSavePermissions = async (role, permissions) => {
  if (!supabase) return;
  try {
    await supabase.from("role_permissions").upsert({ role, permissions, updated_at: new Date().toISOString() }, { onConflict: "role" });
  } catch(e) { console.error("savePerms:", e); }
};

/* ── Supabase: Chat CRUD (continued) ── */
const supaLoadConversations = async (userId) => {
  if (!supabase || !userId) return [];
  try {
    const { data: memberships } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", userId);
    if (!memberships?.length) return [];
    const convIds = memberships.map(m => m.conversation_id);
    /* Batch: all conversations + all members in 2 queries */
    const [convRes, memRes] = await Promise.all([
      supabase.from("conversations").select("*").in("id", convIds),
      supabase.from("conversation_members").select("conversation_id, user_id, last_read_at").in("conversation_id", convIds),
    ]);
    const convs = convRes.data || [];
    const allMembers = memRes.data || [];
    /* Get only the profiles we need */
    const uniqueUserIds = [...new Set(allMembers.map(m => m.user_id))];
    const profileRes = uniqueUserIds.length > 0
      ? await supabase.from("profiles").select("id, name, email, photo_url").in("id", uniqueUserIds)
      : { data: [] };
    const allProfiles = profileRes.data || [];
    const profileMap = {};
    allProfiles.forEach(p => { profileMap[p.id] = p; });
    /* Get last message per conversation in one query using distinct */
    const { data: recentMsgs } = await supabase.from("messages").select("*").in("conversation_id", convIds).order("created_at", { ascending: false }).limit(convIds.length * 2);
    const lastMsgMap = {};
    (recentMsgs || []).forEach(m => { if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m; });
    const result = [];
    for (const c of convs) {
      const members = allMembers.filter(m => m.conversation_id === c.id);
      const memberProfiles = members.map(m => profileMap[m.user_id]).filter(Boolean);
      const myMembership = members.find(m => m.user_id === userId);
      const lastMsg = lastMsgMap[c.id] || null;
      const unread = lastMsg && myMembership?.last_read_at ? new Date(lastMsg.created_at) > new Date(myMembership.last_read_at) ? 1 : 0 : 0;
      const otherMembership = members.find(m => m.user_id !== userId);
      result.push({ ...c, members: memberProfiles, lastMsg, unread, myLastRead: myMembership?.last_read_at, _otherLastRead: otherMembership?.last_read_at || null });
    }
    return result;
  } catch(e) { console.error("loadConvs:", e); return []; }
};
const supaLoadMessages = async (convId, limit = 50) => {
  if (!supabase || !convId) return [];
  try {
    const { data } = await supabase.from("messages").select("*, profiles:sender_id(name, email)").eq("conversation_id", convId).order("created_at", { ascending: true }).limit(limit);
    return data || [];
  } catch(e) { return []; }
};
const supaSendMessage = async (convId, senderId, content, fileUrl, fileName, fileType) => {
  if (!supabase) return null;
  try {
    const payload = { conversation_id: convId, sender_id: senderId, content: content || "" };
    if (fileUrl) { payload.file_url = fileUrl; payload.file_name = fileName; payload.file_type = fileType; }
    const { data } = await supabase.from("messages").insert(payload).select("*, profiles:sender_id(name, email)");
    return data?.[0] || null;
  } catch(e) { return null; }
};
const supaFindOrCreateDM = async (userId, otherId) => {
  if (!supabase) return null;
  try {
    const { data: myConvs } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", userId);
    const { data: theirConvs } = await supabase.from("conversation_members").select("conversation_id").eq("user_id", otherId);
    const mySet = new Set((myConvs||[]).map(m=>m.conversation_id));
    const shared = (theirConvs||[]).filter(m=>mySet.has(m.conversation_id)).map(m=>m.conversation_id);
    for (const cid of shared) {
      const { data: conv } = await supabase.from("conversations").select("*").eq("id", cid).eq("type", "dm").single();
      if (conv) return conv.id;
    }
    const { data: newConv } = await supabase.from("conversations").insert({ type: "dm", created_by: userId }).select();
    if (!newConv?.[0]) return null;
    await supabase.from("conversation_members").insert([
      { conversation_id: newConv[0].id, user_id: userId },
      { conversation_id: newConv[0].id, user_id: otherId },
    ]);
    return newConv[0].id;
  } catch(e) { console.error("findOrCreateDM:", e); return null; }
};
const supaCreateGroup = async (name, creatorId, memberIds) => {
  if (!supabase) return null;
  try {
    const { data: conv } = await supabase.from("conversations").insert({ type: "group", name, created_by: creatorId }).select();
    if (!conv?.[0]) return null;
    const allIds = [...new Set([creatorId, ...memberIds])];
    await supabase.from("conversation_members").insert(allIds.map(uid => ({ conversation_id: conv[0].id, user_id: uid })));
    return conv[0].id;
  } catch(e) { return null; }
};
const supaMarkRead = async (convId, userId) => {
  if (!supabase) return;
  try { await supabase.from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", convId).eq("user_id", userId); } catch(e) {}
};
const supaTogglePin = async (msgId, pinned) => {
  if (!supabase) return;
  try { await supabase.from("messages").update({ pinned: !pinned }).eq("id", msgId); } catch(e) {}
};
const supaDeleteConversation = async (convId) => {
  if (!supabase) return false;
  try {
    await supabase.from("messages").delete().eq("conversation_id", convId);
    await supabase.from("conversation_members").delete().eq("conversation_id", convId);
    const { error } = await supabase.from("conversations").delete().eq("id", convId);
    return !error;
  } catch(e) { console.error("deleteConv:", e); return false; }
};
const supaToggleReaction = async (msgId, emoji, userId, currentReactions) => {
  if (!supabase) return null;
  try {
    const reactions = { ...(currentReactions || {}) };
    const users = reactions[emoji] || [];
    if (users.includes(userId)) {
      reactions[emoji] = users.filter(u => u !== userId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...users, userId];
    }
    const { data } = await supabase.from("messages").update({ reactions }).eq("id", msgId).select();
    return data?.[0]?.reactions || reactions;
  } catch(e) { return null; }
};
const supaUploadChatFile = async (file) => {
  if (!supabase) return null;
  try {
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("chat-files").upload(path, file);
    if (error) return null;
    const { data: urlData } = supabase.storage.from("chat-files").getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name, type: file.type };
  } catch(e) { return null; }
};

/* ═══════════════════════ CHECKIN HELPERS ═══════════════════════ */
const getGeoPosition = () => new Promise((resolve) => {
  if (!navigator.geolocation) { resolve(null); return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    () => resolve(null),
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  );
});
const supaCheckin = async (userId) => {
  if (!supabase) return null;
  try {
    const geo = await getGeoPosition();
    const payload = { user_id: userId, check_in_at: new Date().toISOString(), check_in_lat: geo?.lat || null, check_in_lng: geo?.lng || null };
    const { data, error } = await supabase.from("checkins").insert(payload).select().single();
    if (error) { console.error("checkin error:", error); return null; }
    return data;
  } catch(e) { console.error(e); return null; }
};
const supaCheckout = async (checkinId) => {
  if (!supabase) return null;
  try {
    const geo = await getGeoPosition();
    const now = new Date();
    const { data: row } = await supabase.from("checkins").select("check_in_at").eq("id", checkinId).single();
    const diffMs = now - new Date(row.check_in_at);
    const durMin = Math.round(diffMs / 60000);
    const { data, error } = await supabase.from("checkins").update({ check_out_at: now.toISOString(), check_out_lat: geo?.lat || null, check_out_lng: geo?.lng || null, duration_minutes: durMin }).eq("id", checkinId).select().single();
    if (error) { console.error("checkout error:", error); return null; }
    return data;
  } catch(e) { console.error(e); return null; }
};
const supaGetActiveCheckin = async (userId) => {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from("checkins").select("*").eq("user_id", userId).is("check_out_at", null).order("check_in_at", { ascending: false }).limit(1);
    return data?.[0] || null;
  } catch(e) { return null; }
};
const supaGetCheckinHistory = async (userId, limit = 30) => {
  if (!supabase) return [];
  try {
    const { data } = await supabase.from("checkins").select("*").eq("user_id", userId).not("check_out_at", "is", null).order("check_in_at", { ascending: false }).limit(limit);
    return data || [];
  } catch(e) { return []; }
};
const supaGetTeamCheckins = async (startDate, endDate) => {
  if (!supabase) return [];
  try {
    let q = supabase.from("checkins").select("*").order("check_in_at", { ascending: false });
    if (startDate) q = q.gte("check_in_at", startDate);
    if (endDate) q = q.lte("check_in_at", endDate);
    const { data, error } = await q.limit(200);
    if (error) { console.error("supaGetTeamCheckins error:", error); return []; }
    return data || [];
  } catch(e) { console.error("supaGetTeamCheckins exception:", e); return []; }
};

const LOGO_B64 = "data:image/png;base64,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";
const THEME_MAP = { "default": "#BBF246", "blue": "#3B82F6", "purple": "#8B5CF6", "pink": "#EC4899", "orange": "#F59E0B", "red": "#EF4444", "cyan": "#06B6D4", "emerald": "#10B981", "indigo": "#6366F1", "rose": "#F43F5E", "amber": "#D97706", "teal": "#14B8A6", "sky": "#0EA5E9", "fuchsia": "#D946EF", "slate": "#64748B" };
function getB(isDark, accent, prefs) {
  const a = accent || "#BBF246";
  const p = prefs || {};
  const hexToLum = (h) => { const r = parseInt(h.slice(1,3),16)/255, g = parseInt(h.slice(3,5),16)/255, b = parseInt(h.slice(5,7),16)/255; return 0.299*r + 0.587*g + 0.114*b; };
  const onAccent = hexToLum(a) > 0.45 ? "#192126" : "#ffffff";
  const base = isDark ? {
    dark: "#192126", accent: a, muted: "#8B9099", text: "#E8EAED", bg: "#0F1419", bgCard: "#1C2228", bgInput: "#1C2228",
    border: "rgba(255,255,255,0.08)", blue: "#60A5FA", green: "#34D399", red: "#F87171", orange: "#FBBF24", purple: "#A78BFA", yellow: "#FBBF24",
    pink: "#F472B6", cyan: "#22D3EE", textOnAccent: onAccent,
  } : {
    dark: "#192126", accent: a, muted: "#8B8F92", text: "#192126", bg: "#F7F7F8", bgCard: "#fff", bgInput: "#fff",
    border: "rgba(11,35,66,0.08)", blue: "#3B82F6", green: "#10B981", red: "#EF4444", orange: "#F59E0B", purple: "#8B5CF6", yellow: "#F59E0B",
    pink: "#EC4899", cyan: "#06B6D4", textOnAccent: onAccent,
  };
  /* Apply theme color overrides from uiPrefs */
  if(p.customBg) base.bg = p.customBg;
  if(p.customBgCard) base.bgCard = p.customBgCard;
  if(p.customBgInput) base.bgInput = p.customBgInput;
  if(p.customText) base.text = p.customText;
  if(p.customMuted) base.muted = p.customMuted;
  if(p.customBorder) base.border = p.customBorder;
  /* Derived */
  base.iconColor = p.iconColor || base.accent;
  base.navActive = p.navActiveColor || base.textOnAccent;
  base.navInactive = p.navInactiveColor || "rgba(255,255,255,0.45)";
  base.blockBg = p.blockBg || (isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)");
  base.iconFill = p.iconFill || "outlined";
  return base;
}
let B = getB(false, "#BBF246");

/* ═══════════════════════ SVG ICONS ═══════════════════════ */
const IC = {
  home: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  content: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>,
  chat: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  clients: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  team: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  calendar: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  academy: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5"/></svg>,
  checkin: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  financial: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  settings: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  more: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  library: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>,
  reports: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  news: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>,
  ideas: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>,
  help: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  headset: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0118 0v6"/><path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"/></svg>,
  target: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  match4biz: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/><path d="M16 8l-4 4-4-4"/></svg>,
  search: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  growth: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  chev: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>,
  back: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>,
  arrowR: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  bell: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  logout: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  plus: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  clock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  play: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  pause: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  star: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
  trophy: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>,
  users: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>,
  dollar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>,
  target: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  trending: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
  /* WhatsApp-style read receipts */
  tickSent: (c) => <svg width="14" height="14" viewBox="0 0 16 11" fill="none"><path d="M11.071.929L5.5 7.5 2.429 4.929" stroke={c||"#919191"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  tickDelivered: (c) => <svg width="18" height="14" viewBox="0 0 20 11" fill="none"><path d="M14.071.929L8.5 7.5 7.429 6.429" stroke={c||"#919191"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M10.071.929L4.5 7.5 1.429 4.929" stroke={c||"#919191"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  tickRead: () => <svg width="18" height="14" viewBox="0 0 20 11" fill="none"><path d="M14.071.929L8.5 7.5 7.429 6.429" stroke="#53BDEB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M10.071.929L4.5 7.5 1.429 4.929" stroke="#53BDEB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  briefcase: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>,
  mail: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  lock: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
  shield: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  eye: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  eyeOff: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
  camera: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  palette: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>,
  phone: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
  phone2: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
  sos: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9.5 9h5"/><line x1="12" y1="9" x2="12" y2="15"/></svg>,
  device: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  share: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  img: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  vid: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
  doc: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  upload: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  /* Social Network Icons */
  instagram: (sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none"/></svg>,
  facebook: (sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>,
  tiktok: (sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.89 2.89 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.14 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.48a8.27 8.27 0 004.77 1.52V7.55a4.82 4.82 0 01-1-.86z"/></svg>,
  linkedin: (sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>,
  youtube: (sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M22.54 6.42a2.78 2.78 0 00-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 00-1.94 2A29 29 0 001 11.75a29 29 0 00.46 5.33A2.78 2.78 0 003.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 001.94-2 29 29 0 00.46-5.25 29 29 0 00-.46-5.43z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#fff"/></svg>,
  twitter: (sz=16) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  info: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  zap: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  award: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
  bookmark: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>,
  clipboard: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>,
  ai: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M12 2a4 4 0 014 4v1h1a3 3 0 013 3v1a3 3 0 01-3 3h-1v4a4 4 0 01-8 0v-4H7a3 3 0 01-3-3v-1a3 3 0 013-3h1V6a4 4 0 014-4z"/><circle cx="9.5" cy="10" r="1" fill={c||"currentColor"} stroke="none"/><circle cx="14.5" cy="10" r="1" fill={c||"currentColor"} stroke="none"/><path d="M9 14h6" strokeWidth="1.5"/></svg>,
  gamify: c => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c||"currentColor"} strokeWidth="2" strokeLinecap="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>,
  bar: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  signal: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>,
};

/* ═══════════════════════ TEAM DATA ═══════════════════════ */
const TEAM_PHOTOS = {
  matheus: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAA8ADwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyKV98hYdO30plJSqNxxVNgJRUyKkZ+cbs++KtpYNcDMVvIw/2FzUOSW5Sg3sZ1LVie0aFirK6MP4XXBqDFWtSWmtwFODcU2imSNNTCPcVQDHqfWojV/TzGLmNpE3rvUsvqM8j8qllx1ZpWempCivOgRWHDSDGfp6/hXRaas0NsfsmnSybj9+VCqD6Dqf0rc+yw3CvNBCptpYgS8YDbZBnk/3cg4yPTmo9HuwB5EpGEPWuKUuZHoqCg7XOe1m3kvoVSXzN7qxjBiVQjL6d8dc81xMiFHZWGCDgj0r3C90+G6gyMKw5Vh/CR0IrzvxXp+kQWpeJJLa7jCqq5UrN65AOQQOc8ZrSjUt7rMa9JtcyOQpfxopa7DhCaIxHB69/rVnTm3Txx/xFwBS3qA7dnOB2qxoVhNPq8AEZG1txzxUytuVTu2js7a0ltEeZJnXep3IjEBh2z61lQahKsh9a6mOBnTyyuMjFcrrPhu8tZZJ4GLqQSVxziuOMk3qehU5raHTaXeDUkFnJKyoxBPbOOwrn/G/kR2IiRHV0mCYdQCOvce1YVrqU9rJ8zEevP9Ks+ItS+26Xbb+Zd5ySckDFVGnaaZnKp7jRzmaWm0orrRxHQeTH3HXuODS/ZpFwY5Mr6NyPzpx6rUkTkOB2J6Vd+5Frao0bLxHd2gWG6XzlX7pY4cfRu/510ttrWk6vCsD3Rt5WGP3wwG+jdK5QxJIAjKCG6sseZmtbwJGco8mxlbkHjr9a440IvU6KeImtB3izTJNL16aKPcYgqMrA9cisIkk5JyfeuodQ+UI4HSsa+t413Oq7SCOnfNXFWViJSu7lACtO10HVbuATQabcyRt0ZYjg021jXzGGBjFatvqmo2kQhttQuYoxyFWQ4FaRt1MZuVvdP//Z",
};

const AGENCY_TEAM = [
  { id: 1, name: "Matheus", role: "CEO / Estrategista", photo: TEAM_PHOTOS.matheus, status: "online" },
  { id: 2, name: "Alice", role: "Social Media", photo: null, status: "online" },
  { id: 3, name: "Allan", role: "Social Media", photo: null, status: "offline" },
  { id: 4, name: "Victoria", role: "Audiovisual", photo: null, status: "online" },
];

const CLIENTS_DATA_INIT = [
  { id: 1, name: "Casa Nova Imóveis", plan: "Premium", status: "ativo", monthly: "R$ 3.500", pending: 3, score: 78,
    contact: "Roberto Silva", phone: "(24) 99876-5432", email: "roberto@casanova.com.br", cnpj: "12.345.678/0001-90", address: "Rua das Flores, 123 - Petrópolis/RJ", segment: "Imobiliário", since: "03/2025",
    socials: { instagram: { connected: true, user: "@casanovaimoveis", followers: "12.4k" }, facebook: { connected: true, user: "Casa Nova Imóveis", followers: "8.2k" }, google: { connected: true, user: "Casa Nova Imóveis", reviews: "4.7★" }, tiktok: { connected: false }, linkedin: { connected: false }, youtube: { connected: false } },
    files: [
      { id:101, name:"manual_marca_casanova.pdf", category:"Manual de Marca", date:"15/03/2025", size:"12.4MB" },
      { id:102, name:"logo_casanova_principal.svg", category:"Manual de Marca", date:"15/03/2025", size:"0.8MB" },
      { id:103, name:"logo_casanova_branca.png", category:"Manual de Marca", date:"15/03/2025", size:"1.2MB" },
      { id:104, name:"paleta_cores_tipografia.pdf", category:"Manual de Marca", date:"15/03/2025", size:"3.1MB" },
      { id:105, name:"post_condominio_luxo_feed.png", category:"Posts Feed", date:"20/02/2026", size:"2.8MB" },
      { id:106, name:"carrossel_diferenciais_5slides.psd", category:"Posts Feed", date:"18/02/2026", size:"45MB" },
      { id:107, name:"post_apartamento_centro.jpg", category:"Posts Feed", date:"10/02/2026", size:"3.2MB" },
      { id:108, name:"story_visita_obra.png", category:"Stories", date:"22/02/2026", size:"1.5MB" },
      { id:109, name:"story_depoimento_cliente.png", category:"Stories", date:"19/02/2026", size:"1.8MB" },
      { id:110, name:"story_link_imovel.png", category:"Stories", date:"14/02/2026", size:"1.1MB" },
      { id:111, name:"capa_reels_tour_apto.png", category:"Capas de Reels", date:"21/02/2026", size:"2.1MB" },
      { id:112, name:"capa_reels_dicas_compra.png", category:"Capas de Reels", date:"12/02/2026", size:"1.9MB" },
      { id:113, name:"video_tour_condominio.mp4", category:"Vídeos", date:"20/02/2026", size:"128MB" },
      { id:114, name:"reels_antes_depois_reforma.mp4", category:"Vídeos", date:"15/02/2026", size:"45MB" },
      { id:115, name:"flyer_feirão_imoveis_A4.pdf", category:"Material Impresso", date:"01/02/2026", size:"8.5MB" },
      { id:116, name:"cartao_visita_roberto.pdf", category:"Material Impresso", date:"15/03/2025", size:"2.3MB" },
      { id:117, name:"banner_fachada_3x1m.pdf", category:"Material Impresso", date:"20/01/2026", size:"15MB" },
    ] },
  { id: 2, name: "Bella Estética", plan: "Essencial", status: "ativo", monthly: "R$ 2.200", pending: 1, score: 85,
    contact: "Dra. Fernanda Reis", phone: "(24) 98765-4321", email: "fernanda@bellestetica.com.br", cnpj: "98.765.432/0001-10", address: "Av. Brasil, 456 - Petrópolis/RJ", segment: "Estética", since: "06/2025",
    socials: { instagram: { connected: true, user: "@bellastetica", followers: "5.8k" }, facebook: { connected: true, user: "Bella Estética", followers: "3.1k" }, google: { connected: false }, tiktok: { connected: false }, linkedin: { connected: false }, youtube: { connected: false } },
    files: [
      { id:201, name:"brandbook_bella_estetica.pdf", category:"Manual de Marca", date:"10/06/2025", size:"8.7MB" },
      { id:202, name:"logo_bella_rosa.svg", category:"Manual de Marca", date:"10/06/2025", size:"0.5MB" },
      { id:203, name:"post_promocao_botox.png", category:"Posts Feed", date:"25/02/2026", size:"2.4MB" },
      { id:204, name:"carrossel_tratamentos_faciais.psd", category:"Posts Feed", date:"20/02/2026", size:"38MB" },
      { id:205, name:"story_resultado_peeling.png", category:"Stories", date:"24/02/2026", size:"1.6MB" },
      { id:206, name:"story_agenda_aberta.png", category:"Stories", date:"22/02/2026", size:"0.9MB" },
      { id:207, name:"capa_reels_antes_depois.png", category:"Capas de Reels", date:"23/02/2026", size:"2.0MB" },
      { id:208, name:"video_procedimento_laser.mp4", category:"Vídeos", date:"18/02/2026", size:"85MB" },
      { id:209, name:"folder_servicos_A5.pdf", category:"Material Impresso", date:"15/01/2026", size:"5.2MB" },
    ] },
  { id: 3, name: "TechSmart", plan: "Premium", status: "ativo", monthly: "R$ 4.000", pending: 0, score: 92,
    contact: "Lucas Andrade", phone: "(24) 91234-5678", email: "lucas@techsmart.com.br", cnpj: "55.123.456/0001-22", address: "Rua Tech, 789 - Petrópolis/RJ", segment: "Tecnologia", since: "01/2025",
    socials: { instagram: { connected: true, user: "@techsmart.br", followers: "22k" }, facebook: { connected: true, user: "TechSmart Brasil", followers: "15k" }, google: { connected: true, user: "TechSmart", reviews: "4.9★" }, tiktok: { connected: true, user: "@techsmart", followers: "45k" }, linkedin: { connected: true, user: "TechSmart", followers: "3.2k" }, youtube: { connected: true, user: "TechSmart BR", followers: "1.8k" } },
    files: [
      { id:301, name:"manual_marca_techsmart_v3.pdf", category:"Manual de Marca", date:"05/01/2025", size:"18MB" },
      { id:302, name:"logo_techsmart_azul.svg", category:"Manual de Marca", date:"05/01/2025", size:"0.6MB" },
      { id:303, name:"logo_techsmart_branco.png", category:"Manual de Marca", date:"05/01/2025", size:"0.9MB" },
      { id:304, name:"post_lancamento_produto_x1.png", category:"Posts Feed", date:"27/02/2026", size:"3.1MB" },
      { id:305, name:"carrossel_review_notebook_8slides.psd", category:"Posts Feed", date:"22/02/2026", size:"52MB" },
      { id:306, name:"post_comparativo_smartphones.png", category:"Posts Feed", date:"17/02/2026", size:"2.9MB" },
      { id:307, name:"story_unboxing_fone.png", category:"Stories", date:"26/02/2026", size:"1.4MB" },
      { id:308, name:"story_cupom_desconto.png", category:"Stories", date:"20/02/2026", size:"0.8MB" },
      { id:309, name:"capa_reels_top5_gadgets.png", category:"Capas de Reels", date:"25/02/2026", size:"2.2MB" },
      { id:310, name:"capa_reels_setup_tour.png", category:"Capas de Reels", date:"18/02/2026", size:"1.8MB" },
      { id:311, name:"video_review_completo_notebook.mp4", category:"Vídeos", date:"24/02/2026", size:"320MB" },
      { id:312, name:"reels_unboxing_rapido.mp4", category:"Vídeos", date:"20/02/2026", size:"55MB" },
      { id:313, name:"tiktok_dica_rapida_wifi.mp4", category:"Vídeos", date:"15/02/2026", size:"22MB" },
      { id:314, name:"arte_banner_digital_site.png", category:"Artes Digitais", date:"10/02/2026", size:"4.5MB" },
      { id:315, name:"thumbnail_youtube_review.png", category:"Artes Digitais", date:"24/02/2026", size:"1.7MB" },
      { id:316, name:"flyer_inauguracao_loja.pdf", category:"Material Impresso", date:"20/12/2025", size:"9.8MB" },
    ] },
  { id: 4, name: "Padaria Real", plan: "Básico", status: "ativo", monthly: "R$ 1.500", pending: 2, score: 65,
    contact: "José Carlos", phone: "(24) 99111-2233", email: "jose@padariareal.com.br", cnpj: "33.444.555/0001-66", address: "Rua do Pão, 10 - Petrópolis/RJ", segment: "Alimentação", since: "09/2025",
    socials: { instagram: { connected: true, user: "@padariareal", followers: "2.1k" }, facebook: { connected: false }, google: { connected: true, user: "Padaria Real", reviews: "4.5★" }, tiktok: { connected: false }, linkedin: { connected: false }, youtube: { connected: false } },
    files: [
      { id:401, name:"logo_padaria_real.png", category:"Manual de Marca", date:"01/09/2025", size:"1.1MB" },
      { id:402, name:"post_pao_artesanal.jpg", category:"Posts Feed", date:"25/02/2026", size:"2.5MB" },
      { id:403, name:"post_cafe_especial.jpg", category:"Posts Feed", date:"18/02/2026", size:"2.1MB" },
      { id:404, name:"story_promo_segunda.png", category:"Stories", date:"24/02/2026", size:"0.9MB" },
      { id:405, name:"cardapio_digital.pdf", category:"Material Impresso", date:"15/01/2026", size:"6.3MB" },
    ] },
  { id: 5, name: "Studio Fitness", plan: "Essencial", status: "ativo", monthly: "R$ 2.800", pending: 1, score: 71,
    contact: "Carla Mendes", phone: "(24) 98888-7777", email: "carla@studiofitness.com.br", cnpj: "77.888.999/0001-11", address: "Av. Fitness, 200 - Petrópolis/RJ", segment: "Fitness", since: "04/2025",
    socials: { instagram: { connected: true, user: "@studiofitness", followers: "8.9k" }, facebook: { connected: true, user: "Studio Fitness", followers: "4.5k" }, google: { connected: false }, tiktok: { connected: true, user: "@studiofitness", followers: "12k" }, linkedin: { connected: false }, youtube: { connected: true, user: "Studio Fitness", followers: "890" } },
    files: [
      { id:501, name:"brandbook_studio_fitness.pdf", category:"Manual de Marca", date:"10/04/2025", size:"10MB" },
      { id:502, name:"logo_studio_laranja.svg", category:"Manual de Marca", date:"10/04/2025", size:"0.4MB" },
      { id:503, name:"post_desafio_30dias.png", category:"Posts Feed", date:"26/02/2026", size:"2.7MB" },
      { id:504, name:"carrossel_exercicios_casa.psd", category:"Posts Feed", date:"19/02/2026", size:"35MB" },
      { id:505, name:"story_horario_aulas.png", category:"Stories", date:"25/02/2026", size:"1.0MB" },
      { id:506, name:"capa_reels_treino_perna.png", category:"Capas de Reels", date:"23/02/2026", size:"1.9MB" },
      { id:507, name:"video_aula_funcional.mp4", category:"Vídeos", date:"21/02/2026", size:"180MB" },
      { id:508, name:"reels_transformacao_aluno.mp4", category:"Vídeos", date:"16/02/2026", size:"42MB" },
      { id:509, name:"banner_matricula_60x90.pdf", category:"Material Impresso", date:"01/01/2026", size:"7.8MB" },
    ] },
  { id: 6, name: "Clínica Saúde+", plan: "Premium", status: "trial", monthly: "R$ 3.200", pending: 4, score: 45,
    contact: "Dr. Marcos Lima", phone: "(24) 97777-6666", email: "marcos@clinicasaude.com.br", cnpj: "66.777.888/0001-33", address: "Rua da Saúde, 500 - Petrópolis/RJ", segment: "Saúde", since: "02/2026",
    socials: { instagram: { connected: false }, facebook: { connected: false }, google: { connected: true, user: "Clínica Saúde+", reviews: "4.3★" }, tiktok: { connected: false }, linkedin: { connected: false }, youtube: { connected: false } },
    files: [
      { id:601, name:"logo_clinica_saude.png", category:"Manual de Marca", date:"01/02/2026", size:"1.5MB" },
      { id:602, name:"post_checkup_anual.png", category:"Posts Feed", date:"20/02/2026", size:"2.2MB" },
      { id:603, name:"story_dica_saude.png", category:"Stories", date:"22/02/2026", size:"1.0MB" },
    ] },
  { id: 7, name: "Pet Love Shop", plan: "Básico", status: "ativo", monthly: "R$ 1.200", pending: 0, score: 88,
    contact: "Ana Paula", phone: "(24) 96666-5555", email: "ana@petloveshop.com.br", cnpj: "11.222.333/0001-44", address: "Rua Pet, 80 - Petrópolis/RJ", segment: "Pet", since: "07/2025",
    socials: { instagram: { connected: true, user: "@petloveshop", followers: "6.7k" }, facebook: { connected: true, user: "Pet Love Shop", followers: "2.9k" }, google: { connected: true, user: "Pet Love Shop", reviews: "4.8★" }, tiktok: { connected: true, user: "@petloveshop", followers: "18k" }, linkedin: { connected: false }, youtube: { connected: false } },
    files: [
      { id:701, name:"logo_petlove.svg", category:"Manual de Marca", date:"01/07/2025", size:"0.3MB" },
      { id:702, name:"post_racao_premium.jpg", category:"Posts Feed", date:"26/02/2026", size:"2.0MB" },
      { id:703, name:"post_dia_do_gato.png", category:"Posts Feed", date:"17/02/2026", size:"2.4MB" },
      { id:704, name:"story_promo_banho.png", category:"Stories", date:"25/02/2026", size:"0.8MB" },
      { id:705, name:"capa_reels_dicas_pet.png", category:"Capas de Reels", date:"22/02/2026", size:"1.6MB" },
      { id:706, name:"tiktok_cachorro_fofo.mp4", category:"Vídeos", date:"20/02/2026", size:"30MB" },
      { id:707, name:"adesivo_vitrine_loja.pdf", category:"Material Impresso", date:"10/12/2025", size:"4.1MB" },
    ] },
];

/* ═══════════════════════ DEMAND / CONTENT DATA ═══════════════════════ */
const SOCIAL_STAGES = ["idea","briefing","design","caption","review","client","published"];
const CAMPAIGN_STAGES = ["planning","creation","review","execution","completed"];
const VIDEO_STAGES = ["idea","briefing","production","editing","review","client","published"];
const STAGE_CFG = {
  idea:{l:"Ideia",c:"#8B5CF6"},briefing:{l:"Briefing",c:"#3B82F6"},design:{l:"Design",c:"#EC4899"},
  caption:{l:"Legenda",c:"#F59E0B"},review:{l:"Revisão",c:"#06B6D4"},client:{l:"Cliente",c:"#10B981"},
  published:{l:"Publicado",c:"#BBF246"},planning:{l:"Planejamento",c:"#8B5CF6"},creation:{l:"Criação",c:"#3B82F6"},
  execution:{l:"Execução",c:"#EC4899"},completed:{l:"Concluído",c:"#10B981"},production:{l:"Produção",c:"#EC4899"},
  editing:{l:"Edição",c:"#F59E0B"},
};
const NETWORK_CFG = {
  Instagram: { icon: "instagram", c: "#E1306C" }, Facebook: { icon: "facebook", c: "#1877F2" },
  TikTok: { icon: "tiktok", c: "#010101" }, LinkedIn: { icon: "linkedin", c: "#0A66C2" },
  YouTube: { icon: "youtube", c: "#FF0000" }, Twitter: { icon: "twitter", c: "#1D9BF0" },
};
const NetworkIcon = ({ name, sz, active }) => {
  const cfg = NETWORK_CFG[name]; if (!cfg) return null;
  const fn = IC[cfg.icon]; if (!fn) return null;
  return <span style={{ display:"flex", color: active ? cfg.c : B.muted }}>{fn(sz||16)}</span>;
};
const DEMANDS_INIT = [
  { id:1, type:"social", client:"Casa Nova Imóveis", title:"Carrossel lançamento condomínio", stage:"client", network:"Instagram", format:"Carrossel", sponsored:true, priority:"alta",
    assignees:["Alice","Victoria"], createdAt:"20/02",
    steps:{ idea:{by:"Matheus",text:"Post carrossel com fotos aéreas do drone, destacar área de lazer completa",date:"20/02"},
      briefing:{by:"Alice",text:"5 slides 1080x1080. Slide 1: fachada. Slides 2-4: lazer. Slide 5: CTA. Tons quentes, logo cliente no canto.",date:"21/02"},
      design:{by:"Victoria",files:["carrossel_parque_v2.psd"],date:"22/02"},
      caption:{by:"Alice",text:"🏡 Seu novo lar te espera no Parque das Flores!\n\n✅ Área de lazer completa\n✅ Segurança 24h\n✅ Localização privilegiada\n\n📲 Agende sua visita!",hashtags:"#imoveis #mktdigital #condominio",date:"23/02"},
      review:{by:"Matheus",status:"approved",note:"Ótimo trabalho!",date:"24/02"},
      client:{status:"pending"},
    },
    scheduling:{date:"28/02",time:"18:00"}, traffic:{budget:"R$ 150"}
  },
  { id:2, type:"social", client:"Bella Estética", title:"Stories promoção Março", stage:"design", network:"Instagram", format:"Stories", sponsored:false, priority:"média",
    assignees:["Alice"], createdAt:"22/02",
    steps:{ idea:{by:"Matheus",text:"Sequência de stories para promoção de março: peeling + limpeza de pele com 30% off",date:"22/02"},
      briefing:{by:"Alice",text:"6 stories verticais. Antes/depois, depoimentos, preço. Rosa e dourado.",date:"23/02"},
      design:{by:null,files:[],date:null},
    },
    scheduling:{date:"01/03",time:"10:00"}, traffic:{}
  },
  { id:3, type:"social", client:"TechSmart", title:"Reels unboxing novo produto", stage:"caption", network:"Instagram", format:"Reels", sponsored:true, priority:"alta",
    assignees:["Victoria","Alice"], createdAt:"23/02",
    steps:{ idea:{by:"Matheus",text:"Reels estilo unboxing do novo gadget, mostrar funcionalidades em 30s",date:"23/02"},
      briefing:{by:"Alice",text:"Vertical 9:16, máx 30s. Trilha trending. Texto overlay com features. CTA final.",date:"23/02"},
      design:{by:"Victoria",files:["reels_unbox_v1.mp4"],date:"24/02"},
    },
    scheduling:{date:"02/03",time:"12:00"}, traffic:{budget:"R$ 200"}
  },
  { id:4, type:"social", client:"Padaria Real", title:"Post menu especial", stage:"published", network:"Instagram", format:"Feed", sponsored:false, priority:"baixa",
    assignees:["Alice"], createdAt:"18/02",
    steps:{ idea:{by:"Alice",text:"Post simples com foto do menu do fim de semana",date:"18/02"},
      briefing:{by:"Alice",text:"1080x1080, foto do menu com overlay de texto. Cores quentes.",date:"18/02"},
      design:{by:"Victoria",files:["menu_fds.psd"],date:"19/02"},
      caption:{by:"Alice",text:"🍞 Menu especial de sábado chegou!\n\nConfira as delícias que preparamos 😋",hashtags:"#padaria #mktdigital",date:"19/02"},
      review:{by:"Matheus",status:"approved",note:"OK",date:"19/02"},
      client:{status:"approved",note:"Perfeito!",date:"20/02"},
      published:{date:"20/02"},
    },
    scheduling:{date:"20/02",time:"09:00"}, traffic:{}
  },
  { id:5, type:"social", client:"Studio Fitness", title:"Carrossel planos semestrais", stage:"review", network:"Instagram", format:"Carrossel", sponsored:true, priority:"média",
    assignees:["Alice","Victoria"], createdAt:"24/02",
    steps:{ idea:{by:"Matheus",text:"Carrossel comparativo dos planos semestrais com benefícios",date:"24/02"},
      briefing:{by:"Alice",text:"4 slides: 1-capa impacto, 2-plano básico, 3-plano premium, 4-CTA. Preto e verde neon.",date:"24/02"},
      design:{by:"Victoria",files:["planos_v1.psd"],date:"25/02"},
      caption:{by:"Alice",text:"💪 Plano semestral com condições IMPERDÍVEIS!\n\nEscolha o seu e comece a transformação 🔥",hashtags:"#fitness #academia #treino",date:"25/02"},
    },
    scheduling:{date:"03/03",time:"17:00"}, traffic:{budget:"R$ 100"}
  },
  { id:6, type:"campaign", client:"Casa Nova Imóveis", title:"Feirão de Imóveis Março", stage:"creation", priority:"alta",
    assignees:["Matheus","Alice","Victoria","Allan"], createdAt:"25/02",
    campaign:{ desc:"Feirão presencial com condições especiais. Stand decorado, materiais impressos, mídia social e tráfego pago.",
      refs:"Feirões anteriores Cyrela e MRV. Tom premium mas acessível.", dateStart:"15/03", dateEnd:"22/03",
      location:"Shopping Petrópolis - Praça de Eventos", needs:["Stand 3x3m","Banner 2m","Flyers 1000un","Balões","Toten digital"],
      clientTeam:["Roberto (diretor)","Carla (corretora)"], budget:"R$ 5.000",
      budgetBreakdown:[{item:"Tráfego pago",val:"R$ 2.000"},{item:"Material impresso",val:"R$ 1.500"},{item:"Decoração stand",val:"R$ 1.000"},{item:"Reserva",val:"R$ 500"}],
      milestones:[{l:"Briefing completo",done:true},{l:"Materiais gráficos",done:false},{l:"Campanha tráfego",done:false},{l:"Montagem stand",done:false},{l:"Evento ao vivo",done:false}]
    }
  },
  { id:7, type:"campaign", client:"Bella Estética", title:"Campanha Dia da Mulher", stage:"planning", priority:"alta",
    assignees:["Matheus","Alice"], createdAt:"26/02",
    campaign:{ desc:"Campanha online e presencial para o Dia da Mulher. Combos especiais, sorteio e conteúdo empoderador.",
      refs:"Campanhas Sephora e MAC Dia da Mulher", dateStart:"01/03", dateEnd:"08/03",
      location:"Online + Clínica", needs:["Kits presente","Decoração temática","Fotógrafo"],
      clientTeam:["Dra. Fernanda"], budget:"R$ 3.000",
      budgetBreakdown:[{item:"Tráfego",val:"R$ 1.500"},{item:"Brindes/kits",val:"R$ 1.000"},{item:"Fotógrafo",val:"R$ 500"}],
      milestones:[{l:"Planejamento estratégico",done:true},{l:"Criação de artes",done:false},{l:"Gravação conteúdo",done:false},{l:"Ativação campanha",done:false}]
    }
  },
  { id:8, type:"video", client:"TechSmart", title:"Vídeo institucional 2026", stage:"briefing", priority:"alta",
    assignees:["Victoria","Matheus"], createdAt:"25/02",
    steps:{ idea:{by:"Matheus",text:"Vídeo institucional de 1-2min mostrando a empresa, produtos e equipe. Para LinkedIn e YouTube.",date:"25/02"} },
    scheduling:{date:"20/03",time:"10:00"}, traffic:{}
  },
];

/* ═══════════════════════ UTILITY COMPONENTS ═══════════════════════ */
const Logo = ({ size = 32 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: B.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="#192126" strokeWidth="2.5" strokeLinecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
    </div>
    {size >= 28 && <div><span style={{ fontSize: size * 0.45, fontWeight: 800, color: B.text, letterSpacing: -0.5 }}>Unique</span><span style={{ fontSize: size * 0.45, fontWeight: 800, color: B.accent, letterSpacing: -0.5 }}>Hub</span><span style={{ fontSize: size * 0.22, color: B.muted, fontWeight: 600, marginLeft: 4 }}>Agency</span></div>}
  </div>
);

const Card = ({ children, style, delay, onClick }) => (
  <div className="card ani" onClick={onClick} style={{ ...style, animationDelay: delay ? `${delay}s` : "0s" }}>{children}</div>
);

const Tag = ({ children, color }) => (
  <span className="tag" style={{ color, background: `${color}12` }}>{children}</span>
);

const Badge = ({ n, style }) => n > 0 ? <span style={{ ...style, position: "absolute", minWidth: 16, height: 16, borderRadius: 8, background: B.red, color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{n > 99 ? "99+" : n}</span> : null;

const Toggle = ({ on, onToggle }) => (
  <button onClick={onToggle} style={{ width: 46, height: 26, borderRadius: 13, background: on ? B.accent : (B.bg === "#0F1419" ? "#3A3F44" : "#ddd"), border: "none", cursor: "pointer", position: "relative", transition: "all .2s", padding: 0 }}>
    <div style={{ width: 22, height: 22, borderRadius: 11, background: B.bgCard, position: "absolute", top: 2, left: on ? 22 : 2, transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
  </button>
);

const Head = ({ title, onBack, right }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, paddingTop: 8 }}>
    {onBack && <button onClick={onBack} className="ib" style={{ border:`1.5px solid ${B.border}` }}>{IC.back()}</button>}
    <h2 style={{ fontSize: 18, fontWeight: 800, flex: 1 }}>{title}</h2>
    {right}
  </div>
);

const Av = ({ src, name, sz = 40, fs = 16 }) => (
  <div style={{ width: sz, height: sz, borderRadius: sz * 0.35, background: src ? "transparent" : `${B.accent}20`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
    {src ? <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontWeight: 800, fontSize: fs, color: B.accent }}>{(name || "U")[0].toUpperCase()}</span>}
  </div>
);
/* ── CollapseHeader: reusable collapsible page header ── */
const CollapseHeader = ({ icon, label, title, stats=[], onAdd, onBack, collapsed }) => (
  <div style={{
    position:"sticky", top:0, zIndex:20, background:B.bgCard,
    borderBottom: collapsed ? `1px solid ${B.border}` : "none",
    borderRadius: collapsed ? 0 : "0 0 26px 26px",
    boxShadow: collapsed ? "none" : "0 4px 20px rgba(0,0,0,0.08)",
    transition:"all .26s cubic-bezier(.4,0,.2,1)", overflow:"hidden",
  }}>
    {collapsed ? (
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 20px" }}>
        {onBack && <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", color:B.text, padding:0, flexShrink:0 }}>{IC.back()}</button>}
        <div style={{ width:32, height:32, borderRadius:10, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {typeof icon === "function" ? icon(B.accent) : icon}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:13, fontWeight:800, color:B.text }}>{title}</p>
          {stats.length>0 && <p style={{ fontSize:10, color:B.muted, marginTop:1 }}>{stats.map(s=>`${s.val} ${s.label}`).join(" · ")}</p>}
        </div>
        {onAdd && <button onClick={onAdd} style={{ width:34, height:34, borderRadius:10, background:B.accent, border:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>}
      </div>
    ) : (
      <div style={{ padding:`calc(env(safe-area-inset-top,0px) + 20px) 20px 22px` }}>
        {onBack && <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", alignItems:"center", color:B.text, padding:0, marginBottom:8 }}>{IC.back()}</button>}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:stats.length?16:0 }}>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:B.accent, textTransform:"uppercase", letterSpacing:1.2, marginBottom:4 }}>{label}</p>
            <h2 style={{ fontSize:24, fontWeight:900, color:B.text, letterSpacing:"-0.5px", lineHeight:1 }}>{title}</h2>
          </div>
          {onAdd && <button onClick={onAdd} style={{ width:44, height:44, borderRadius:"50%", background:B.accent, border:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, boxShadow:`0 4px 14px ${B.accent}50` }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0D0D0D" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>}
        </div>
        {stats.length>0 && (
          <div style={{ display:"flex", gap:10 }}>
            {stats.map((s,i) => (
              <div key={i} style={{ flex:1, background:i===0?`${B.accent}12`:B.bgCard, border:i===0?"none":`1px solid ${B.border}`, borderRadius:14, padding:"12px 14px" }}>
                <p style={{ fontSize:22, fontWeight:900, color:i===0?B.accent:B.text, lineHeight:1 }}>{s.val}</p>
                <p style={{ fontSize:10, color:B.muted, marginTop:3, fontWeight:600 }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
);


function useToast() {
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const isError = toast && (toast.includes("Erro") || toast.includes("erro") || toast.includes("falh"));
  const ToastEl = toast ? <div className="toast-anim" style={{ position:"fixed", top:60, left:"50%", transform:"translateX(-50%)", background:isError?"#FF3B30":B.dark, color:"#fff", padding:"10px 20px", borderRadius:14, fontSize:13, fontWeight:600, zIndex:999, boxShadow:"0 4px 20px rgba(0,0,0,0.3)", display:"flex", alignItems:"center", gap:8, maxWidth:"90%", textAlign:"center" }}>{isError ? <span>❌</span> : <span style={{ color:B.accent }}>{IC.check}</span>}{toast}</div> : null;
  return { toast, showToast, ToastEl };
}

/* ═══════════════════════ LOGIN / AUTH ═══════════════════════ */
/* ═══════════════════════ ONBOARDING SLIDES ═══════════════════════ */
function OnboardingSlides({ onDone }) {
  const [idx, setIdx] = React.useState(0);
  const [startX, setStartX] = React.useState(0);
  const [offsetX, setOffsetX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);

  const SLIDES = [
    { img: "data:image/jpeg;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/2Q==", accent: "#BBF246" },
    { img: "data:image/jpeg;base64,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", accent: "#BBF246" },
    { img: "data:image/jpeg;base64,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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/2Q==", accent: "#BBF246" },
  ];

  const N = SLIDES.length;
  const W = typeof window !== "undefined" ? window.innerWidth : 390;

  const getX = (e) => e.touches ? e.touches[0].clientX : e.clientX;

  const onStart = (e) => { setStartX(getX(e)); setDragging(true); };
  const onMove  = (e) => { if (!dragging) return; setOffsetX(getX(e) - startX); };
  const onEnd   = () => {
    if (!dragging) return;
    setDragging(false);
    if (offsetX < -60 && idx < N - 1) setIdx(i => i + 1);
    else if (offsetX > 60 && idx > 0) setIdx(i => i - 1);
    setOffsetX(0);
  };

  const tx = -idx * W + offsetX;
  const sl = SLIDES[idx];

  return (
    <div
      style={{ position:"fixed", top:0, left:0, right:0, bottom:0, background:"#000", overflow:"hidden", touchAction:"pan-y", userSelect:"none" }}
      onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      onMouseDown={onStart} onMouseMove={onMove} onMouseUp={onEnd} onMouseLeave={onEnd}
    >
      {/* ── SLIDE STRIP ── */}
      <div style={{
        display:"flex", height:"100%",
        width: N * W,
        transform: `translateX(${tx}px)`,
        transition: dragging ? "none" : "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
        willChange: "transform",
      }}>
        {SLIDES.map((s, i) => (
          <div key={i} style={{ width: W, height:"100%", flexShrink:0, position:"relative" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, backgroundImage:`url(${s.img})`, backgroundSize:"cover", backgroundPosition:"center top" }} />

          </div>
        ))}
      </div>

      {/* ── SKIP ── */}
      <button onClick={onDone} style={{ position:"absolute", top:"calc(env(safe-area-inset-top,0px) + 18px)", right:24, background:"none", border:"none", color:"rgba(255,255,255,0.55)", fontSize:15, fontWeight:600, fontFamily:"inherit", cursor:"pointer", zIndex:20, padding:"8px 4px" }}>
        Pular
      </button>

      {/* ── BOTTOM CONTROLS ONLY (no text) ── */}
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"0 30px calc(env(safe-area-inset-bottom,0px) + 44px)", zIndex:20 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", gap:7, alignItems:"center" }}>
            {SLIDES.map((_,i) => (
              <div key={i} style={{ height:5, width:i===idx?26:5, borderRadius:3, background:i===idx?"#fff":"rgba(255,255,255,0.35)", transition:"all .3s", cursor:"pointer" }} onClick={() => { setOffsetX(0); setIdx(i); }} />
            ))}
          </div>
          <button onClick={() => idx === N-1 ? onDone() : setIdx(i => i+1)} style={{ width:62, height:62, borderRadius:"50%", background:"#fff", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 8px 32px rgba(0,0,0,0.45)", flexShrink:0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function LoginPage({ onAuth, onClientAuth }) {
  const [portal, setPortal] = useState(null); /* null = choose, "team", "client" */
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState(1);
  /* Login fields */
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [pwFocus, setPwFocus] = useState(false);
  /* Step 1 — Dados pessoais */
  const [rName, setRName] = useState("");
  const [rNick, setRNick] = useState("");
  const [rCpf, setRCpf] = useState("");
  const [rBirth, setRBirth] = useState("");
  /* Step 2 — Contato */
  const [rPhone, setRPhone] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rSocial, setRSocial] = useState("");
  /* Step 3 — Função */
  const [rCargo, setRCargo] = useState("");
  const [rBlood, setRBlood] = useState("");
  /* Step 4 — Segurança */
  const [rPw, setRPw] = useState("");
  const [rPwConfirm, setRPwConfirm] = useState("");
  const [showRPw, setShowRPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [fromInviteLink, setFromInviteLink] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const handleForgot = async () => {
    if (!forgotEmail.includes("@")) { setError("Digite um e-mail válido"); return; }
    if (!supabase) { setForgotSent(true); return; }
    setForgotLoading(true); setError("");
    const { error: e } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: window.location.origin + "/?reset=1",
    });
    setForgotLoading(false);
    if (e) setError(e.message);
    else setForgotSent(true);
  };

  /* Auto-detect invite link ?convite=email */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conviteEmail = params.get("convite");
    if (conviteEmail) {
      setMode("register"); setREmail(conviteEmail); setFromInviteLink(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const emailDomain = "@uniquemkt.com.br";
  const emailValid = supabase ? email.includes("@") : email.endsWith(emailDomain);
  const emailLocal = email.replace(emailDomain, "");
  const rEmailValid = supabase ? rEmail.includes("@") : rEmail.endsWith(emailDomain);

  const pwChecks = (p) => [
    { label: "Mínimo 8 caracteres", ok: p.length >= 8 },
    { label: "Letra maiúscula", ok: /[A-Z]/.test(p) },
    { label: "Letra minúscula", ok: /[a-z]/.test(p) },
    { label: "Número", ok: /[0-9]/.test(p) },
    { label: "Caractere especial (!@#$%)", ok: /[!@#$%^&*(),.?":{}|<>]/.test(p) },
  ];
  const pwStrong = (p) => pwChecks(p).every(c => c.ok);

  /* ── Masks ── */
  const maskCpf = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0,3) + "." + d.slice(3);
    if (d.length <= 9) return d.slice(0,3) + "." + d.slice(3,6) + "." + d.slice(6);
    return d.slice(0,3) + "." + d.slice(3,6) + "." + d.slice(6,9) + "-" + d.slice(9);
  };
  const maskDate = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 8);
    if (d.length <= 2) return d;
    if (d.length <= 4) return d.slice(0,2) + "/" + d.slice(2);
    return d.slice(0,2) + "/" + d.slice(2,4) + "/" + d.slice(4);
  };
  const maskPhone = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 7) return "(" + d.slice(0,2) + ") " + d.slice(2);
    return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
  };
  const handleEmailField = (val, setter) => {
    if (supabase) { setter(val); return; }
    const clean = val.replace(emailDomain, "").replace(/@.*/, "");
    setter(clean + emailDomain);
  };

  /* ── Validation per step ── */
  const cpfRaw = rCpf.replace(/\D/g, "");
  const birthRaw = rBirth.replace(/\D/g, "");
  const phoneRaw = rPhone.replace(/\D/g, "");
  const step1Valid = rName.trim().length >= 3 && rNick.trim() && cpfRaw.length === 11 && birthRaw.length === 8;
  const step2Valid = phoneRaw.length >= 10 && rEmailValid;
  const step3Valid = !!rCargo;
  const step4Valid = supabase ? (rPw.length >= 6 && rPw === rPwConfirm) : (pwStrong(rPw) && rPw === rPwConfirm);

  const cargos = ["CEO","Gerente","Head de Marketing","Social Media","Designer","Gestor de Tráfego","Audiovisual / Vídeo","Redator(a)","Atendimento","Analista de Dados","Estagiário(a)"];

  const handleLogin = async () => {
    if (!email.trim() || !pw.trim()) { setError("Preencha email e senha"); return; }
    /* Blocked users */
    const BLOCKED = ["lucassouza@hotmail.com","lucassouzap@hotmail.com","lucassouza@hotmail.com.br","lucas.souza@hotmail.com","lucassouza@outlook.com"];
    if (BLOCKED.some(b => email.trim().toLowerCase().replace(/\s/g,"") === b)) { setError("Acesso bloqueado. Entre em contato com o administrador."); return; }
    /* Try Supabase auth if available */
    if (supabase) {
      setLoginLoading(true); setError("");
      const loginTimeout = setTimeout(() => { setError("Servidor demorou para responder. Tente novamente."); setLoginLoading(false); }, 25000);
      try {
        const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (authErr) { clearTimeout(loginTimeout); setError(authErr.message === "Invalid login credentials" ? "Email ou senha incorretos" : authErr.message); setLoginLoading(false); return; }
        /* Load profile + extras + photo in ONE bulk query */
        const profilePromise = supabase.from("profiles").select("*").eq("id", data.user.id).single().then(r => r).catch(() => ({ data: null }));
        const settingsPromise = supaGetSettingsBulk([`profile_extras_${data.user.id}`, `profile_photo_${data.user.id}`]);
        const [profileRes, settingsMap] = await Promise.all([profilePromise, settingsPromise]);
        const profile = profileRes?.data || null;
        const extrasRaw = settingsMap[`profile_extras_${data.user.id}`] || null;
        const extras = extrasRaw ? (() => { try { return typeof extrasRaw === "string" ? JSON.parse(extrasRaw) : extrasRaw; } catch { return {}; } })() : {};
        const photo = profile?.photo_url || settingsMap[`profile_photo_${data.user.id}`] || null;
        const userObj = {
          id: data.user.id, name: profile?.name || data.user.user_metadata?.name || email.split("@")[0],
          email, role: profile?.role === "admin" ? "CEO" : profile?.role === "member" ? (profile?.nick || "Colaborador") : "Cliente",
          supaRole: profile?.role || "member", photo,
          nick: profile?.nick || profile?.name || email.split("@")[0],
          phone: profile?.phone || "", birth: extras.birth || "", social: extras.social || "", blood: extras.blood || "", bio: extras.bio || "", remember,
        };
        /* Check if member is approved (admin bypass) — ONLY allow status === "ativo" */
        if (!profile || profile.role !== "admin") {
          try {
            const { data: memberRow, error: memberErr } = await supabase.from("agency_members").select("status").eq("user_id", data.user.id).maybeSingle();
            if (memberErr) { console.warn("[Login] agency_members query error:", memberErr); }
            const memberStatus = memberRow?.status?.toLowerCase?.() || "";
            const isApproved = memberStatus === "ativo" || memberStatus === "offline" || memberStatus === "online";
            if (!isApproved) {
              clearTimeout(loginTimeout); setLoginLoading(false);
              const msg = !memberRow ? "Cadastro não encontrado. Solicite acesso ao administrador."
                : memberStatus === "pendente" ? "Seu cadastro está aguardando aprovação do administrador."
                : `Status do cadastro: "${memberRow.status}". Entre em contato com o administrador.`;
              setError(msg);
              await supabase.auth.signOut();
              return;
            }
          } catch(memberCheckErr) {
            console.warn("[Login] agency_members check failed:", memberCheckErr);
            clearTimeout(loginTimeout); setLoginLoading(false);
            setError("Erro ao verificar cadastro. Tente novamente.");
            await supabase.auth.signOut();
            return;
          }
        }
        clearTimeout(loginTimeout); setLoginLoading(false); onAuth(userObj);
      } catch (e) { setError("Erro de conexão: " + (e?.message || "tente novamente")); setLoginLoading(false); }
      return;
    }
    /* Fallback: mock login */
    if (!emailValid) { setError("Use um e-mail @uniquemkt.com.br"); return; }
    if (!pwStrong(pw)) { setError("Senha não atende os critérios"); return; }
    const member = AGENCY_TEAM.find(m => m.name.toLowerCase() === emailLocal.toLowerCase());
    onAuth({ name: member?.name || emailLocal, email, role: member?.role || "Colaborador", photo: member?.photo || null, phone: member?.phone || "", nick: member?.name || emailLocal, birth: "", social: "", blood: "", bio: "", remember });
  };

  const handleRegister = async () => {
    const BLOCKED_REG = ["lucassouza@hotmail.com","lucassouzap@hotmail.com","lucassouza@hotmail.com.br","lucas.souza@hotmail.com","lucassouza@outlook.com"];
    if (BLOCKED_REG.some(b => rEmail.trim().toLowerCase().replace(/\s/g,"") === b)) { setError("Este email está bloqueado. Entre em contato com o administrador."); return; }
    if (supabase) {
      setLoginLoading(true); setError(""); setRegSuccess("");
      try {
        const { data, error: authErr } = await supabase.auth.signUp({
          email: rEmail, password: rPw,
          options: { data: { name: rName, nick: rNick, phone: rPhone, role: "member", job_title: rCargo, cpf: rCpf, birth: rBirth, social: rSocial, blood: rBlood } }
        });
        if (authErr) { setError(authErr.message); setLoginLoading(false); return; }
        /* Save profile extras right after signup */
        if (data?.user?.id) {
          const extras = { cpf: rCpf, birth: rBirth, social: rSocial, blood: rBlood };
          await supaSetSetting(`profile_extras_${data.user.id}`, JSON.stringify(extras)).catch(() => {});
          /* Create pending team member for admin approval */
          await supaCreateMember({
            name: rName, role: rCargo || "member", email: rEmail, phone: rPhone,
            since: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}),
            status: "pendente", user_id: data.user.id,
          }).catch(() => {});
        }
        /* Link pending invite if exists */
        if (inviteData?.id && data?.user?.id) {
          await supaLinkInvite(inviteData.id, data.user.id);
        }
        setLoginLoading(false);
        setRegSuccess("Cadastro enviado para aprovação! Verifique seu e-mail para confirmar a conta.");
        setMode("pending"); setStep(1); setInviteData(null);
      } catch (e) { setError("Erro de conexão"); setLoginLoading(false); }
      return;
    }
    /* Fallback mock */
    onAuth({ name: rName, nick: rNick, email: rEmail, role: rCargo, photo: null, phone: rPhone, cpf: rCpf, birth: rBirth, social: rSocial, blood: rBlood, remember: false });
  };

  const nextStep = async () => {
    setError("");
    if (step === 1 && !step1Valid) { setError("Preencha todos os campos corretamente"); return; }
    if (step === 2 && !step2Valid) { setError("Preencha telefone e e-mail válido"); return; }
    if (step === 3 && !step3Valid) { setError("Selecione seu cargo"); return; }
    if (step === 4) { if (!step4Valid) { setError("Verifique a senha"); return; } handleRegister(); return; }
    /* Check invite when going from step 2→3 */
    if (step === 2 && supabase) {
      const invite = await supaCheckInvite(rEmail);
      if (invite) {
        setInviteData(invite);
        if (invite.role && !rCargo) setRCargo(invite.role);
        if (invite.phone && !rPhone) setRPhone(invite.phone);
        if (invite.name && !rName) setRName(invite.name);
      } else { setInviteData(null); }
    }
    setStep(s => s + 1);
  };

  const stepLabels = ["Dados","Contato","Função","Segurança"];
  const stepValid = [step1Valid, step2Valid, step3Valid, step4Valid];

  /* Client login handler */
  const handleClientLogin = async () => {
    if (!email.trim() || !pw.trim()) { setError("Preencha email e senha"); return; }
    if (!supabase) { setError("Servidor indisponível"); return; }
    setLoginLoading(true); setError("");
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (authErr) { setError(authErr.message === "Invalid login credentials" ? "Email ou senha incorretos" : authErr.message); setLoginLoading(false); return; }
      let profile = null;
      try { const r = await supabase.from("profiles").select("*").eq("id", data.user.id).single(); profile = r.data; } catch {}
      if (onClientAuth) onClientAuth({ mode:"login", user: { id: data.user.id, name: profile?.name || email.split("@")[0], email, photo: profile?.photo_url || null, role: "cliente" } });
      setLoginLoading(false);
    } catch(e) { setError("Erro: " + e.message); setLoginLoading(false); }
  };

  /* ── PORTAL SELECTOR ── */
  if (!portal) return (
    <div style={{ minHeight:"100vh", background:"#0D0D0D", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32 }}>
      <div style={{ position:"absolute", inset:0, opacity:0.03, pointerEvents:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize:"128px" }} />
      <div style={{ marginBottom:40, textAlign:"center", position:"relative" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, justifyContent:"center", marginBottom:8 }}>
          <svg width="40" height="28" viewBox="0 0 40 28" fill="none"><path d="M4 20L12 8L20 20" stroke="#BBF246" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 20L28 8L36 20" stroke="#BBF246" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 20H28" stroke="#BBF246" strokeWidth="3.5" strokeLinecap="round"/></svg>
        </div>
        <p style={{ fontSize:20, fontWeight:300, color:"#fff" }}>unique<span style={{ fontWeight:800 }}> hub</span></p>
        <p style={{ fontSize:11, color:"rgba(255,255,255,0.35)", marginTop:6, letterSpacing:1 }}>AGÊNCIA | CLIENTE</p>
      </div>
      <p style={{ fontSize:16, fontWeight:700, color:"#fff", marginBottom:24 }}>Como deseja acessar?</p>
      <div style={{ display:"flex", flexDirection:"column", gap:14, width:"100%", maxWidth:320 }}>
        <button onClick={()=>setPortal("team")} style={{ padding:"22px 24px", borderRadius:18, background:"rgba(187,242,70,0.08)", border:"1.5px solid rgba(187,242,70,0.3)", cursor:"pointer", fontFamily:"inherit", textAlign:"left", display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:14, background:"rgba(187,242,70,0.15)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BBF246" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
          </div>
          <div>
            <p style={{ fontSize:15, fontWeight:700, color:"#fff" }}>Colaborador</p>
            <p style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:2 }}>Acesso ao painel da agência</p>
          </div>
        </button>
        <button onClick={()=>setPortal("client")} style={{ padding:"22px 24px", borderRadius:18, background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(255,255,255,0.1)", cursor:"pointer", fontFamily:"inherit", textAlign:"left", display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:48, height:48, borderRadius:14, background:"rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
          </div>
          <div>
            <p style={{ fontSize:15, fontWeight:700, color:"#fff" }}>Sou Cliente</p>
            <p style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:2 }}>Acompanhe seu marketing</p>
          </div>
        </button>
      </div>
    </div>
  );

  /* ── CLIENT LOGIN ── */
  if (portal === "client") return (
    <div style={{ minHeight:"100vh", background:"#0D0D0D", display:"flex", flexDirection:"column", padding:0 }}>
      <div style={{ padding:"16px 20px", display:"flex", alignItems:"center" }}>
        <button onClick={()=>setPortal(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#fff", display:"flex", alignItems:"center", gap:6, fontFamily:"inherit", fontSize:13 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg> Voltar
        </button>
      </div>
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:32 }}>
        <div style={{ width:56, height:56, borderRadius:16, background:"rgba(187,242,70,0.12)", display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#BBF246" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/></svg>
        </div>
        <p style={{ fontSize:20, fontWeight:800, color:"#fff", marginBottom:4 }}>Portal do Cliente</p>
        <p style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginBottom:32 }}>Acompanhe seu marketing digital</p>
        {error && <p style={{ color:"#FF6B6B", fontSize:12, marginBottom:12, textAlign:"center" }}>{error}</p>}
        <div style={{ width:"100%", maxWidth:320 }}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="E-mail" type="email" autoComplete="email" style={{ width:"100%", boxSizing:"border-box", padding:"14px 16px", borderRadius:14, border:"1.5px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#fff", fontFamily:"inherit", fontSize:15, outline:"none", marginBottom:10 }} />
          <input value={pw} onChange={e=>setPw(e.target.value)} placeholder="Senha" type={showPw?"text":"password"} autoComplete="current-password" onKeyDown={e=>e.key==="Enter"&&handleClientLogin()} style={{ width:"100%", boxSizing:"border-box", padding:"14px 16px", borderRadius:14, border:"1.5px solid rgba(255,255,255,0.1)", background:"rgba(255,255,255,0.05)", color:"#fff", fontFamily:"inherit", fontSize:15, outline:"none", marginBottom:16 }} />
          <button onClick={handleClientLogin} disabled={loginLoading} style={{ width:"100%", padding:"15px 0", borderRadius:14, background:"#BBF246", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:15, fontWeight:700, color:"#0D0D0D", opacity:loginLoading?0.6:1 }}>
            {loginLoading ? "Entrando..." : "Entrar"}
          </button>
          <p style={{ textAlign:"center", marginTop:20, fontSize:12, color:"rgba(255,255,255,0.35)" }}>Ainda não tem conta?</p>
          <button onClick={()=>{if(onClientAuth) onClientAuth({mode:"register"})}} style={{ width:"100%", marginTop:8, padding:"13px 0", borderRadius:14, background:"transparent", border:"1.5px solid rgba(187,242,70,0.3)", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, color:"#BBF246" }}>
            Criar minha conta
          </button>
        </div>
      </div>
    </div>
  );

  /* ── TEAM: show back button to portal selector ── */
  const portalBackBtn = <button onClick={()=>{setPortal(null);setMode("login");setError("");}} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(255,255,255,0.5)", fontFamily:"inherit", fontSize:12, display:"flex", alignItems:"center", gap:4, marginBottom:10 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>Voltar</button>;

  /* ── PENDING SCREEN ── */
  if (mode === "pending") return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, minHeight: "100%", background: "#F7F7F8", color: "#192126" }}>
      <div style={{ width: 80, height: 80, borderRadius: 20, background: `${B.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <span style={{ color: B.accent }}>{IC.clock}</span>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 800, textAlign: "center" }}>Cadastro enviado!</h2>
      <p style={{ fontSize: 14, color: B.muted, textAlign: "center", marginTop: 12, lineHeight: 1.6 }}>Seu cadastro foi enviado para aprovação. O CEO ou gerente precisa aprovar seu acesso.</p>
      <Card style={{ marginTop: 20, width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Av name={rName} sz={44} fs={17} />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700 }}>{rName}</p>
            <p style={{ fontSize: 11, color: B.muted }}>{rCargo} · {rEmail}</p>
          </div>
        </div>
      </Card>
      <p style={{ fontSize: 12, color: B.muted, textAlign: "center", marginTop: 12 }}>Você receberá uma notificação por e-mail assim que for aprovado.</p>
      <button onClick={() => { setMode("login"); setStep(1); }} className="pill accent" style={{ marginTop: 24, padding: "12px 28px" }}>Voltar ao Login</button>
    </div>
  );

  /* Logo inline */
  const logoJSX = (mb) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: mb || 32 }}>
      <img src={LOGO_B64} alt="UniqueHub" style={{ height: 45, objectFit: "contain", marginBottom: 8 }} />
      <span style={{ fontSize: 13, color: B.muted, fontWeight: 600, marginTop: 2 }}>Agency Panel</span>
    </div>
  );

  /* Stepper inline */
  const stepperJSX = (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24, width: "100%" }}>
      {stepLabels.map((l, i) => {
        const num = i + 1;
        const done = step > num;
        const active = step === num;
        return (
          <React.Fragment key={num}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 0 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? B.accent : active ? B.dark : "rgba(0,0,0,0.06)",
                color: done ? B.dark : active ? "#fff" : B.muted,
                fontSize: 13, fontWeight: 800, transition: "all .3s",
                boxShadow: active ? `0 0 0 3px ${B.accent}30` : "none",
              }}>
                {done ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : num}
              </div>
              <span style={{ fontSize: 9, fontWeight: active ? 800 : 500, color: active ? B.dark : B.muted, marginTop: 4, whiteSpace: "nowrap" }}>{l}</span>
            </div>
            {i < 3 && <div style={{ flex: 1, height: 2, background: done ? B.accent : `${B.border}`, margin: "0 4px", marginBottom: 16, borderRadius: 1, transition: "all .3s" }} />}
          </React.Fragment>
        );
      })}
    </div>
  );

  /* ── REGISTER STEPPER ── */
  if (mode === "register") return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "40px 24px 32px", overflowY: "auto", background: "#F7F7F8", color: "#192126", zIndex:10 }}>
      <style>{`.tinput{width:100%;padding:12px 14px;border-radius:14px;border:1.5px solid rgba(11,35,66,0.08);font-size:16px!important;font-family:inherit;background:#fff;outline:none;color:#192126;transition:border .15s;box-sizing:border-box}.tinput:focus{border-color:#BBF246;box-shadow:0 0 0 3px #BBF24625}.tinput::placeholder{color:#8B8F92}select.tinput{appearance:auto}`}</style>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 340 }}>
        {logoJSX(20)}
        {stepperJSX}

        {/* Step 1 — Dados Pessoais */}
        {step === 1 && <div style={{ width: "100%", animation: "fadeUp .3s" }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Dados pessoais</h3>
          <p style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Informações básicas do colaborador</p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Nome completo *</label>
            <input value={rName} onChange={e => setRName(e.target.value)} placeholder="João da Silva" className="tinput" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Apelido *</label>
            <input value={rNick} onChange={e => setRNick(e.target.value)} placeholder="Como quer ser chamado" className="tinput" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>CPF *</label>
            <input value={rCpf} onChange={e => setRCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" className="tinput" inputMode="numeric" />
            {cpfRaw.length > 0 && cpfRaw.length < 11 && <p style={{ fontSize: 10, color: B.orange, marginTop: 4 }}>{11 - cpfRaw.length} dígitos restantes</p>}
            {cpfRaw.length === 11 && <p style={{ fontSize: 10, color: B.green, marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "flex" }}>{IC.check}</span>CPF válido</p>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Data de nascimento *</label>
            <input value={rBirth} onChange={e => setRBirth(maskDate(e.target.value))} placeholder="DD/MM/AAAA" className="tinput" inputMode="numeric" />
            {birthRaw.length === 8 && <p style={{ fontSize: 10, color: B.green, marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "flex" }}>{IC.check}</span>Data válida</p>}
          </div>
        </div>}

        {/* Step 2 — Contato */}
        {step === 2 && <div style={{ width: "100%", animation: "fadeUp .3s" }}>
          {fromInviteLink && <div style={{ padding:10, borderRadius:10, background:`${B.accent}08`, border:`1.5px solid ${B.accent}20`, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ color:B.accent, display:"flex" }}>{IC.check}</span>
            <p style={{ fontSize:11, color:B.muted }}>E-mail pré-preenchido pelo convite da equipe</p>
          </div>}
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Contato</h3>
          <p style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Como podemos te encontrar</p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Telefone / WhatsApp *</label>
            <input value={rPhone} onChange={e => setRPhone(maskPhone(e.target.value))} placeholder="(24) 99999-9999" className="tinput" inputMode="tel" />
            {phoneRaw.length >= 10 && <p style={{ fontSize: 10, color: B.green, marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "flex" }}>{IC.check}</span>Telefone válido</p>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>E-mail corporativo *</label>
            <input value={rEmail} onChange={e => supabase ? setREmail(e.target.value) : handleEmailField(e.target.value, setREmail)} placeholder={supabase ? "seu@email.com" : `seu.nome${emailDomain}`} className="tinput" />
            {rEmail && !rEmailValid && <p style={{ fontSize: 10, color: B.red, marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "flex" }}>{IC.x}</span>Use @uniquemkt.com.br</p>}
            {rEmailValid && <p style={{ fontSize: 10, color: B.green, marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "flex" }}>{IC.check}</span>E-mail válido</p>}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Rede social principal (opcional)</label>
            <input value={rSocial} onChange={e => setRSocial(e.target.value)} placeholder="@seuperfil no Instagram" className="tinput" />
          </div>
        </div>}

        {/* Step 3 — Função */}
        {step === 3 && <div style={{ width: "100%", animation: "fadeUp .3s" }}>
          {inviteData && <div style={{ padding:12, borderRadius:12, background:`${B.green}12`, border:`1.5px solid ${B.green}30`, marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ color:B.green, display:"flex" }}>{IC.check}</span>
            <div><p style={{ fontSize:13, fontWeight:700, color:B.green }}>Convite encontrado!</p><p style={{ fontSize:11, color:B.muted }}>Você foi convidado(a) para a equipe. Dados pré-preenchidos pelo admin.</p></div>
          </div>}
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Função na agência</h3>
          <p style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Selecione seu cargo e informações adicionais</p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Cargo *</label>
            <select value={rCargo} onChange={e => setRCargo(e.target.value)} className="tinput" style={{ appearance: "auto" }}>
              <option value="">Selecione seu cargo...</option>
              {cargos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Tipo sanguíneo (opcional)</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["A+","A-","B+","B-","AB+","AB-","O+","O-","Não sei"].map(b => (
                <button key={b} onClick={() => setRBlood(b)} style={{
                  padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${rBlood === b ? B.accent : B.border}`,
                  background: rBlood === b ? `${B.accent}12` : B.bgCard, color: rBlood === b ? B.dark : B.muted,
                  fontSize: 12, fontWeight: rBlood === b ? 700 : 500, cursor: "pointer", fontFamily: "inherit",
                }}>{b}</button>
              ))}
            </div>
          </div>

          {/* Profile Preview */}
          {rCargo && <div style={{ marginTop: 4 }}>
            <p className="sl" style={{ marginBottom: 8 }}>Prévia do perfil</p>
            <Card style={{ background: `${B.accent}04`, border: `1.5px solid ${B.accent}15` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Av name={rName || "N"} sz={50} fs={20} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 15, fontWeight: 800 }}>{rName || "Nome"}</p>
                  {rNick && <p style={{ fontSize: 11, color: B.muted }}>"{rNick}"</p>}
                  <p style={{ fontSize: 12, fontWeight: 600, color: B.accent, marginTop: 2 }}>{rCargo}</p>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                <Tag color={B.blue}>{rEmail || "email"}</Tag>
                {rPhone && <Tag color={B.green}>{rPhone}</Tag>}
                {rBlood && rBlood !== "Não sei" && <Tag color={B.red}>🩸 {rBlood}</Tag>}
                {rSocial && <Tag color={B.purple}>{rSocial}</Tag>}
                {rBirth && <Tag color={B.orange}>🎂 {rBirth}</Tag>}
              </div>
            </Card>
          </div>}
        </div>}

        {/* Step 4 — Segurança */}
        {step === 4 && <div style={{ width: "100%", animation: "fadeUp .3s" }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Segurança</h3>
          <p style={{ fontSize: 12, color: B.muted, marginBottom: 16 }}>Crie uma senha forte para proteger sua conta</p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Criar senha *</label>
            <div style={{ position: "relative" }}>
              <input value={rPw} onChange={e => setRPw(e.target.value)} onFocus={() => setPwFocus(true)} onBlur={() => setTimeout(() => setPwFocus(false), 200)} type={showRPw ? "text" : "password"} placeholder="Sua senha segura" className="tinput" style={{ paddingRight: 44 }} />
              <button onClick={() => setShowRPw(!showRPw)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: B.muted, display: "flex", padding: 6 }}>{showRPw ? IC.eyeOff : IC.eye}</button>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 6 }}>Confirmar senha *</label>
            <input value={rPwConfirm} onChange={e => setRPwConfirm(e.target.value)} type={showRPw ? "text" : "password"} placeholder="Repita a senha" className="tinput" />
            {rPwConfirm && rPw !== rPwConfirm && <p style={{ fontSize: 10, color: B.red, marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "flex" }}>{IC.x}</span>As senhas não coincidem</p>}
            {rPwConfirm && rPw === rPwConfirm && rPw.length > 0 && <p style={{ fontSize: 10, color: B.green, marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}><span style={{ display: "flex" }}>{IC.check}</span>Senhas coincidem</p>}
          </div>

          {(pwFocus || rPw.length > 0) && <div style={{ padding: "10px 12px", background: "rgba(0,0,0,0.02)", borderRadius: 12, border: `1px solid ${B.border}`, marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: B.muted, marginBottom: 6 }}>Critérios de segurança:</p>
            {pwChecks(rPw).map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: i ? 3 : 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: c.ok ? B.green : "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                  {c.ok && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </div>
                <span style={{ fontSize: 11, color: c.ok ? B.green : B.muted }}>{c.label}</span>
              </div>
            ))}
          </div>}

          <div style={{ padding: "10px 14px", background: `${B.orange}08`, borderRadius: 12, border: `1px solid ${B.orange}20` }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{ color: B.orange, display: "flex", marginTop: 1 }}>{IC.shield}</span>
              <p style={{ fontSize: 11, color: B.orange, lineHeight: 1.5 }}>
                <b>Aprovação necessária:</b> seu cadastro será revisado pelo CEO ou gerente antes da liberação do acesso.
              </p>
            </div>
          </div>
        </div>}

        {error && <p style={{ fontSize: 12, color: B.red, marginTop: 10, textAlign: "center" }}>{error}</p>}

        {/* Navigation buttons */}
        <div style={{ display: "flex", gap: 8, width: "100%", marginTop: 16 }}>
          {step > 1 ? (
            <button onClick={() => { setStep(s => s - 1); setError(""); }} className="pill full outline" style={{ flex: 1 }}>
              {IC.back()} Voltar
            </button>
          ) : (
            <button onClick={() => { setMode("login"); setStep(1); setError(""); }} className="pill full outline" style={{ flex: 1 }}>
              {IC.back()} Login
            </button>
          )}
          <button onClick={nextStep} className="pill full accent" style={{ flex: 2, opacity: stepValid[step - 1] ? 1 : 0.5 }}>
            {step === 4 ? "Solicitar Acesso" : `Próximo (${step}/4)`} {IC.arrowR()}
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 4, marginTop: 16 }}>
          {[1,2,3,4].map(s => (
            <div key={s} style={{ width: s === step ? 20 : 6, height: 6, borderRadius: 3, background: s <= step ? B.accent : `${B.muted}30`, transition: "all .3s" }} />
          ))}
        </div>

        <p style={{ fontSize: 11, color: B.muted, marginTop: 16, textAlign: "center" }}>UniqueHub — Agency Panel v1.0</p>
      </div>
    </div>
  );

  /* ── FORGOT PASSWORD ── */
  if (forgotMode) return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, display:"flex", flexDirection:"column", background:"#000", overflow:"hidden" }}>
      <div style={{ padding:"calc(env(safe-area-inset-top,0px) + 72px) 28px 48px", textAlign:"center", position:"relative" }}>
        <img src={LOGO_B64} alt="UniqueHub" style={{ height:36, objectFit:"contain", marginBottom:10 }} />
        <p style={{ fontSize:12, color:"rgba(255,255,255,0.35)", fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", marginTop:4 }}>Agency Panel</p>
        <button onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); setError(""); }} style={{ position:"absolute", top:"calc(env(safe-area-inset-top,0px) + 20px)", left:20, background:"none", border:"none", color:"rgba(255,255,255,0.5)", fontSize:14, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, padding:"8px 4px" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Voltar
        </button>
      </div>
      <div style={{ flex:1, height:0, background:"#fff", borderRadius:"32px 32px 0 0", overflowY:"auto", padding:"36px 28px calc(env(safe-area-inset-bottom,0px) + 40px)" }}>
        {forgotSent ? (
          <div style={{ textAlign:"center", paddingTop:20 }}>
            <div style={{ width:72, height:72, borderRadius:"50%", background:"#F0FDF4", border:"2px solid #BBF246", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 20px" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3D7A00" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ fontSize:24, fontWeight:900, color:"#1A1D23", marginBottom:10 }}>E-mail enviado!</h2>
            <p style={{ fontSize:14, color:"#9CA3AF", lineHeight:1.6, marginBottom:32 }}>Verifique sua caixa de entrada em <strong style={{color:"#1A1D23"}}>{forgotEmail}</strong> e siga o link para redefinir sua senha.</p>
            <button onClick={() => { setForgotMode(false); setForgotSent(false); setForgotEmail(""); }} style={{ width:"100%", padding:"18px", borderRadius:16, border:"none", background:"linear-gradient(135deg,#BBF246 0%,#9AE010 100%)", color:"#0D1117", fontSize:16, fontWeight:800, fontFamily:"inherit", cursor:"pointer", boxShadow:"0 6px 24px rgba(187,242,70,0.35)" }}>
              Voltar ao login
            </button>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize:26, fontWeight:900, color:"#1A1D23", margin:"0 0 8px" }}>Redefinir senha</h1>
            <p style={{ fontSize:14, color:"#9CA3AF", margin:"0 0 28px", lineHeight:1.5 }}>Digite seu e-mail e enviaremos um link para criar uma nova senha.</p>
            {error && <div style={{ padding:"12px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:12, marginBottom:16 }}><p style={{ fontSize:13, color:"#DC2626", margin:0 }}>⚠ {error}</p></div>}
            <div style={{ position:"relative", marginBottom:24 }}>
              <input
                value={forgotEmail}
                onChange={e => { setForgotEmail(e.target.value); setError(""); }}
                placeholder="seu@email.com"
                type="email"
                autoCapitalize="none"
                style={{ width:"100%", padding:"22px 18px 10px", border:"1.5px solid #E8EAF0", borderRadius:16, fontSize:16, fontFamily:"inherit", background:"#F8F9FC", color:"#1A1D23", outline:"none", boxSizing:"border-box", transition:"border .2s" }}
                onFocus={e => e.target.style.borderColor="#BBF246"}
                onBlur={e => e.target.style.borderColor="#E8EAF0"}
              />
              <label style={{ position:"absolute", left:18, top: forgotEmail ? 10 : "50%", transform: forgotEmail ? "none" : "translateY(-50%)", fontSize: forgotEmail ? 11 : 15, color: forgotEmail ? "#BBF246" : "#9CA3AF", fontWeight: forgotEmail ? 700 : 400, letterSpacing: forgotEmail ? "0.04em" : 0, textTransform: forgotEmail ? "uppercase" : "none", pointerEvents:"none", transition:"all .18s" }}>E-mail</label>
            </div>
            <button onClick={handleForgot} disabled={forgotLoading || !forgotEmail.includes("@")} style={{ width:"100%", padding:"18px", borderRadius:16, border:"none", background:"linear-gradient(135deg,#BBF246 0%,#9AE010 100%)", color:"#0D1117", fontSize:16, fontWeight:800, fontFamily:"inherit", cursor:"pointer", boxShadow:"0 6px 24px rgba(187,242,70,0.35)", opacity: forgotLoading || !forgotEmail.includes("@") ? 0.45 : 1 }}>
              {forgotLoading ? "Enviando..." : "Enviar link de redefinição"}
            </button>
          </>
        )}
      </div>
    </div>
  );

  /* ── LOGIN MODE — split design: dark header + white card ── */
  const emailFloating = emailFocused || email.length > 0;
  const passFloating  = passFocused  || pw.length > 0;

  return (
    <div style={{ position:"fixed", top:0, left:0, right:0, bottom:0, display:"flex", flexDirection:"column", background:"#000", overflow:"hidden" }}>
      <style>{`
        @keyframes cardUp { from { transform:translateY(60px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        @keyframes logoIn { from { transform:translateY(-20px); opacity:0; } to { transform:translateY(0); opacity:1; } }
        .lcard { animation: cardUp 0.5s cubic-bezier(0.34,1.1,0.64,1) both; }
        .llogo { animation: logoIn 0.4s ease both; }
        .lf-wrap { position:relative; width:100%; }
        .lf-input {
          width:100%; padding:22px 18px 10px; border:1.5px solid #E8EAF0;
          border-radius:16px; font-size:16px; font-family:inherit;
          background:#F8F9FC; color:#1A1D23; outline:none;
          transition:border-color .2s, background .2s; box-sizing:border-box;
        }
        .lf-input:focus { border-color:#BBF246; background:#fff; }
        .lf-input.has-err { border-color:#F87171; }
        .lf-label {
          position:absolute; left:18px; top:50%; transform:translateY(-50%);
          font-size:15px; color:#9CA3AF; pointer-events:none;
          transition:all .18s cubic-bezier(0.4,0,0.2,1); font-family:inherit;
        }
        .lf-label.float { top:12px; transform:none; font-size:11px; font-weight:700; color:#BBF246; letter-spacing:0.04em; text-transform:uppercase; }
        .lf-label.float.err { color:#F87171; }
        .lsign-btn {
          width:100%; padding:18px; border-radius:16px; border:none;
          background:linear-gradient(135deg,#BBF246 0%,#9AE010 100%);
          color:#0D1117; font-size:16px; font-weight:800; font-family:inherit;
          cursor:pointer; transition:opacity .2s,transform .12s;
          box-shadow:0 6px 24px rgba(187,242,70,0.35);
          letter-spacing:0.01em;
        }
        .lsign-btn:active { transform:scale(0.97); }
        .lsign-btn:disabled { opacity:0.4; }
      `}</style>

      {/* ── DARK HEADER ── */}
      <div className="llogo" style={{ padding:"calc(env(safe-area-inset-top,0px) + 72px) 28px 48px", textAlign:"center", position:"relative", zIndex:1 }}>
        <img src={LOGO_B64} alt="UniqueHub" style={{ height:36, objectFit:"contain", marginBottom:10 }} />
        <p style={{ fontSize:12, color:"rgba(255,255,255,0.35)", fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase", marginTop:4 }}>Agency Panel</p>

        {/* Tab top-right: Não tem conta? — hidden now, moved below */}
        <div style={{ display:"none" }}>
          <span style={{ fontSize:13, color:"rgba(255,255,255,0.4)" }}>
            {mode==="login" ? "Sem conta?" : "Já tem conta?"}
          </span>
          <button onClick={() => { setMode(mode==="login"?"register":"login"); setError(""); }} style={{ background:"rgba(187,242,70,0.15)", border:"1.5px solid rgba(187,242,70,0.4)", borderRadius:20, padding:"6px 14px", color:"#BBF246", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            {mode==="login" ? "Solicitar" : "Entrar"}
          </button>
        </div>
      </div>

      {/* ── WHITE CARD ── */}
      <div className="lcard" style={{ flex:1, height:0, background:"#fff", borderRadius:"32px 32px 0 0", overflowY:"auto", padding:"36px 28px calc(env(safe-area-inset-bottom,0px) + 32px)" }}>

        {/* Back to portal selector */}
        {portal === "team" && portalBackBtn}

        {/* Title */}
        <h1 style={{ fontSize:28, fontWeight:900, color:"#1A1D23", margin:"0 0 6px", letterSpacing:"-0.5px" }}>
          {mode==="login" ? "Acesse sua conta" : "Solicitar acesso"}
        </h1>
        <p style={{ fontSize:14, color:"#9CA3AF", margin:"0 0 30px", lineHeight:1.5 }}>
          {mode==="login" ? "Entre com seu e-mail e senha para continuar" : "Preencha para solicitar acesso à plataforma"}
        </p>

        {/* Email floating label */}
        <div className="lf-wrap" style={{ marginBottom:16 }}>
          <input
            className={`lf-input${email && !emailValid ? " has-err" : ""}`}
            value={email}
            onChange={e => supabase ? setEmail(e.target.value) : handleEmailField(e.target.value, setEmail)}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            autoCapitalize="none" autoCorrect="off" type="email"
          />
          <label className={`lf-label${emailFloating ? " float" + (email && !emailValid ? " err" : "") : ""}`}>
            {email && !emailValid ? "E-mail inválido" : "E-mail"}
          </label>
        </div>

        {/* Password floating label */}
        <div className="lf-wrap" style={{ marginBottom:8 }}>
          <input
            className="lf-input"
            value={pw}
            onChange={e => setPw(e.target.value)}
            onFocus={() => { setPassFocused(true); setPwFocus(true); }}
            onBlur={() => { setPassFocused(false); setTimeout(() => setPwFocus(false), 200); }}
            type={showPw ? "text" : "password"}
            style={{ paddingRight:52 }}
          />
          <label className={`lf-label${passFloating ? " float" : ""}`}>Senha</label>
          <button onClick={() => setShowPw(!showPw)} style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", display:"flex", padding:4 }}>
            {showPw ? IC.eyeOff : IC.eye}
          </button>
        </div>

        {/* pw strength — only on error */}
        {error && error.includes("critério") && (
          <div style={{ padding:"10px 14px", background:"#F8F9FC", borderRadius:12, border:"1px solid #E8EAF0", marginBottom:14 }}>
            <p style={{ fontSize:11, color:"#9CA3AF", marginBottom:6, fontWeight:700 }}>Critérios de segurança:</p>
            {pwChecks(pw).map((c,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginTop:i?3:0 }}>
                <div style={{ width:14, height:14, borderRadius:7, background:c.ok?"#BBF246":"#E8EAF0", display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s", flexShrink:0 }}>
                  {c.ok && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#1A1D23" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span style={{ fontSize:11, color:c.ok?"#3D7A00":"#9CA3AF" }}>{c.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Errors */}
        {error && (
          <div style={{ padding:"12px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:12, marginBottom:14 }}>
            <p style={{ fontSize:13, color:"#DC2626", margin:0 }}>⚠ {error}</p>
          </div>
        )}
        {regSuccess && (
          <div style={{ padding:"12px 14px", background:"#F0FDF4", border:"1px solid #BBF7D0", borderRadius:12, marginBottom:14 }}>
            <p style={{ fontSize:13, color:"#16A34A", margin:0 }}>✓ {regSuccess}</p>
          </div>
        )}

        {/* Forgot row */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", margin:"12px 0 22px" }}>
          <button onClick={() => { setForgotMode(true); setForgotEmail(email); setError(""); setForgotSent(false); }} style={{ background:"none", border:"none", fontSize:13, color:"#BBF246", fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            Esqueci a senha
          </button>
        </div>

        {/* Sign in CTA */}
        <button
          onClick={mode==="login" ? handleLogin : () => setMode("register")}
          disabled={mode==="login" && (loginLoading || !(supabase ? email.includes("@") && pw.length >= 6 : emailValid && pwStrong(pw)))}
          className="lsign-btn"
          style={{ opacity: mode==="register" ? 1 : (loginLoading ? 0.6 : (supabase ? (email.includes("@") && pw.length >= 6 ? 1 : 0.45) : ((emailValid && pwStrong(pw)) ? 1 : 0.45))) }}
        >
          {loginLoading ? "Entrando..." : mode==="login" ? "Entrar na plataforma" : "Preencher cadastro →"}
        </button>

        {/* Divider */}
        <div style={{ display:"flex", alignItems:"center", gap:12, margin:"20px 0 16px" }}>
          <div style={{ flex:1, height:1, background:"#E8EAF0" }} />
          <span style={{ fontSize:12, color:"#D1D5DB", fontWeight:600 }}>ou</span>
          <div style={{ flex:1, height:1, background:"#E8EAF0" }} />
        </div>

        {/* Register CTA */}
        <div style={{ textAlign:"center" }}>
          <p style={{ fontSize:13, color:"#9CA3AF", marginBottom:10 }}>É colaborador e ainda não tem conta?</p>
          <button onClick={() => { setMode("register"); setError(""); }} style={{ width:"100%", padding:"14px", borderRadius:16, border:"1.5px solid #BBF24650", background:"rgba(187,242,70,0.06)", color:"#BBF246", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            Cadastre-se aqui
          </button>
        </div>

        {/* Version */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", marginTop:16 }}>
          <span style={{ fontSize:11, color:"#D1D5DB", fontWeight:500 }}>UniqueHub v1.0</span>
        </div>
      </div>
    </div>
  );
}


/* ══ PWA Install Popup ══ */
function PWAInstallPopup({ onDismiss }) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const [deferredPrompt, setDeferredPrompt] = React.useState(null);

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      onDismiss();
    } else {
      onDismiss();
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9999, display:"flex", alignItems:"flex-end", background:"rgba(0,0,0,0.5)", backdropFilter:"blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div style={{ width:"100%", background:"#fff", borderRadius:"24px 24px 0 0", padding:"28px 24px calc(env(safe-area-inset-bottom,0px) + 32px)", animation:"cardUp .35s cubic-bezier(0.34,1.1,0.64,1) both" }}>
        {/* App icon */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
          <img src="/icon-192.png" alt="UniqueHub" style={{ width:48, height:48, borderRadius:14, boxShadow:"0 4px 12px rgba(0,0,0,0.12)" }} />
          <div>
            <p style={{ fontSize:18, fontWeight:900, color:"#1A1D23", margin:0 }}>UniqueHub</p>
            <p style={{ fontSize:12, color:"#8B8F92", margin:"2px 0 0" }}>Agency Panel</p>
          </div>
          <button onClick={onDismiss} style={{ marginLeft:"auto", background:"none", border:"none", cursor:"pointer", color:"#9CA3AF", padding:4 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <p style={{ fontSize:15, fontWeight:700, color:"#1A1D23", marginBottom:6 }}>Adicione o app à tela inicial</p>
        <p style={{ fontSize:13, color:"#6B7280", lineHeight:1.5, marginBottom:20 }}>
          Acesse o UniqueHub direto do seu celular como um app nativo — sem precisar abrir o navegador.
        </p>

        {isIOS ? (
          <div style={{ background:"#F8F9FC", borderRadius:14, padding:"14px 16px", marginBottom:20 }}>
            <p style={{ fontSize:12, fontWeight:700, color:"#1A1D23", marginBottom:10 }}>Como instalar no iPhone:</p>
            {[
              { icon: "share", text: 'Toque no ícone Compartilhar', sub: "⬆ na barra do Safari" },
              { icon: "plus", text: "Adicionar à Tela de Início", sub: "Role e selecione esta opção" },
              { icon: "check", text: "Confirme tocando em Adicionar", sub: "O ícone aparece na sua tela" },
            ].map((s, i) => (
              <div key={i} style={{ display:"flex", gap:12, marginBottom: i < 2 ? 10 : 0, alignItems:"flex-start" }}>
                <div style={{ width:32, height:32, borderRadius:10, background:"#BBF246", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {s.icon === "share" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D1117" strokeWidth="2.5" strokeLinecap="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>}
                  {s.icon === "plus" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D1117" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>}
                  {s.icon === "check" && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0D1117" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <div>
                  <p style={{ fontSize:13, fontWeight:600, color:"#1A1D23", margin:0 }}>{s.text}</p>
                  <p style={{ fontSize:11, color:"#9CA3AF", margin:"1px 0 0" }}>{s.sub}</p>
                </div>
              </div>
            ))}
          </div>
        ) : isAndroid ? (
          <button onClick={handleInstall} style={{ width:"100%", padding:"16px", borderRadius:14, border:"none", background:"linear-gradient(135deg,#BBF246 0%,#9AE010 100%)", color:"#0D1117", fontSize:15, fontWeight:800, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:16, boxShadow:"0 4px 16px rgba(187,242,70,0.4)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
            Instalar no Android
          </button>
        ) : null}

        <button onClick={onDismiss} style={{ width:"100%", padding:"14px", borderRadius:14, background:"transparent", border:"1.5px solid #E8EAF0", color:"#9CA3AF", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
          Agora não
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════ HOME / DASHBOARD ═══════════════════════ */
function HomePage({ user, goSub, goTab, clients, notifCount, team, demands, articles, articlesLoaded, agencyIdentity, cloudDash, savePrefsToCloud, canAccess: ca }) {
  const canAccessFn = ca || (() => true);
  const CDATA = (clients && clients.length > 0) ? clients : [];
  const isAdmin = user?.supaRole === "admin";
  const canFinancial = canAccessFn("financial") || canAccessFn("financial.view") || canAccessFn("home.metrics");
  const totalClients = CDATA.length;
  const activeClients = CDATA.filter(c => c.status === "ativo").length;
  const totalRevNum = canFinancial ? CDATA.reduce((a, c) => a + parseBRL(c.monthly), 0) : 0;
  const totalRevenue = `R$ ${totalRevNum.toLocaleString("pt-BR")}`;
  const pendingApprovals = CDATA.reduce((a, c) => a + (c.pending||0), 0);
  const avgScore = Math.round(CDATA.reduce((a, c) => a + (c.score||0), 0) / (totalClients||1));
  const growthScore = 78;
  const growthDelta = 6;
  const growthZone = "Estratégica";
  const monthGoal = { label:"META · MARÇO 2026", pct:68, current:342, total:500, unit:"leads" };
  const metricsData = [
    { network:"Instagram", ic:IC.content, metrics:[{l:"Alcance",v:"847K",d:"+18%"},{l:"Engajamento",v:"12.4%",d:"+3.2%"},{l:"Seguidores",v:"15.2K",d:"+420"},{l:"Salvamentos",v:"1.8K",d:"+32%"}] },
    { network:"Facebook", ic:IC.chat, metrics:[{l:"Alcance",v:"324K",d:"+12%"},{l:"Curtidas",v:"8.4K",d:"+1.1K"},{l:"Compartilhamentos",v:"2.1K",d:"+15%"},{l:"Cliques",v:"3.2K",d:"+24%"}] },
    { network:"Google Ads", ic:IC.financial, metrics:[{l:"Impressões",v:"1.2M",d:"+22%"},{l:"Cliques",v:"18K",d:"+31%"},{l:"ROAS",v:"4.8x",d:"+0.6"},{l:"Conversões",v:"342",d:"+28%"}] },
  ];

  const renderHome = () => <>
    {/* HEADER — sem duplicação, só saudação + ícones */}
    <div style={{ background:isDark?"#0D0D0D":"#fff", margin:"-14px -16px 0", padding:"20px 20px 20px", borderRadius:"0 0 28px 28px", boxShadow:isDark?"none":"0 4px 20px rgba(0,0,0,0.05)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <Av name={user.name||"C"} src={user.photo} sz={48} fs={18} />
          <div>
            <p style={{ fontSize:18, fontWeight:900, color:C.txt }}>{greeting}, {(user.name||"Cliente").split(" ")[0]}</p>
            <p style={{ fontSize:11, color:C.mut }}>UniqueHub · Seu marketing em dia</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <div onClick={()=>goTab("chat")} style={{ width:36, height:36, borderRadius:12, background:C.card, border:`1px solid ${C.brd}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>{IC.chat(C.mut)}</div>
          <div onClick={()=>setSub("settings")} style={{ width:36, height:36, borderRadius:12, background:C.card, border:`1px solid ${C.brd}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>{IC.settings(C.mut)}</div>
        </div>
      </div>
    </div>

    {/* META DO MÊS — clicável com info */}
    <Card style={{ marginTop:12, padding:0, overflow:"hidden", cursor:"pointer" }} onClick={()=>setMetaInfoOpen(!metaInfoOpen)}>
      <div style={{ background:isDark?"#111":"#0D0D0D", padding:"18px 20px", color:"#fff" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <p style={{ fontSize:9, fontWeight:600, letterSpacing:1.5, color:"rgba(255,255,255,0.4)", textTransform:"uppercase" }}>{monthGoal.label}</p>
          <div style={{ width:20, height:20, borderRadius:6, background:"rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="3" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"baseline", gap:10, marginTop:8 }}>
          <span style={{ fontSize:40, fontWeight:900, color:LIME }}>{monthGoal.pct}%</span>
          <span style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>{monthGoal.current}/{monthGoal.total} {monthGoal.unit}</span>
        </div>
        <div style={{ height:6, borderRadius:3, background:"rgba(255,255,255,0.1)", marginTop:10 }}>
          <div style={{ height:6, borderRadius:3, background:LIME, width:`${monthGoal.pct}%`, boxShadow:`0 0 8px ${LIME}40` }} />
        </div>
      </div>
      {metaInfoOpen && <div style={{ padding:"14px 20px", borderTop:`1px solid ${C.brd}` }}>
        <p style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>O que é a Meta Mensal?</p>
        <p style={{ fontSize:11, color:C.mut, lineHeight:1.6 }}>A meta mensal é definida em conjunto com a agência e representa o objetivo de crescimento do seu negócio. Pode ser em leads, vendas, seguidores ou outra métrica relevante.</p>
        <button onClick={(e)=>{e.stopPropagation();setSub("reports");}} style={{ marginTop:10, padding:"8px 16px", borderRadius:10, background:`${LIME}15`, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:LIME }}>Ver relatório completo →</button>
      </div>}
    </Card>

    {/* GROWTH SCORE — com explicações claras */}
    <Card onClick={()=>setSub("gamify")} style={{ marginTop:8, cursor:"pointer" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <p style={{ fontSize:12, fontWeight:700 }}>Growth Score</p>
            <span style={{ fontSize:9, color:C.mut, background:`${C.mut}10`, padding:"2px 6px", borderRadius:4 }}>Índice de Crescimento</span>
          </div>
          <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:8 }}>
            <span style={{ fontSize:32, fontWeight:900, color:LIME }}>{growthScore}</span>
            <span style={{ fontSize:11, color:C.mut }}>/100 pontos</span>
            <span style={{ fontSize:11, fontWeight:700, color:B.green, background:`${B.green}10`, padding:"2px 6px", borderRadius:6 }}>+{growthDelta} este mês</span>
          </div>
          <p style={{ fontSize:10, color:C.mut, marginTop:4 }}>Posição #4 entre 23 clientes da agência</p>
          <div style={{ display:"inline-flex", alignItems:"center", gap:4, marginTop:4, background:`${LIME}10`, padding:"3px 8px", borderRadius:6 }}>
            <div style={{ width:6, height:6, borderRadius:3, background:LIME }} />
            <span style={{ fontSize:10, fontWeight:600, color:LIME }}>Zona {growthZone} (61-80 pts)</span>
          </div>
        </div>
        <div style={{ width:52, height:52, borderRadius:"50%", border:`3px solid ${LIME}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          <span style={{ fontSize:16, fontWeight:900, color:LIME }}>{growthScore}</span>
        </div>
      </div>
      {/* Pilares com nome completo + porcentagem */}
      <div style={{ display:"flex", gap:6, marginTop:14 }}>
        {[{n:"Execução",v:82,c:"#10B981"},{n:"Estratégia",v:74,c:"#BBF246"},{n:"Educação",v:65,c:"#F59E0B"},{n:"Ecossistema",v:58,c:"#EF4444"},{n:"Crescimento",v:80,c:"#10B981"}].map((p,i) => <div key={i} style={{ flex:1 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
            <span style={{ fontSize:7, color:C.mut }}>{p.n}</span>
            <span style={{ fontSize:7, fontWeight:700, color:p.c }}>{p.v}%</span>
          </div>
          <div style={{ height:4, borderRadius:2, background:`${p.c}15` }}><div style={{ height:4, borderRadius:2, background:p.c, width:`${p.v}%` }} /></div>
        </div>)}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10, paddingTop:8, borderTop:`1px solid ${C.brd}` }}>
        <span style={{ fontSize:10, color:C.mut }}>4 missões pendentes</span>
        <span style={{ fontSize:10, color:LIME, fontWeight:600 }}>Ver detalhes →</span>
      </div>
    </Card>

    {/* APROVAÇÃO PENDENTE */}
    {pendingApproval.length > 0 && <Card onClick={()=>nav("content")} style={{ marginTop:8, cursor:"pointer", borderLeft:`3px solid ${LIME}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ color:LIME }}>{IC.check}</span>
        <div style={{ flex:1 }}><p style={{ fontSize:14, fontWeight:700 }}>{pendingApproval.length} post{pendingApproval.length>1?"s":""} para aprovar</p><p style={{ fontSize:11, color:C.mut }}>Toque para revisar</p></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.mut} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    </Card>}

    {/* POSTS RECENTES */}
    {demands.length > 0 && <>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 0 8px" }}>
        <p style={{ fontSize:10, fontWeight:600, letterSpacing:1.5, color:C.mut, textTransform:"uppercase" }}>Posts recentes</p>
        <span onClick={()=>nav("content")} style={{ fontSize:10, color:LIME, fontWeight:600, cursor:"pointer" }}>Ver todos →</span>
      </div>
      <div style={{ display:"flex", gap:10, overflowX:"auto", scrollbarWidth:"none", marginRight:-16, paddingRight:16 }}>
        {demands.slice(0,6).map((d,i) => {
          const st = d.steps?.client?.status;
          const stColor = st==="approved"?B.green:st==="rejected"||st==="revision"?(B.orange||"#F59E0B"):d.steps?.client?.mode==="sent_to_client"?B.orange||"#F59E0B":C.mut;
          const stLabel = st==="approved"?"Aprovado":st==="rejected"?"Reprovado":st==="revision"?"Em edição":d.steps?.client?.mode==="sent_to_client"?"Em Análise":"Em produção";
          const imgs = [...(d.files||[]),...(d.steps?.design?.files||[]),...(d.steps?.production?.files||[])].filter(f=>f.url&&/\.(jpg|jpeg|png|gif|webp)$/i.test(f.name||""));
          return <div key={d.id} onClick={()=>setSub("demand_"+d.id)} style={{ flexShrink:0, width:170, borderRadius:16, overflow:"hidden", cursor:"pointer", background:C.card, border:`1px solid ${C.brd}` }}>
            <div style={{ height:110, background:imgs[0]?`url(${imgs[0].url}) center/cover`:`linear-gradient(135deg, ${stColor}20, ${stColor}08)`, position:"relative" }}>
              {!imgs[0] && <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>{IC.content(stColor)}</div>}
              <div style={{ position:"absolute", bottom:8, left:8, right:8 }}><p style={{ fontSize:11, fontWeight:700, color:"#fff", textShadow:"0 1px 4px rgba(0,0,0,0.6)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.title}</p></div>
            </div>
            <div style={{ padding:"8px 10px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontSize:9, color:C.mut }}>{d.createdAt}</span>
              <div style={{ display:"flex", alignItems:"center", gap:3 }}><div style={{ width:5, height:5, borderRadius:3, background:stColor }} /><span style={{ fontSize:8, fontWeight:600, color:stColor }}>{stLabel}</span></div>
            </div>
          </div>;
        })}
      </div>
    </>}

    {/* MATCH4BIZ — mais chamativo */}
    <Card onClick={()=>setSub("match4biz")} style={{ marginTop:12, cursor:"pointer", padding:0, overflow:"hidden" }}>
      <div style={{ background:`linear-gradient(135deg, #8B5CF615, ${LIME}08)`, padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ width:52, height:52, borderRadius:16, background:"linear-gradient(135deg, #8B5CF630, #BBF24630)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={LIME} strokeWidth="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:16, fontWeight:800 }}>Match4Biz</p>
            <p style={{ fontSize:11, color:C.mut, lineHeight:1.4, marginTop:2 }}>Encontre parceiros de negócios ideais entre os clientes da agência. Conecte-se e cresça junto!</p>
            <div style={{ display:"flex", gap:6, marginTop:6 }}>
              <Tag color={LIME}>3 matches</Tag>
              <Tag color="#8B5CF6">6 empresas</Tag>
            </div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.mut} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </Card>

    {/* MÉTRICAS — swipe por rede social */}
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 0 8px" }}>
      <p style={{ fontSize:10, fontWeight:600, letterSpacing:1.5, color:C.mut, textTransform:"uppercase" }}>Métricas das redes</p>
    </div>
    {/* Tabs de rede social */}
    <div style={{ display:"flex", gap:6, marginBottom:10, overflowX:"auto", scrollbarWidth:"none" }}>
      {metricsData.map((md,i) => <button key={i} onClick={()=>setMetricsSlide(i)} style={{ padding:"6px 14px", borderRadius:10, border:metricsSlide===i?"none":`1px solid ${C.brd}`, background:metricsSlide===i?LIME:"transparent", color:metricsSlide===i?(B.textOnAccent||"#0D0D0D"):C.mut, fontSize:11, fontWeight:metricsSlide===i?700:500, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap", flexShrink:0 }}>{md.network}</button>)}
    </div>
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
      {metricsData[metricsSlide]?.metrics.map((m,i) => (
        <Card key={i} onClick={()=>setSub("reports")} style={{ padding:14, cursor:"pointer" }}>
          <span style={{ fontSize:9, fontWeight:600, letterSpacing:1, color:C.mut, textTransform:"uppercase" }}>{m.l}</span>
          <div style={{ display:"flex", alignItems:"baseline", gap:6, marginTop:6 }}>
            <span style={{ fontSize:20, fontWeight:900, color:C.txt }}>{m.v}</span>
            <span style={{ fontSize:10, fontWeight:700, color:B.green, background:`${B.green}10`, padding:"2px 6px", borderRadius:6 }}>{m.d}</span>
          </div>
        </Card>
      ))}
    </div>

    {/* RELATÓRIO — simples e clicável */}
    <Card onClick={()=>setSub("reports")} style={{ marginTop:8, cursor:"pointer", background:`linear-gradient(135deg, ${LIME}06, ${C.card})`, border:`1px solid ${LIME}15` }}>
      <div style={{ display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:44, height:44, borderRadius:14, background:`${LIME}12`, display:"flex", alignItems:"center", justifyContent:"center" }}>{IC.reports ? IC.reports(LIME) : IC.content(LIME)}</div>
        <div style={{ flex:1 }}>
          <p style={{ fontSize:14, fontWeight:700 }}>Relatório de Fevereiro</p>
          <p style={{ fontSize:11, color:C.mut, marginTop:2 }}>Confira a performance completa do mês</p>
        </div>
        <Tag color={LIME}>Novo</Tag>
      </div>
    </Card>

    {/* NEWS — clicável */}
    {(() => {
      const catPhoto = (cat) => ({ trends:"https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&q=80", updates:"https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600&q=80", tips:"https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&q=80", cases:"https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80" }[cat] || "https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=600&q=80");
      const catColor = {trends:"#7C3AED",updates:"#2563EB",tips:"#D97706",cases:"#059669",novidade:"#EC4899",branding:"#8B5CF6",ia:"#6366F1"};
      const catLabel = {trends:"Tendência",updates:"Atualização",tips:"Dica",cases:"Case",novidade:"Novidade",branding:"Branding",ia:"IA"};
      const fallback = [{id:"f1",title:"IA no Marketing: como usar em 2025",summary:"Ferramentas de IA transformando campanhas.",cat:"trends"},{id:"f2",title:"Instagram muda algoritmo do Reels",summary:"Nova atualização prioriza conteúdo original.",cat:"updates"},{id:"f3",title:"5 técnicas para dobrar o engajamento",summary:"Estratégias para aumentar alcance.",cat:"tips"}];
      const items = (articles.length > 0 ? articles : (articlesLoaded ? fallback : [])).slice(0,3);
      if (items.length === 0) return null;
      return <>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 0 8px" }}>
          <p style={{ fontSize:10, fontWeight:600, letterSpacing:1.5, color:C.mut, textTransform:"uppercase" }}>News</p>
          <span onClick={()=>setSub("news")} style={{ fontSize:10, color:LIME, fontWeight:600, cursor:"pointer" }}>Ver todas →</span>
        </div>
        {items[0] && <div onClick={()=>setSub("news")} style={{borderRadius:18,overflow:"hidden",marginBottom:10,position:"relative",height:160,cursor:"pointer"}}>
          <img src={items[0].photo||catPhoto(items[0].cat)} alt="" onError={e=>{e.target.onerror=null;e.target.src=catPhoto("default");}} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0.1) 0%,rgba(0,0,0,0.75) 100%)"}}/>
          <span style={{position:"absolute",top:12,left:12,background:catColor[items[0].cat]||"#6366F1",color:"#fff",fontSize:8,fontWeight:800,padding:"3px 10px",borderRadius:100,textTransform:"uppercase",letterSpacing:0.8}}>{catLabel[items[0].cat]||"Geral"}</span>
          <div style={{position:"absolute",bottom:14,left:14,right:14}}><p style={{fontSize:14,fontWeight:800,color:"#fff",lineHeight:1.3}}>{items[0].title}</p></div>
        </div>}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {items.slice(1,3).map((a,i) => <div key={a.id||i} onClick={()=>setSub("news")} style={{borderRadius:14,overflow:"hidden",position:"relative",height:95,cursor:"pointer"}}>
            <img src={a.photo||catPhoto(a.cat)} alt="" onError={e=>{e.target.onerror=null;e.target.src=catPhoto("default");}} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,rgba(0,0,0,0.05) 0%,rgba(0,0,0,0.72) 100%)"}}/>
            <span style={{position:"absolute",top:7,left:7,background:catColor[a.cat]||"#6366F1",color:"#fff",fontSize:7,fontWeight:800,padding:"2px 7px",borderRadius:100,textTransform:"uppercase"}}>{catLabel[a.cat]||"Geral"}</span>
            <p style={{position:"absolute",bottom:7,left:7,right:7,fontSize:10,fontWeight:700,color:"#fff",lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{a.title}</p>
          </div>)}
        </div>
      </>;
    })()}
    <div style={{ height:20 }} />
  </>;

      const renderContent = () => <>
    {pendingApproval.length > 0 && <><p className="sl" style={{ marginBottom:8, color:B.orange||"#F59E0B" }}>Aguardando aprovação ({pendingApproval.length})</p>
      {pendingApproval.map(d => { const imgs=[...(d.files||[]),...(d.steps?.design?.files||[]),...(d.steps?.production?.files||[])].filter(f=>f.url&&/\.(jpg|jpeg|png|gif|webp)$/i.test(f.name||"")); return <Card key={d.id} onClick={()=>setSub("demand_"+d.id)} style={{ marginBottom:8, cursor:"pointer", border:`1.5px solid ${(B.orange||"#F59E0B")}30` }}>
        <div style={{ display:"flex", gap:10 }}>
          {imgs[0]&&<img src={imgs[0].url} style={{ width:52, height:52, borderRadius:10, objectFit:"cover", flexShrink:0 }} />}
          <div style={{ flex:1 }}><p style={{ fontSize:13, fontWeight:700 }}>{d.title}</p><p style={{ fontSize:10, color:B.muted, marginTop:2 }}>{d.network} · {d.format} · {d.createdAt}</p><Tag color={B.orange||"#F59E0B"}>Aguardando</Tag></div>
        </div>
      </Card>; })}</>}
    {approved.length > 0 && <><p className="sl" style={{ marginTop:16, marginBottom:8, color:B.green }}>Aprovados ({approved.length})</p>
      {approved.slice(0,10).map(d => <Card key={d.id} onClick={()=>setSub("demand_"+d.id)} style={{ marginBottom:6, cursor:"pointer", borderLeft:`3px solid ${B.green}` }}><p style={{ fontSize:12, fontWeight:600 }}>{d.title}</p><p style={{ fontSize:10, color:B.muted, marginTop:2 }}>{d.network} · {d.createdAt}</p></Card>)}</>}
    {demands.length===0 && demandsLoaded && <Card style={{ textAlign:"center", padding:40 }}><span style={{ display:"flex", justifyContent:"center", marginBottom:10, color:B.muted }}>{IC.content(B.muted)}</span><p style={{ fontSize:13, fontWeight:600 }}>Nada por aqui ainda</p></Card>}
  </>;

  const HEADERS = { home:{icon:IC.home,label:"Portal",title:"Meu Marketing"}, content:{icon:IC.content,label:"Aprovação",title:"Conteúdo"}, calendar:{icon:IC.calendar,label:"Eventos",title:"Agenda"}, chat:{icon:IC.chat,label:"Mensagens",title:"Chat"}, more:{icon:IC.settings,label:"Opções",title:"Mais"} };
  const hdr = HEADERS[tab] || HEADERS.home;

  return (
    <div className="app" style={{ background:B.bg, color:B.text }}>
      {ToastEl}
      <style dangerouslySetInnerHTML={{ __html: `
.bnav{background:${navBg}!important;backdrop-filter:blur(20px) saturate(1.4)!important;-webkit-backdrop-filter:blur(20px) saturate(1.4)!important;border-radius:100px!important;border:${navBorder}!important;width:calc(100% - 40px)!important;max-width:340px!important;padding:8px 8px!important}
      ` }} />
      <div className="content" ref={scrollRef} onScroll={e=>setHeaderC(e.currentTarget.scrollTop>60)}>
        {tab !== "home" && <CollapseHeader icon={hdr.icon} label={hdr.label} title={hdr.title} collapsed={headerC} />}
        <div style={{ padding:"14px 16px 0" }}>
          {tab === "home" && renderHome()}
          {tab === "content" && renderContent()}
          {tab === "calendar" && <div style={{ margin:"-14px -16px 0" }}><CalendarPage onBack={()=>goTab("home")} clients={clients} team={team} /></div>}
          {tab === "chat" && <div style={{ margin:"-14px -16px 0", flex:1, display:"flex", flexDirection:"column" }}><ChatPage user={user} chatTermsOk={chatTermsOk} setChatTermsOk={setChatTermsOk} /></div>}
          {tab === "more" && <>
            {[
              {l:"Growth Score",ic:IC.gamify,d:"Seu índice de crescimento",sub:"gamify"},
              {l:"Conteúdo",ic:IC.content,d:"Posts para aprovar",sub:null,tab:"content"},
              {l:"Match4Biz",ic:IC.match4biz,d:"Conecte-se com empresas",sub:"match4biz"},
              {l:"Financeiro",ic:IC.financial,d:"Plano, faturas e serviços",sub:"financial"},
              {l:"Relatórios",ic:IC.reports,d:"Performance das redes",sub:"reports"},
              {l:"Calendário",ic:IC.calendar,d:"Reuniões e gravações",sub:"calendar"},
              {l:"Biblioteca",ic:IC.library,d:"Arquivos e materiais",sub:"library"},
              {l:"Academy",ic:IC.academy,d:"Cursos e aprendizado",sub:"academy"},
              {l:"Notícias",ic:IC.news,d:"Novidades e tendências",sub:"news"},
              {l:"Ideias",ic:IC.ideas,d:"Crie e visualize ideias",sub:"ideas"},
              {l:"Assistente IA",ic:IC.ai,d:"IA para seu time comercial",sub:"ai"},
              {l:"Ajuda",ic:IC.help,d:"Suporte e FAQ",sub:"help"},
              {l:"Configurações",ic:IC.settings,d:"Perfil, aparência e segurança",sub:"settings"},
            ].map((item,i) => (
              <Card key={i} style={{ marginBottom:6, cursor:item.sub?"pointer":"default" }} onClick={()=>{if(item.tab)goTab(item.tab);else if(item.sub)setSub(item.sub);}}><div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:`${B.accent}10`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:B.accent }}>{typeof item.ic==="function"?item.ic(B.accent):item.ic}</div>
                <div style={{ flex:1 }}><p style={{ fontSize:13, fontWeight:600 }}>{item.l}</p><p style={{ fontSize:10, color:B.muted }}>{item.d}</p></div>
                {(item.sub||item.tab) ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg> : <Tag color={B.accent}>Em breve</Tag>}
              </div></Card>
            ))}
            <button onClick={onLogout} style={{ width:"100%", marginTop:16, padding:"14px 0", borderRadius:14, background:`${(B.red||"#FF6B6B")}08`, border:`1px solid ${(B.red||"#FF6B6B")}20`, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, color:B.red||"#FF6B6B" }}>Sair da conta</button>
          </>}
        </div>
      </div>
      <nav className="bnav" style={{ position:"relative", overflow:"visible" }}>
        {TABS.map(t => {
          const a = tab === t.k && !sub;
          return (
            <button key={t.k} onClick={()=>goTab(t.k)} className="bt" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", height:48, padding:0, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", position:"relative", zIndex:a?3:1 }}>
              <div style={{ width:a?54:36, height:a?54:36, borderRadius:"50%", background:a?accentColor:"transparent", display:"flex", alignItems:"center", justifyContent:"center", transform:a?"translateY(-22px)":"translateY(0)", transition:"all .4s cubic-bezier(0.34,1.56,0.64,1)", boxShadow:a?`0 6px 20px ${accentColor}50`:"none" }}>
                {t.i(a ? circleIcon : inactiveColor)}
              </div>
              {a && <span style={{ position:"absolute", bottom:2, fontSize:9, fontWeight:700, color:accentColor, whiteSpace:"nowrap", animation:"fadeIn .3s ease" }}>{t.l}</span>}
              {t.badge > 0 && !a && <span style={{ position:"absolute", top:6, right:"calc(50% - 16px)", width:16, height:16, borderRadius:8, background:B.red||"#FF6B6B", fontSize:9, fontWeight:700, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center" }}>{t.badge}</span>}
            </button>
          );
        })}
      </nav>
      <div style={{ position:"fixed", bottom:0, left:0, right:0, height:"calc(14px + env(safe-area-inset-bottom,0px))", background:B.bg, zIndex:49 }} />
    </div>
  );
}

function MainApp({ user, setUser, onLogout, dark, setDark, themeColor, setThemeColor, uiPrefs, updateUiPrefs, replaceUiPrefs, savePrefsToCloud, cloudDash, cloudNav }) {
  const mainContentRef = useRef(null);
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem("uh_tab") || "home"; } catch { return "home"; }
  });
  const { showToast: mainToast, ToastEl } = useToast();
  const accentColor = themeColor === "custom" ? (uiPrefs.customColor || "#BBF246") : (THEME_MAP[themeColor] || "#BBF246");
  B = getB(dark, accentColor, uiPrefs);
  const [sub, setSub] = useState(() => {
    try { return sessionStorage.getItem("uh_sub") || null; } catch { return null; }
  });
  const [more, setMore] = useState(false);
  /* Sync tab/sub to sessionStorage for refresh persistence */
  useEffect(() => { try { sessionStorage.setItem("uh_tab", tab); } catch {} }, [tab]);
  useEffect(() => { try { if (sub) sessionStorage.setItem("uh_sub", sub); else sessionStorage.removeItem("uh_sub"); } catch {} }, [sub]);
  const [navPicks, setNavPicks] = useState(() => {
    if (cloudNav) return cloudNav;
    try { const s = localStorage.getItem("uh_nav_picks"); return s ? JSON.parse(s) : DEFAULT_NAV; } catch { return DEFAULT_NAV; }
  });
  useEffect(() => { if (cloudNav) setNavPicks(cloudNav); }, [cloudNav]);
  const setNavPicksAndSave = (picks, userId) => {
    setNavPicks(picks);
    try { localStorage.setItem("uh_nav_picks", JSON.stringify(picks)); } catch {}
    savePrefsToCloud(undefined, undefined, undefined, userId, undefined, picks);
  };
  const TABS = [...navPicks.map(k => ALL_TABS.find(t => t.k === k)).filter(Boolean), { k: "more", l: "Mais", i: IC.more }];
  const [showNavEdit, setShowNavEdit] = useState(false);
  const [chatTermsOk, setChatTermsOk] = useState(() => localStorage.getItem("uh_chat_terms") === "1");

  const [agencyIdentity, setAgencyIdentity] = useState({ name:"Unique Marketing 360", slogan:"Agência de marketing 360", city:"Petrópolis, RJ", logo_url:"" });
  useEffect(() => {
    supaGetSetting("agency_identity").then(raw => {
      if (raw) { try { setAgencyIdentity(prev => ({ ...prev, ...JSON.parse(raw) })); } catch {} }
    });
  }, []);

  /* ── Role-based permissions ── */
  const [rolePermsMap, setRolePermsMap] = useState({});
  const [permsLoaded, setPermsLoaded] = useState(false);
  useEffect(() => {
    if (!supabase) { setPermsLoaded(true); return; }
    supaLoadPermissions().then(m => { console.log("[Perms] Loaded role_permissions map:", Object.keys(m).length, "roles configured:", Object.keys(m)); setRolePermsMap(m); setPermsLoaded(true); });
    /* Reload perms every 60s so changes by admin take effect without restart */
    const interval = setInterval(() => {
      supaLoadPermissions().then(m => setRolePermsMap(m));
    }, 60000);
    return () => clearInterval(interval);
  }, []);
  /* Get user's job title from agency_members to check permissions */
  const [userJobTitle, setUserJobTitle] = useState(null);
  const [jobTitleLoaded, setJobTitleLoaded] = useState(false);
  useEffect(() => {
    if (!supabase || !user?.id) { setJobTitleLoaded(true); return; }
    if (user?.supaRole === "admin") { setJobTitleLoaded(true); return; }
    /* Try agency_members first (role field), fall back to profiles metadata */
    supabase.from("agency_members").select("role, job_title, status").eq("user_id", user.id).limit(1).then(({ data, error }) => {
      if (error) console.warn("[Perms] agency_members query failed:", error.message);
      const t = data?.[0]?.job_title || data?.[0]?.role || null;
      console.log("[Perms] User job title:", t, "| member status:", data?.[0]?.status, "| user.role:", user?.role);
      if (t) setUserJobTitle(t);
      setJobTitleLoaded(true);
    }).catch(() => { setJobTitleLoaded(true); });
  }, [user?.id]);
  const canAccess = (areaKey) => {
    if (!user || user.supaRole === "admin") return true;
    if (areaKey === "home") return true; /* home is always accessible */
    if (areaKey === "settings") return true; /* own settings always accessible */
    if (!permsLoaded || !jobTitleLoaded) return false; /* BLOCK while loading permissions */
    /* Basic areas always allowed regardless of config */
    const ALWAYS_ALLOWED = ["home.view","settings.own","checkin.own"];
    if (ALWAYS_ALLOWED.includes(areaKey)) return true;
    if (!userJobTitle) { console.warn("[Perms] BLOCKED", areaKey, "— no job title found for user"); return false; }
    const perms = rolePermsMap[userJobTitle];
    if (!perms) { console.warn("[Perms] BLOCKED", areaKey, "— no permissions configured for role:", userJobTitle); return false; }
    const allowed = perms[areaKey] !== false;
    if (!allowed) console.log("[Perms] BLOCKED", areaKey, "for role", userJobTitle);
    return allowed;
  };

  /* ── Shared clients state loaded from Supabase ── */
  const [sharedClients, setSharedClients] = useState([]);
  const [sharedTeam, setSharedTeam] = useState([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);

  /* ── Shared demands state loaded from Supabase ── */
  const [sharedDemands, setSharedDemands] = useState([]);
  const [sharedArticles, setSharedArticles] = useState([]);
  const [demandsLoaded, setDemandsLoaded] = useState(false);

  /* ── Notification state ── */
  /* ── Real notifications ── */
  const [notifCount, setNotifCount] = useState(0);
  useEffect(() => {
    if (!user?.id || !supabase) return;
    /* Load unread count */
    const loadCount = async () => {
      const { count } = await supabase.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false);
      setNotifCount(count || 0);
    };
    loadCount();
    /* Real-time: listen for new notifications */
    const chan = supabase.channel("notifs_" + user.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
      setNotifCount(p => p + 1);
    }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => {
      loadCount(); /* Recount on any update (mark read) */
    }).subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [user?.id]);

  /* ── Realtime badge counts ── */
  const [chatUnread, setChatUnread] = useState(0);
  const [demandBadge, setDemandBadge] = useState(0);

  /* ── Load chat unread count (deferred to not block initial render) ── */
  useEffect(() => {
    if (!supabase || !user?.id) return;
    let badgeTimer;
    const loadChatUnread = async () => {
      try {
        const { data: memberships } = await supabase.from("conversation_members").select("conversation_id, last_read_at").eq("user_id", user.id);
        if (!memberships?.length) { setChatUnread(0); return; }
        const convIds = memberships.map(m => m.conversation_id);
        /* Single query: get all messages not from me, then filter in JS */
        const { data: msgs } = await supabase.from("messages").select("id, conversation_id, created_at").in("conversation_id", convIds).neq("sender_id", user.id).order("created_at", { ascending: false }).limit(200);
        if (!msgs?.length) { setChatUnread(0); return; }
        const lastReadMap = {};
        memberships.forEach(m => { lastReadMap[m.conversation_id] = m.last_read_at; });
        let total = 0;
        for (const m of msgs) {
          const lr = lastReadMap[m.conversation_id];
          if (!lr || new Date(m.created_at) > new Date(lr)) total++;
        }
        setChatUnread(total);
      } catch(e) { setChatUnread(0); }
    };
    badgeTimer = setTimeout(() => {
      loadChatUnread();
    }, 1500); /* defer 1.5s to not block initial render */
    /* Realtime: new messages → recalculate */
    const chan = supabase.channel("nav-chat-badge").on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      if (payload.new.sender_id !== user.id) setChatUnread(c => c + 1);
    }).subscribe();
    return () => { clearTimeout(badgeTimer); supabase.removeChannel(chan); };
  }, [user?.id]);

  /* ── Load demand badge count (new demands not yet viewed) ── */
  const [demandLastSeen, setDemandLastSeen] = useState(() => localStorage.getItem("uh_demand_seen") || new Date().toISOString());
  useEffect(() => {
    if (!supabase || !user?.id) return;
    let badgeTimer2;
    const loadDemandBadge = async () => {
      const { count } = await supabase.from("demands").select("id", { count: "exact", head: true }).gt("created_at", demandLastSeen);
      setDemandBadge(count || 0);
    };
    badgeTimer2 = setTimeout(() => { loadDemandBadge(); }, 1500); /* defer */
    /* Realtime: new demands → increment */
    const chan = supabase.channel("nav-demand-badge").on("postgres_changes", { event: "INSERT", schema: "public", table: "demands" }, () => {
      setDemandBadge(c => c + 1);
    }).subscribe();
    return () => { clearTimeout(badgeTimer2); supabase.removeChannel(chan); };
  }, [user?.id, demandLastSeen]);

  /* Clear demand badge when visiting content tab */
  const clearDemandBadge = () => { const now = new Date().toISOString(); setDemandLastSeen(now); localStorage.setItem("uh_demand_seen", now); setDemandBadge(0); };
  /* Clear chat badge when visiting chat tab */
  const clearChatBadge = () => setChatUnread(0);

  useEffect(() => {
    if (!supabase || clientsLoaded) return;
    supaLoadClients().then(async rows => {
      if (rows) {
        if (rows.length > 0) {
          const merged = rows.map(r => {
            const existing = CLIENTS_DATA_INIT.find(c => c.name.toLowerCase() === r.name.toLowerCase());
            return mergeSupaClient(r, existing);
          });
          /* Load file metadata and socials for ALL clients in ONE query */
          const settingKeys = merged.flatMap(c => [`client_files_${c.id}`, `client_socials_${c.id}`, `client_logo_${c.id}`]);
          console.log("[Clients] Loading settings for", merged.length, "clients, keys:", settingKeys.filter(k=>k.startsWith("client_files_")).length, "file keys");
          const settingsMap = await supaGetSettingsBulk(settingKeys);
          console.log("[Clients] Settings loaded:", Object.keys(settingsMap).length, "keys found:", Object.keys(settingsMap).filter(k=>k.startsWith("client_files_")));
          const withExtras = merged.map(c => {
            let result = c;
            const filesRaw = settingsMap[`client_files_${c.id}`];
            if (filesRaw) { try { result = { ...result, files: JSON.parse(filesRaw) }; } catch {} }
            const socialsRaw = settingsMap[`client_socials_${c.id}`];
            if (socialsRaw) { try { result = { ...result, socials: { ...result.socials, ...JSON.parse(socialsRaw) } }; } catch {} }
            const logoUrl = settingsMap[`client_logo_${c.id}`];
            if (logoUrl) result = { ...result, logo: logoUrl };
            return result;
          });
          setSharedClients(withExtras);
        } else {
          setSharedClients([]);
        }
      } else {
        setSharedClients([]);
      }
      setClientsLoaded(true);
    });
    /* Also load team for dashboard */
    supaLoadTeam().then(async rows => {
      if (!rows?.length) return;
      const uids = rows.filter(r=>r.user_id).map(r=>r.user_id);
      let pm = {};
      if (uids.length && supabase) {
        const { data: profs } = await supabase.from("profiles").select("id, photo_url").in("id", uids);
        (profs||[]).forEach(p => { pm[p.id] = p.photo_url; });
      }
      setSharedTeam(rows.map(r => ({ ...r, photo_url: pm[r.user_id]||null })));
    });
  }, [clientsLoaded]);

  /* Load demands once after clients are ready */
  useEffect(() => {
    if (!supabase || demandsLoaded || !clientsLoaded) return;
    supaLoadDemands().then(rows => {
      if (rows) {
        if (rows.length > 0) {
          const dbDemands = rows.map(r => {
            const existing = DEMANDS_INIT.find(d => d.title === r.title);
            if (existing) return { ...existing, supaId: r.id };
            const dem = mergeSupaDemand(r);
            if (r.client_id && sharedClients) {
              const cl = sharedClients.find(c => c.supaId === r.client_id || c.id === r.client_id);
              if (cl) dem.client = cl.name;
            }
            return dem;
          });
          setSharedDemands(dbDemands);
        } else {
          setSharedDemands([]);
        }
      } else {
        setSharedDemands(DEMANDS_INIT);
      }
      setDemandsLoaded(true);
    });
  }, [clientsLoaded, demandsLoaded]);

  /* Load news articles at startup so dashboard shows them immediately */
  const [articlesLoaded, setArticlesLoaded] = useState(false);
  useEffect(() => {
    if (!supabase || articlesLoaded) return;
    supaLoadNews().then(rows => {
      if (rows && rows.length > 0) {
        setSharedArticles(rows.map(parseNewsRow));
      }
      setArticlesLoaded(true);
    });
  }, [articlesLoaded]);

  const [pendingOpenId, setPendingOpenId] = useState(null);
  /* ── Guard: redirect to home if current tab/sub is restricted ── */
  useEffect(() => {
    if (!canAccess(tab)) { setTab("home"); try { sessionStorage.setItem("uh_tab", "home"); } catch {} }
    if (sub && !canAccess(sub)) { setSub(null); try { sessionStorage.removeItem("uh_sub"); } catch {} }
  }, [tab, sub, userJobTitle, rolePermsMap]);
  const goTab = (k, initialId) => { if (!canAccess(k)) { mainToast("Acesso restrito pelo administrador"); return; } setTab(k); setSub(null); setMore(false); try { sessionStorage.setItem("uh_tab", k); sessionStorage.removeItem("uh_sub"); } catch {} if (initialId) setPendingOpenId(initialId); if (k === "chat") clearChatBadge(); if (k === "content") clearDemandBadge(); requestAnimationFrame(() => { if (mainContentRef.current) mainContentRef.current.scrollTop = 0; }); };
  const [pendingSubId, setPendingSubId] = useState(null);
  const goSub = (k, initialId) => { if (!canAccess(k)) { mainToast("Acesso restrito pelo administrador"); return; } setSub(k); setMore(false); try { sessionStorage.setItem("uh_sub", k); } catch {} if (initialId) setPendingSubId(initialId); };

  return (
    <div className="app" style={{ background: B.bg, color: B.text }}>
      {ToastEl}
      <style dangerouslySetInnerHTML={{ __html: `
:root{
--uh-fs:${({small:"13px",normal:"14px",large:"16px",xlarge:"18px"})[uiPrefs.fontSize||"normal"]||"14px"};
--uh-fs-sm:${({small:"10px",normal:"11px",large:"13px",xlarge:"14px"})[uiPrefs.fontSize||"normal"]||"11px"};
--uh-fs-lg:${({small:"15px",normal:"16px",large:"19px",xlarge:"22px"})[uiPrefs.fontSize||"normal"]||"16px"};
--uh-fs-title:${({small:"18px",normal:"20px",large:"24px",xlarge:"28px"})[uiPrefs.fontSize||"normal"]||"20px"};
--uh-radius:${({sharp:"4px",round:"14px",pill:"24px"})[uiPrefs.cardRadius||"round"]||"14px"};
--uh-radius-sm:${({sharp:"2px",round:"8px",pill:"16px"})[uiPrefs.cardRadius||"round"]||"8px"};
--uh-pad:${({compact:"10px",normal:"14px",spacious:"20px"})[uiPrefs.density||"normal"]||"14px"};
--uh-gap:${({compact:"6px",normal:"10px",spacious:"16px"})[uiPrefs.density||"normal"]||"10px"};
--uh-card-bg:${(uiPrefs.reduceTransparency||uiPrefs.cardStyle!=="glass")? B.bgCard : (B.bgCard && B.bgCard.startsWith("rgba") ? B.bgCard : (dark?"rgba(28,34,40,0.55)":"rgba(255,255,255,0.55)"))};
--uh-card-shadow:${uiPrefs.cardStyle==="elevated"?(dark?"0 2px 12px rgba(0,0,0,0.3)":"0 2px 12px rgba(0,0,0,0.06)"):(uiPrefs.cardStyle==="glass"?(dark?"0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)":"0 4px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)"):"none")};
--uh-card-border:${uiPrefs.cardStyle==="outlined"?("1.5px solid "+B.border):(uiPrefs.cardStyle==="glass"?("1px solid "+(dark?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.4)")):"1px solid transparent")};
--uh-block-bg:${B.blockBg};
--uh-icon-color:${B.iconColor};
--uh-anim:${uiPrefs.animations===false?"0s":({fast:"0.12s",normal:"0.2s",slow:"0.35s"})[uiPrefs.animSpeed||"normal"]||"0.2s"};
--uh-font:${({system:"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",inter:"'Inter',-apple-system,sans-serif",mono:"'SF Mono','Fira Code','Cascadia Code',monospace",serif:"Georgia,'Times New Roman',serif"})[uiPrefs.fontFamily||"system"]||"inherit"};
--uh-icon-w:${({thin:"1.2",normal:"2",bold:"3"})[uiPrefs.iconWeight||"normal"]||"2"};
--uh-icon-sz:${uiPrefs.iconSize||22}px;
--uh-nav-w:${uiPrefs.navWidth||320}px;
--uh-nav-pad:${({sm:"5px 4px",md:"8px 6px",lg:"11px 8px"})[uiPrefs.navSize||"md"]||"8px 6px"};
--uh-nav-rad:${({pill:"20px",rounded:"14px",bar:"0",minimal:"10px"})[uiPrefs.navStyle||"pill"]||"20px"};
}
body,*{font-family:var(--uh-font)!important}
.app,.screen{background:${B.bg}!important;color:${B.text}!important${uiPrefs.highContrast?";filter:contrast(1.15)":""}}
.card{background:var(--uh-card-bg);box-shadow:var(--uh-card-shadow);border:var(--uh-card-border);border-radius:var(--uh-radius)!important;padding:var(--uh-pad)!important;${uiPrefs.cardStyle==="glass"&&!uiPrefs.reduceTransparency?"backdrop-filter:blur(20px) saturate(1.4);-webkit-backdrop-filter:blur(20px) saturate(1.4);":""}transition:all var(--uh-anim) ease}
p,span,div,h1,h2,h3,h4{color:inherit}
.tinput{background:${B.bgInput}!important;color:${B.text}!important;border-color:${B.border}!important;border-radius:var(--uh-radius-sm)!important;font-size:max(16px,var(--uh-fs))!important}.tinput:focus{border-color:${B.accent}!important;box-shadow:0 0 0 3px ${B.accent}25!important}.tinput::placeholder{color:${B.muted}!important}
.pill.accent,.pill.full.accent{background:${B.accent}!important;color:${B.textOnAccent}!important;border-radius:var(--uh-radius)!important}
.pill.outline{color:${B.text}!important;border-color:${B.border}!important}
.pill{background:${B.dark}!important}
.send-btn{background:${B.accent}!important;color:${B.textOnAccent}!important}
.htab{background:${B.bgCard}!important;color:${B.muted}!important;border-radius:var(--uh-radius-sm)!important}.htab.a{background:${B.accent}!important;color:${B.textOnAccent}!important;box-shadow:0 2px 8px ${B.accent}30!important}
.ib{background:${B.bgCard}!important;color:${B.text}!important;border-color:${B.border}!important}
.sheet{background:${B.bgCard}!important;border-radius:var(--uh-radius) var(--uh-radius) 0 0!important}
.grid-btn{background:${B.bgCard}!important;color:${B.text}!important;border-radius:var(--uh-radius)!important}
.sl{color:${B.muted}!important;font-size:var(--uh-fs-sm)!important}
.tag{background:${dark?"rgba(255,255,255,0.06)":"rgba(11,35,66,0.04)"}!important;border-radius:var(--uh-radius-sm)!important}
.overlay{background:${dark?"rgba(0,0,0,0.6)":"rgba(25,33,38,0.4)"}!important}
.txtbtn{color:${B.muted}!important}
.bnav{background:${uiPrefs.navBgColor||(uiPrefs.navBlur!==false&&!uiPrefs.reduceTransparency?(dark?"rgba(10,15,18,0.85)":"rgba(25,33,38,0.90)"):(dark?"#1C1C1C":"#192126"))}!important;${(uiPrefs.navBlur!==false&&!uiPrefs.reduceTransparency)?"backdrop-filter:blur(20px) saturate(1.4)!important;-webkit-backdrop-filter:blur(20px) saturate(1.4)!important;":""}border-radius:100px!important;border:1px solid ${dark?"#2A2A2A":"rgba(255,255,255,0.08)"}!important;width:calc(100% - 40px)!important;max-width:${uiPrefs.navWidth||340}px!important;padding:${({sm:"6px 6px",md:"8px 8px",lg:"10px 10px"})[uiPrefs.navSize||"md"]||"8px 8px"}!important;${uiPrefs.navPosition==="fixed"?"bottom:0!important;border-radius:0!important;width:100%!important;max-width:100%!important;left:0!important;transform:none!important;":""}}
.bnav .bt{font-size:inherit!important}
.card,.tinput,.pill,.htab,.grid-btn,.tag{transition:all var(--uh-anim) ease!important}
.pg svg:not(.bnav svg){stroke-width:var(--uh-icon-w)}
${(()=>{
  const t = uiPrefs.bgTemplate || "solid";
  if(t==="solid") return "";
  const BG={
    gradient_subtle:`linear-gradient(135deg,${B.bg},${B.accent}12,${B.bg})`,
    gradient_candy:"linear-gradient(135deg,#fce4ec,#f3e5f5,#e8eaf6,#e0f7fa)",
    gradient_crystal:"linear-gradient(160deg,#e8eaf6,#f3e5f5,#ede7f6,#e8eaf6)",
    soft_green:"linear-gradient(160deg,#e8f5e9,#f1f8e9,#e8f5e9)",
    warm_sunset:"linear-gradient(135deg,#fff8e1,#ffe0b2,#ffccbc,#fff8e1)",
    ocean_deep:"linear-gradient(180deg,#0a1628,#0d2137,#0a1628)",
    uh_v2_light:"#F5F5F5",
    uh_v2_dark:"linear-gradient(160deg,#0A0A0A 0%,#0D0D0D 40%,#0A0A0A 100%)",
    ember_glow:"linear-gradient(135deg,#1a0a0a,#2d1212,#1a0a0a)",
    aurora_dark:"linear-gradient(135deg,#0f1419,#1a1025,#0f1920,#0f1419)",
    aurora_purple:"linear-gradient(160deg,#0f0a1a,#1a0f2e,#120a20,#0f0a1a)",
    mesh_warm:`linear-gradient(135deg,${dark?"#1a1412":"#fef9f0"} 0%,${dark?"#1a1018":"#fdf2f8"} 40%,${dark?"#18101a":"#faf5ff"} 70%,${dark?"#1a1412":"#fef9f0"} 100%)`,
    mesh_cool:`linear-gradient(135deg,${dark?"#0f1620":"#f0f7ff"} 0%,${dark?"#0f1a1a":"#f0fdfa"} 40%,${dark?"#101420":"#eef2ff"} 70%,${dark?"#0f1620":"#f0f7ff"} 100%)`,
    mesh_pastel:`linear-gradient(135deg,${dark?"#1a1520":"#fdf4ff"} 0%,${dark?"#151a20":"#fef3c7"} 50%,${dark?"#101a18":"#d1fae5"} 100%)`,
  };
  const OV={
    dots_subtle:{img:`radial-gradient(${dark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.04)"} 1px,transparent 1px)`,sz:"18px 18px"},
    grid_cyber:{img:`linear-gradient(${dark?"rgba(0,255,200,0.04)":"rgba(0,0,0,0.03)"} 1px,transparent 1px),linear-gradient(90deg,${dark?"rgba(0,255,200,0.04)":"rgba(0,0,0,0.03)"} 1px,transparent 1px)`,sz:"24px 24px"},
    diagonal:{img:`repeating-linear-gradient(45deg,transparent,transparent 10px,${dark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)"} 10px,${dark?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.02)"} 11px)`,sz:"auto"},
    topography:{img:`url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 0C8.96 0 0 8.96 0 20s8.96 20 20 20 20-8.96 20-20S31.04 0 20 0z' fill='none' stroke='${dark?"%23ffffff06":"%2300000006"}' stroke-width='1'/%3E%3C/svg%3E")`,sz:"40px 40px"},
  };
  if(BG[t]) return `.app,.screen{background:${BG[t]}!important}`;
  if(OV[t]){
    const bg = t==="grid_cyber"?(dark?"#0a0f14":"#f5f5f7"):B.bg;
    return `.app,.screen{background:${bg}!important}.app::before,.screen::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;background-image:${OV[t].img};background-size:${OV[t].sz}}`;
  }
  return "";
})()}
${uiPrefs.headerStyle==="centered"?`.pg>div:first-child{text-align:center}`:""}
${uiPrefs.headerStyle==="accent"?`.pg>div:first-child{background:${B.accent}10;border-bottom:2px solid ${B.accent}30;margin:-14px -14px 14px;padding:14px;border-radius:var(--uh-radius) var(--uh-radius) 0 0}`:""}
` }} />
      <div className="content" ref={mainContentRef}>
        {!sub && tab === "home" && <HomePage user={user} goSub={goSub} goTab={goTab} clients={sharedClients} notifCount={notifCount} team={sharedTeam} demands={sharedDemands} articles={sharedArticles} articlesLoaded={articlesLoaded} agencyIdentity={agencyIdentity} cloudDash={cloudDash} savePrefsToCloud={savePrefsToCloud} canAccess={canAccess} />}
        {!sub && tab === "content" && <ContentPage user={user} clients={sharedClients} demands={sharedDemands} setDemands={setSharedDemands} team={sharedTeam} initialDemandId={pendingOpenId} onOpenIdConsumed={() => setPendingOpenId(null)} canAccess={canAccess} />}
        {!sub && tab === "clients" && <ClientsPage onBack={() => goTab("home")} onNavigate={(to) => { if(to==="content") goTab("content"); else if(to==="chat") goTab("chat"); }} clients={sharedClients} setClients={setSharedClients} user={user} canAccess={canAccess} />}

        {sub === "checkin" && <CheckinPage onBack={() => setSub(null)} user={user} />}
        {sub === "clients" && <ClientsPage onBack={() => setSub(null)} onNavigate={(to) => { setSub(null); if(to==="content") goTab("content"); else if(to==="chat") goTab("chat"); }} clients={sharedClients} setClients={setSharedClients} user={user} canAccess={canAccess} />}
        {sub === "academy" && <AcademyPage onBack={() => setSub(null)} />}
        {sub === "financial" && <FinancialPage onBack={() => setSub(null)} clients={sharedClients} canAccess={canAccess} />}
        {sub === "notifs" && <NotifsPage onBack={() => { setSub(null); /* Refresh count */ if (user?.id && supabase) supabase.from("notifications").select("*", { count:"exact", head:true }).eq("user_id", user.id).eq("read", false).then(r => setNotifCount(r.count||0)); }} user={user} />}
        {sub === "settings" && <SettingsBoundary><SettingsPage onBack={() => setSub(null)} user={user} setUser={setUser} onLogout={onLogout} dark={dark} setDark={setDark} themeColor={themeColor} setThemeColor={setThemeColor} onNavEdit={() => setShowNavEdit(true)} propClients={sharedClients} uiPrefs={uiPrefs} updateUiPrefs={updateUiPrefs} replaceUiPrefs={replaceUiPrefs} onAgencyUpdate={setAgencyIdentity} savePrefsToCloud={savePrefsToCloud} /></SettingsBoundary>}
        {sub === "calendar" && <CalendarPage onBack={() => setSub(null)} clients={sharedClients} team={sharedTeam} />}
        {sub === "library" && <LibraryPage onBack={() => setSub(null)} clients={sharedClients} onUpdateClients={setSharedClients} />}
        {sub === "reports" && <ReportsPage onBack={() => setSub(null)} clients={sharedClients} team={sharedTeam} />}
        {sub === "news" && <NewsPage onBack={() => setSub(null)} onArticlesLoad={setSharedArticles} initialArticleId={pendingSubId} onOpenIdConsumed={() => setPendingSubId(null)} user={user} />}
        {sub === "ideas" && <IdeasPage onBack={() => setSub(null)} user={user} clients={sharedClients} />}
        {sub === "gamify" && <GamifyPage onBack={() => setSub(null)} user={user} team={sharedTeam} />}
        {sub === "match4biz" && <Match4BizPage onBack={() => setSub(null)} clients={sharedClients} user={user} />}
        {sub === "ai" && <AIPage onBack={() => setSub(null)} user={user} agencyIdentity={agencyIdentity} />}
        {sub === "help" && <HelpPage onBack={() => setSub(null)} />}
        {sub === "search" && <SearchPage onBack={() => setSub(null)} team={sharedTeam} clients={sharedClients} />}
        {sub === "team" && <TeamPage onBack={() => setSub(null)} user={user} onTeamChange={() => { supaLoadTeam().then(rows => { if(rows) setSharedTeam(rows); }); }} />}
      </div>

      {!sub && tab === "chat" && <ChatPage user={user} chatTermsOk={chatTermsOk} setChatTermsOk={setChatTermsOk} />}
      <nav className="bnav" style={{ position:"relative", overflow:"visible" }}>
        {TABS.map((t, idx) => {
          const a = (tab === t.k && !sub) || (sub === t.k);
          const navSzMap = { sm:{circle:44,inactive:28,h:40,lift:-18}, md:{circle:54,inactive:36,h:48,lift:-22}, lg:{circle:60,inactive:40,h:54,lift:-26} };
          const sz = navSzMap[uiPrefs.navSize] || navSzMap.md;
          const inactiveColor = uiPrefs.navInactiveColor || (dark ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.5)");
          const circleBg = uiPrefs.navCircleBg || accentColor;
          const circleIcon = uiPrefs.navCircleIcon || (dark ? "#0D0D0D" : "#fff");
          const navTextColor = uiPrefs.navTextColor || accentColor;
          return (
            <button key={t.k} onClick={() => {
              if (t.k === "more") { setMore(!more); return; }
              if (["clients", "checkin", "academy", "financial", "calendar", "library", "reports", "news", "ideas", "gamify", "match4biz", "ai", "help", "search", "settings", "team"].includes(t.k)) { goSub(t.k); return; }
              goTab(t.k);
            }} className="bt" style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", height:sz.h, padding:0, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", position:"relative", zIndex:a?3:1 }}>
              <div style={{ width:a?sz.circle:sz.inactive, height:a?sz.circle:sz.inactive, borderRadius:"50%", background:a?circleBg:"transparent", display:"flex", alignItems:"center", justifyContent:"center", transform:a?`translateY(${sz.lift}px)`:"translateY(0)", transition:"all .4s cubic-bezier(0.34,1.56,0.64,1)", boxShadow:a?`0 6px 20px ${circleBg}50`:"none" }}>
                {t.i(a ? circleIcon : inactiveColor)}
              </div>
              {a && uiPrefs.navLabels!==false && <span style={{ position:"absolute", bottom:2, fontSize:9, fontWeight:700, color:navTextColor, whiteSpace:"nowrap", animation:"fadeIn .3s ease" }}>{t.l}</span>}
              {t.k === "content" && demandBadge > 0 && !a && <Badge n={demandBadge} style={{ position:"absolute", top:6, right:"calc(50% - 16px)" }} />}
              {t.k === "chat" && chatUnread > 0 && !a && <Badge n={chatUnread} style={{ position:"absolute", top:6, right:"calc(50% - 16px)" }} />}
            </button>
          );
        })}
      </nav>

      {/* ── SAFE AREA BOTTOM FILL — covers the gap below the floating nav ── */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, height:"calc(14px + env(safe-area-inset-bottom,0px))", background:B.bg, zIndex:49 }} />

      {more && <MoreSheet onClose={() => setMore(false)} goSub={goSub} />}
      {showNavEdit && <NavEditSheet picks={navPicks} setPicks={(p) => setNavPicksAndSave(p, user?.id)} onClose={() => setShowNavEdit(false)} />}
    </div>
  );
}

/* ═══════════════════════ ROOT ═══════════════════════ */
export default function App() {
  const [user, setUser] = useState(null);
  const [clientUser, setClientUser] = useState(null); /* Client portal user */
  const userRef = React.useRef(null); /* Track user for onAuthStateChange closure */
  const setUserAndRef = (u) => { userRef.current = u; setUser(u); };
  const [showPWA, setShowPWA] = useState(false);

  /* ── iOS zoom prevention: lock viewport on input focus, release on blur ── */
  useEffect(() => {
    const vp = document.querySelector('meta[name=viewport]');
    if (!vp) return;
    const LOCKED = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, viewport-fit=cover';
    const NORMAL = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, viewport-fit=cover';
    const lock = (e) => { if (['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)) vp.setAttribute('content', LOCKED); };
    const unlock = (e) => { if (['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)) setTimeout(() => vp.setAttribute('content', NORMAL), 200); };
    document.addEventListener('focusin', lock, true);
    document.addEventListener('focusout', unlock, true);
    return () => { document.removeEventListener('focusin', lock, true); document.removeEventListener('focusout', unlock, true); };
  }, []);

  /* ── iOS 26 PWA gap fix: sync body background with dark mode ── */

  /* ── Load visual prefs from cloud after login ── */
  const [cloudDash, setCloudDash] = useState(null);
  const [cloudNav, setCloudNav] = useState(null);
  const loadCloudPrefsForUser = async (userId) => {
    if (!supabase || !userId) return;
    try {
      const cloudPrefs = await supaGetSetting(`visual_prefs_${userId}`);
      if (!cloudPrefs) return;
      const vp = typeof cloudPrefs === "string" ? JSON.parse(cloudPrefs) : cloudPrefs;
      if (vp.dark !== undefined) { _setDark(vp.dark); }
      if (vp.theme) { _setThemeColor(vp.theme); }
      if (vp.prefs) { setUiPrefs(vp.prefs); try { localStorage.setItem("uh_ui_prefs", JSON.stringify(vp.prefs)); } catch {} }
      if (vp.dash) { try { localStorage.setItem("uh_dash_cfg", JSON.stringify(vp.dash)); } catch {} setCloudDash(vp.dash); }
      if (vp.nav) { try { localStorage.setItem("uh_nav_picks", JSON.stringify(vp.nav)); } catch {} setCloudNav(vp.nav); }
    } catch(e) { console.warn("loadCloudPrefs error:", e); }
  };

  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("uh_dark") === "1"; } catch { return false; }
  });
  const [themeColor, setThemeColor] = useState(() => {
    try { return localStorage.getItem("uh_theme") || "default"; } catch { return "default"; }
  });
  const [uiPrefs, setUiPrefs] = useState(() => {
    try { const s = localStorage.getItem("uh_ui_prefs"); return s ? JSON.parse(s) : {}; } catch { return {}; }
  });

  /* Save visual prefs to Supabase (debounced) — includes dash+nav */
  const savePrefsTimer = React.useRef(null);
  const allPrefsRef = React.useRef({ dark: false, theme: "default", prefs: {}, dash: null, nav: null });
  const savePrefsToCloud = React.useCallback((dark_v, theme_v, prefs_v, userId, dash_v, nav_v) => {
    if (!supabase || !userId) return;
    // merge into ref so debounce always saves latest
    allPrefsRef.current = {
      dark: dark_v ?? allPrefsRef.current.dark,
      theme: theme_v ?? allPrefsRef.current.theme,
      prefs: prefs_v ?? allPrefsRef.current.prefs,
      dash: dash_v !== undefined ? dash_v : allPrefsRef.current.dash,
      nav: nav_v !== undefined ? nav_v : allPrefsRef.current.nav,
    };
    clearTimeout(savePrefsTimer.current);
    savePrefsTimer.current = setTimeout(() => {
      supaSetSetting(`visual_prefs_${userId}`, JSON.stringify(allPrefsRef.current));
    }, 800);
  }, []);

  const _setDark = (v) => {
    setDark(v);
    try { localStorage.setItem("uh_dark", v ? "1" : "0"); } catch {}
  };
  const _setThemeColor = (v) => {
    setThemeColor(v);
    try { localStorage.setItem("uh_theme", v); } catch {}
  };
  const updateUiPrefs = (patch) => {
    setUiPrefs(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem("uh_ui_prefs", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const replaceUiPrefs = (prefs) => {
    setUiPrefs(() => {
      try { localStorage.setItem("uh_ui_prefs", JSON.stringify(prefs)); } catch {}
      return prefs;
    });
  };

  /* Wrap setters to also sync to cloud when user is logged in */
  const syncedSetDark = React.useCallback((v, userId) => {
    _setDark(v);
    setUiPrefs(prev => { savePrefsToCloud(v, themeColor, prev, userId); return prev; });
  }, [themeColor, savePrefsToCloud]);
  const syncedSetTheme = React.useCallback((v, userId) => {
    _setThemeColor(v);
    setUiPrefs(prev => { savePrefsToCloud(dark, v, prev, userId); return prev; });
  }, [dark, savePrefsToCloud]);
  const syncedUpdatePrefs = React.useCallback((patch, userId) => {
    setUiPrefs(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem("uh_ui_prefs", JSON.stringify(next)); } catch {}
      savePrefsToCloud(dark, themeColor, next, userId);
      return next;
    });
  }, [dark, themeColor, savePrefsToCloud]);
  const syncedReplacePrefs = React.useCallback((prefs, userId) => {
    setUiPrefs(() => {
      try { localStorage.setItem("uh_ui_prefs", JSON.stringify(prefs)); } catch {}
      savePrefsToCloud(dark, themeColor, prefs, userId);
      return prefs;
    });
  }, [dark, themeColor, savePrefsToCloud]);
  const [authLoading, setAuthLoading] = useState(!!supabase);
  const [onboardDone, setOnboardDone] = useState(() => {
    try { return localStorage.getItem("uh_onboard_v4") === "1"; } catch { return false; }
  });
  const finishOnboard = () => {
    try { localStorage.setItem("uh_onboard_v4","1"); } catch {}
    setOnboardDone(true);
  };

  /* ── Sync body background with dark mode — paints iOS 26 PWA gap zone ── */
  useEffect(() => {
    const bg = dark ? "#0F1419" : "#F7F7F8";
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
  }, [dark]);

  /* Force-kick blocked users even if app is already open */
  const BLOCKED_EMAILS = ["lucassouza@hotmail.com","lucassouzap@hotmail.com","lucassouza@hotmail.com.br","lucas.souza@hotmail.com","lucassouza@outlook.com"];
  useEffect(() => {
    if (!user?.email) return;
    const check = () => {
      if (BLOCKED_EMAILS.some(b => user.email.toLowerCase().replace(/\s/g,"") === b)) {
        if (supabase) supabase.auth.signOut().catch(() => {});
        setUserAndRef(null);
        try { localStorage.removeItem("uh_user"); sessionStorage.clear(); } catch {}
        alert("Seu acesso foi revogado. Entre em contato com o administrador.");
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, [user]);

  /* Check for existing Supabase session on mount */
  /* ── Meta OAuth callback handler ── */
  const [metaOAuthPending, setMetaOAuthPending] = useState(!!_metaOAuthCapture);
  const [metaOAuthResult, setMetaOAuthResult] = useState(null); /* {success:true, pages:[...]} or {success:false, msg} */
  const [metaPagePicker, setMetaPagePicker] = useState(null); /* {pages:[], clientId} — shown when user needs to pick a page */
  const [metaSavingPage, setMetaSavingPage] = useState(false);
  useEffect(() => {
    if (!_metaOAuthCapture) return;
    const { code, clientId, redirectUri: capturedRedirectUri, isInstagram } = _metaOAuthCapture;
    console.log("[OAuth] Processing callback, clientId:", clientId, "isInstagram:", isInstagram);
    (async () => {
      try {
        if (isInstagram) {
          /* Instagram Platform API flow */
          const result = await handleInstagramOAuthCallback(code, capturedRedirectUri);
          console.log("[Instagram OAuth] Result:", JSON.stringify(result).substring(0, 300));
          if (result && !result.error && result.username) {
            await saveInstagramToken(clientId, result);
            try { sessionStorage.setItem("uh_ig_connected", JSON.stringify({ clientId, ...result })); } catch {}
            setMetaOAuthResult({ success: true, msg: `@${result.username} conectado!`, igUsername: result.username, isInstagram: true });
          } else {
            const errMsg = typeof result?.error === "string" ? result.error : JSON.stringify(result?.error || result);
            setMetaOAuthResult({ success: false, msg: errMsg });
          }
          setMetaOAuthPending(false);
        } else {
          /* Facebook OAuth flow (existing) */
          const result = await handleMetaOAuthCallback(code, capturedRedirectUri);
          console.log("[Meta OAuth] Result:", JSON.stringify(result).substring(0, 300));
          if (result && !result.error && result.pages?.length) {
            setMetaPagePicker({ pages: result.pages, clientId });
            setMetaOAuthPending(false);
          } else if (result && !result.error && result.saved) {
            setMetaOAuthResult({ success: true, msg: "Conectado!", pageName: result.page_name, igUsername: result.ig_username });
            setMetaOAuthPending(false);
          } else {
            const errMsg = typeof result?.error === "string" ? result.error : JSON.stringify(result?.error || result);
            try { sessionStorage.setItem("uh_meta_error", errMsg); } catch {}
            setMetaOAuthResult({ success: false, msg: errMsg });
            setMetaOAuthPending(false);
          }
        }
      } catch(e) {
        setMetaOAuthResult({ success: false, msg: e.message });
        setMetaOAuthPending(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let timeout = setTimeout(() => { setAuthLoading(false); }, 8000); /* safety: max 8s */
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        /* Block banned users even if they have active session */
        const BLOCKED_EMAILS = ["lucassouza@hotmail.com","lucassouzap@hotmail.com","lucassouza@hotmail.com.br","lucas.souza@hotmail.com","lucassouza@outlook.com"];
        if (BLOCKED_EMAILS.some(b => session.user.email?.toLowerCase().replace(/\s/g,"") === b)) {
          await supabase.auth.signOut(); clearTimeout(timeout); setAuthLoading(false); return;
        }
        try {
          const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
          /* ── Block non-approved members (approval check on session restore) ── */
          if (!profile || profile.role !== "admin") {
            try {
              const { data: memberRow, error: memberErr } = await supabase.from("agency_members").select("status").eq("user_id", session.user.id).maybeSingle();
              if (memberErr) console.warn("[Auth] agency_members query error:", memberErr);
              const memberStatus = memberRow?.status?.toLowerCase?.() || "";
              const isApproved = memberStatus === "ativo" || memberStatus === "offline" || memberStatus === "online";
              if (!isApproved) {
                console.warn("[Auth] Blocked: member not approved, status:", memberRow?.status, session.user.email);
                await supabase.auth.signOut(); clearTimeout(timeout); setAuthLoading(false); return;
              }
            } catch(memberErr) { console.warn("[Auth] agency_members check failed, blocking:", memberErr); await supabase.auth.signOut(); clearTimeout(timeout); setAuthLoading(false); return; }
          }
          /* Load extras, photo, and visual prefs in ONE bulk query */
          const settingsMap = await supaGetSettingsBulk([`profile_extras_${session.user.id}`, `profile_photo_${session.user.id}`, `visual_prefs_${session.user.id}`]);
          const extrasRaw = settingsMap[`profile_extras_${session.user.id}`] || null;
          const photoSetting = settingsMap[`profile_photo_${session.user.id}`] || null;
          const cloudPrefs = settingsMap[`visual_prefs_${session.user.id}`] || null;
          const extras = extrasRaw ? (() => { try { return typeof extrasRaw === "string" ? JSON.parse(extrasRaw) : extrasRaw; } catch { return {}; } })() : {};
          const photo = profile?.photo_url || photoSetting || null;
          setUserAndRef({
            id: session.user.id, name: profile?.name || session.user.user_metadata?.name || session.user.email.split("@")[0],
            email: session.user.email, role: profile?.role === "admin" ? "CEO" : profile?.role === "member" ? (profile?.nick || "Colaborador") : "Cliente",
            supaRole: profile?.role || "member", photo,
            nick: profile?.nick || profile?.name || session.user.email.split("@")[0],
            phone: profile?.phone || "", birth: extras.birth || "", social: extras.social || "", blood: extras.blood || "", bio: extras.bio || "", remember: true,
          });
          /* Apply visual prefs from cloud */
          try {
            if (cloudPrefs) {
              const vp = typeof cloudPrefs === "string" ? JSON.parse(cloudPrefs) : cloudPrefs;
              if (vp.dark !== undefined) { setDark(vp.dark); try { localStorage.setItem("uh_dark", vp.dark ? "1" : "0"); } catch {} }
              if (vp.theme) { setThemeColor(vp.theme); try { localStorage.setItem("uh_theme", vp.theme); } catch {} }
              if (vp.prefs) { setUiPrefs(vp.prefs); try { localStorage.setItem("uh_ui_prefs", JSON.stringify(vp.prefs)); } catch {} }
              if (vp.dash) { try { localStorage.setItem("uh_dash_cfg", JSON.stringify(vp.dash)); } catch {} setCloudDash(vp.dash); }
              if (vp.nav)  { try { localStorage.setItem("uh_nav_picks", JSON.stringify(vp.nav)); } catch {} setCloudNav(vp.nav); }
            }
          } catch(e) { console.warn("Visual prefs load failed:", e); }
        } catch(e) { console.error("Profile load failed, blocking:", e); await supabase.auth.signOut(); }
      }
      clearTimeout(timeout);
      setAuthLoading(false);
    }).catch(() => { clearTimeout(timeout); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") { setUserAndRef(null); }
    });
    return () => subscription?.unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setUserAndRef(null);
  };

  if (metaOAuthPending || metaOAuthResult || metaPagePicker) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F7F7F8"}}>
      <div style={{textAlign:"center",padding:24,maxWidth:480,width:"100%"}}>

        {/* Loading */}
        {metaOAuthPending && !metaPagePicker ? <>
          <div style={{fontSize:48,marginBottom:16}}>🔗</div>
          <div style={{width:44,height:44,border:"3px solid #E5E2DD",borderTopColor:"#1877F2",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
          <p style={{color:"#192126",fontSize:15,fontWeight:700}}>Conectando com Meta...</p>
          <p style={{color:"#8B8F92",fontSize:12,marginTop:4}}>Buscando suas páginas e perfis</p>
        </> : null}

        {/* Page Picker */}
        {metaPagePicker && !metaOAuthResult ? <>
          <div style={{fontSize:48,marginBottom:12}}>📋</div>
          <p style={{color:"#192126",fontSize:18,fontWeight:800,marginBottom:4}}>Selecione a página do cliente</p>
          <p style={{color:"#8B8F92",fontSize:12,marginBottom:20}}>{metaPagePicker.pages.length} página{metaPagePicker.pages.length > 1 ? "s" : ""} encontrada{metaPagePicker.pages.length > 1 ? "s" : ""}</p>
          <div style={{maxHeight:"50vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:8,padding:"0 4px"}}>
            {metaPagePicker.pages.map(pg => (
              <button key={pg.page_id} disabled={metaSavingPage} onClick={async () => {
                setMetaSavingPage(true);
                const res = await saveMetaSelectedPage(metaPagePicker.clientId, pg);
                if (res && !res.error) {
                  /* Write to sessionStorage so ClientsPage can update the client */
                  try { sessionStorage.setItem("uh_meta_connected", JSON.stringify({ clientId: metaPagePicker.clientId, page_name: pg.page_name, page_id: pg.page_id, ig_username: pg.ig_username, ig_user_id: pg.ig_user_id })); } catch {}
                  setMetaOAuthResult({ success: true, pageName: pg.page_name, igUsername: pg.ig_username });
                } else {
                  setMetaOAuthResult({ success: false, msg: res?.error || "Erro ao salvar" });
                }
                setMetaSavingPage(false);
              }} style={{
                display:"flex",alignItems:"center",gap:12,padding:"14px 16px",borderRadius:14,
                background:"#fff",border:"1.5px solid #E5E2DD",cursor:metaSavingPage?"wait":"pointer",
                fontFamily:"inherit",textAlign:"left",transition:"all 0.2s",opacity:metaSavingPage?0.6:1
              }}>
                {pg.page_picture ? <img src={pg.page_picture} style={{width:44,height:44,borderRadius:10,objectFit:"cover"}} alt=""/> : <div style={{width:44,height:44,borderRadius:10,background:"#1877F2",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:18}}>{pg.page_name?.[0] || "?"}</div>}
                <div style={{flex:1,minWidth:0}}>
                  <p style={{color:"#192126",fontSize:14,fontWeight:700,margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pg.page_name}</p>
                  {pg.page_category && <p style={{color:"#8B8F92",fontSize:11,margin:"2px 0 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{pg.page_category}</p>}
                  <div style={{display:"flex",gap:8,marginTop:4}}>
                    <span style={{fontSize:11,color:"#1877F2",fontWeight:600}}>📘 Facebook</span>
                    {pg.has_instagram ? <span style={{fontSize:11,color:"#E1306C",fontWeight:600}}>📸 @{pg.ig_username}</span> : <span style={{fontSize:11,color:"#ccc"}}>📸 Sem Instagram</span>}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B8F92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
          <button onClick={() => { setMetaPagePicker(null); setMetaOAuthResult(null); setMetaOAuthPending(false); }} style={{marginTop:16,padding:"10px 24px",borderRadius:10,background:"transparent",border:"1px solid #E5E2DD",cursor:"pointer",fontFamily:"inherit",fontSize:12,color:"#8B8F92"}}>Cancelar</button>
        </> : null}

        {/* Success */}
        {metaOAuthResult?.success ? <>
          <div style={{fontSize:56,marginBottom:16}}>✅</div>
          <p style={{color:"#192126",fontSize:18,fontWeight:800,marginBottom:8}}>Conectado com sucesso!</p>
          {metaOAuthResult.igUsername && <p style={{color:"#E1306C",fontSize:14,fontWeight:600}}>📸 @{metaOAuthResult.igUsername}</p>}
          {metaOAuthResult.pageName && <p style={{color:"#1877F2",fontSize:14,fontWeight:600,marginTop:4}}>📘 {metaOAuthResult.pageName}</p>}
          {!metaOAuthResult.igUsername && metaOAuthResult.pageName && <p style={{color:"#F59E0B",fontSize:11,marginTop:8}}>⚠️ Instagram não vinculado a esta página. Vincule pelo Facebook para publicar no Instagram.</p>}
          <p style={{color:"#8B8F92",fontSize:12,marginTop:12}}>Token salvo. Abra o cliente para ver as redes conectadas.</p>
          <button onClick={() => { setMetaOAuthResult(null); setMetaPagePicker(null); }} style={{marginTop:20,padding:"14px 32px",borderRadius:14,background:"#BBF246",border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:700,color:"#192126"}}>Continuar</button>
        </> : null}

        {/* Error */}
        {metaOAuthResult && !metaOAuthResult.success ? <>
          <div style={{fontSize:56,marginBottom:16}}>⚠️</div>
          <p style={{color:"#192126",fontSize:18,fontWeight:800,marginBottom:8}}>Erro na conexão</p>
          <p style={{color:"#EF4444",fontSize:12,marginTop:8,lineHeight:1.5,wordBreak:"break-word"}}>{metaOAuthResult?.msg}</p>
          <button onClick={() => { setMetaOAuthResult(null); setMetaPagePicker(null); }} style={{marginTop:20,padding:"14px 32px",borderRadius:14,background:"#F7F7F8",border:"1.5px solid #E5E2DD",cursor:"pointer",fontFamily:"inherit",fontSize:14,fontWeight:600,color:"#192126"}}>Fechar</button>
        </> : null}

        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (authLoading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#F7F7F8"}}>
      <div style={{textAlign:"center"}}>
        <div style={{width:44,height:44,border:"3px solid #E5E2DD",borderTopColor:"#BBF246",borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px"}}/>
        <p style={{color:"#8B8F92",fontSize:13}}>Carregando...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
.skeleton{background:linear-gradient(90deg,${B.border}00 25%,${B.border}60 50%,${B.border}00 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px}
.btn-loading{opacity:0.6;pointer-events:none;cursor:wait}
.toast-anim{animation:toastIn .3s cubic-bezier(0.34,1.56,0.64,1) both}
@keyframes toastIn{0%{transform:translateY(20px);opacity:0}100%{transform:translateY(0);opacity:1}}
html,body{font-family:'Figtree',sans-serif;background:${dark?"#0F1419":"#F7F7F8"};margin:0;padding:0;width:100%;height:100%;color:${dark?"#E8EAED":"#192126"};overflow:hidden;overscroll-behavior:none;-webkit-overflow-scrolling:touch}#root{width:100%;height:100%;overflow:hidden;background:${dark?"#0F1419":"#F7F7F8"}}
input,textarea,select{font-size:16px !important}
.app{position:fixed;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;overflow:hidden;background:${B.bg}}
.screen{position:fixed;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;overflow:hidden;background:${B.bg}}
.content{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;scroll-behavior:smooth;padding-bottom:calc(90px + env(safe-area-inset-bottom,0px));background:${B.bg}}
.pg{padding:16px 16px 20px;padding-top:${TOP}}
.card{padding:16px;border-radius:16px;background:${dark?"#1C2228":"#fff"};border:none;box-shadow:0 1px 3px ${dark?"rgba(0,0,0,0.3)":"rgba(25,33,38,0.06)"}}
.sl{font-size:10px;font-weight:600;color:${dark?"#8B9099":"#8B8F92"};text-transform:uppercase;letter-spacing:1px}
.ani{animation:fadeUp .35s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes typingBounce{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes skPulse{0%,100%{opacity:0.4}50%{opacity:0.8}}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.bnav{position:fixed;bottom:calc(14px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);display:flex;align-items:center;z-index:50;box-shadow:0 8px 32px rgba(0,0,0,0.4);overflow:visible}
.bnav .bt{font-size:inherit}
.bt{display:flex;align-items:center;justify-content:center;padding:0;background:none;border:none;cursor:pointer;font-family:inherit;position:relative}
.htabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.htabs::-webkit-scrollbar{display:none}
.htab{padding:7px 14px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;background:${dark?"#1C2228":"#fff"};color:${dark?"#8B9099":"#8B8F92"};border:none;cursor:pointer;font-family:inherit;box-shadow:0 1px 2px ${dark?"rgba(0,0,0,0.2)":"rgba(0,0,0,0.04)"}}.htab.a{background:${THEME_MAP[themeColor]||"#BBF246"};color:#192126;box-shadow:0 2px 8px ${THEME_MAP[themeColor]||"#BBF246"}30}
.hscroll{scrollbar-width:none}.hscroll::-webkit-scrollbar{display:none}
.tinput{width:100%;padding:12px 14px;border-radius:14px;border:1.5px solid ${dark?"rgba(255,255,255,0.08)":"rgba(11,35,66,0.08)"};font-size:16px !important;font-family:inherit;background:${dark?"#1C2228":"#fff"};outline:none;color:${dark?"#E8EAED":"#192126"};transition:border .15s}.tinput:focus{border-color:${THEME_MAP[themeColor]||"#BBF246"};box-shadow:0 0 0 3px ${THEME_MAP[themeColor]||"#BBF246"}25}.tinput::placeholder{color:${dark?"#8B9099":"#8B8F92"}}
.pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 18px;border-radius:14px;font-size:13px;font-weight:600;border:none;cursor:pointer;font-family:inherit;background:#192126;color:#fff}.pill:active{transform:scale(0.97)}.pill.full{width:100%;padding:14px 20px;font-size:14px}.pill.accent{background:${THEME_MAP[themeColor]||"#BBF246"};color:#192126}.pill.outline{background:transparent;color:${dark?"#E8EAED":"#192126"};border:1.5px solid ${dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)"}}
.ib{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;border:1.5px solid ${dark?"rgba(255,255,255,0.08)":"rgba(11,35,66,0.1)"};background:${dark?"#1C2228":"#fff"};cursor:pointer;color:${dark?"#E8EAED":"#192126"};box-shadow:0 2px 6px ${dark?"rgba(0,0,0,0.2)":"rgba(25,33,38,0.08)"}}
.tag{display:inline-flex;align-items:center;gap:2px;padding:3px 10px;border-radius:8px;font-size:10px;font-weight:600;background:${dark?"rgba(255,255,255,0.06)":"rgba(11,35,66,0.04)"};color:${dark?"#9CA3AF":"#5E6468"}}
.overlay{position:fixed;inset:0;background:${dark?"rgba(0,0,0,0.6)":"rgba(25,33,38,0.4)"};backdrop-filter:blur(6px);z-index:100;animation:fadeIn .2s}
.sheet{position:fixed;bottom:0;left:0;right:0;max-width:430px;margin:0 auto;background:${dark?"#1C2228":"#fff"};border-radius:24px 24px 0 0;z-index:101;padding:16px 20px 28px;animation:slideUp .3s cubic-bezier(.16,1,.3,1);border:none;box-shadow:0 -4px 30px ${dark?"rgba(0,0,0,0.4)":"rgba(25,33,38,0.15)"};max-height:85vh;overflow-y:auto;-webkit-overflow-scrolling:touch}
.grid-btn{padding:14px 6px;border-radius:16px;background:${dark?"#1C2228":"#fff"};border:none;box-shadow:0 1px 3px ${dark?"rgba(0,0,0,0.2)":"rgba(25,33,38,0.06)"};display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font-family:inherit;transition:all .15s ease;color:${dark?"#E8EAED":"inherit"}}.grid-btn:active{transform:scale(0.95)}
.send-btn{width:44px;height:44px;border-radius:14px;background:${THEME_MAP[themeColor]||"#BBF246"};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#192126;flex-shrink:0;box-shadow:0 2px 8px ${THEME_MAP[themeColor]||"#BBF246"}30}
.txtbtn{background:none;border:none;color:${dark?"#8B9099":"#8B8F92"};cursor:pointer;font-family:inherit;font-size:13px;font-weight:500}
      `}</style>
      {!user && !clientUser && !onboardDone && <OnboardingSlides onDone={finishOnboard} />}
      {!user && !clientUser && onboardDone && <LoginPage onAuth={(u) => { setUserAndRef(u); loadCloudPrefsForUser(u.id);
    const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    const dismissed = (() => { try { return localStorage.getItem("uh_pwa_dismissed"); } catch { return null; } })();
    if (isMobile && !isStandalone && !dismissed) setTimeout(() => setShowPWA(true), 1200);
  }} onClientAuth={(data) => {
    if (data.mode === "login" && data.user) { setClientUser(data.user); }
    if (data.mode === "register") { setClientUser({ registering: true }); }
  }} />}
      {clientUser && clientUser.registering && <ClientOnboarding onComplete={(u) => setClientUser(u)} onBack={() => setClientUser(null)} />}
      {clientUser && !clientUser.registering && <MainClientApp user={clientUser} onLogout={() => { setClientUser(null); if(supabase) supabase.auth.signOut(); }} dark={dark} />}
      {user && <MainApp user={user} setUser={setUser} onLogout={handleLogout} dark={dark} cloudDash={cloudDash} cloudNav={cloudNav}
    setDark={(v) => { _setDark(v); savePrefsToCloud(v, themeColor, uiPrefs, user?.id); }}
    themeColor={themeColor}
    setThemeColor={(v) => { _setThemeColor(v); savePrefsToCloud(dark, v, uiPrefs, user?.id); }}
    uiPrefs={uiPrefs}
    updateUiPrefs={(patch) => { setUiPrefs(prev => { const next={...prev,...patch}; try{localStorage.setItem("uh_ui_prefs",JSON.stringify(next))}catch{}; savePrefsToCloud(dark,themeColor,next,user?.id); return next; }); }}
    replaceUiPrefs={(prefs) => { setUiPrefs(()=>{ try{localStorage.setItem("uh_ui_prefs",JSON.stringify(prefs))}catch{}; savePrefsToCloud(dark,themeColor,prefs,user?.id); return prefs; }); }}
    savePrefsToCloud={savePrefsToCloud}
  />}
    {showPWA && <PWAInstallPopup onDismiss={() => { setShowPWA(false); try { localStorage.setItem("uh_pwa_dismissed", "1"); } catch {} }} />}
    </>
  );
}
// Thu Mar  5 16:39:54 UTC 2026
