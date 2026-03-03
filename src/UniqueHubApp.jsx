import React, { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* ═══════════════════════ SUPABASE ═══════════════════════ */
const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = SUPA_URL && SUPA_KEY ? createClient(SUPA_URL, SUPA_KEY) : null;

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

/* ── Supabase Storage: upload files for demands ── */
const supaUploadFile = async (file, demandId) => {
  if (!supabase) return { error: "Supabase offline" };
  try {
    const maxSize = 100 * 1024 * 1024; /* 100MB */
    if (file.size > maxSize) return { error: `Arquivo muito grande (${(file.size/1024/1024).toFixed(0)}MB). Máximo: 100MB` };
    const path = `${demandId}/${Date.now()}_${file.name.replace(/\s+/g,"_")}`;
    const { data, error } = await supabase.storage.from("demand-files").upload(path, file, { upsert: true, cacheControl: "3600" });
    if (error) { console.error("Upload error:", error.message); return { error: error.message }; }
    const { data: pub } = supabase.storage.from("demand-files").getPublicUrl(path);
    return { name: file.name, path, url: pub?.publicUrl || "", size: file.size, type: file.type };
  } catch (e) { console.error("Upload catch:", e); return { error: e.message }; }
};
const supaDeleteFile = async (path) => {
  if (!supabase) return;
  try { await supabase.storage.from("demand-files").remove([path]); } catch(e) {}
};
const mergeSupaDemand = (row) => ({
  id: row.id, supaId: row.id, type: row.type || "social",
  client: "Sem cliente", title: row.title || "",
  stage: row.stage || "idea", priority: row.priority || "média",
  network: Array.isArray(row.networks) ? row.networks.join(", ") : (row.networks || "Instagram"),
  format: row.format || "Feed",
  sponsored: row.sponsored || false, assignees: ["Matheus"],
  createdAt: row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }) : "",
  steps: (row.steps && Object.keys(row.steps).length > 0) ? row.steps : { idea: { by: "Matheus", text: row.description || "", date: row.created_at ? new Date(row.created_at).toLocaleDateString("pt-BR", { day:"2-digit", month:"2-digit" }) : "" } },
  scheduling: (row.scheduling && Object.keys(row.scheduling).length > 0) ? row.scheduling : { date: row.schedule_date || "", time: row.schedule_time || "" },
  traffic: (row.traffic && Object.keys(row.traffic).length > 0) ? row.traffic : { budget: row.traffic_budget ? `R$ ${Number(row.traffic_budget).toLocaleString("pt-BR")}` : "" },
  ...(row.type === "campaign" ? { campaign: { desc: row.description || "", milestones: [], refs:"", dateStart:"", dateEnd:"", location:"", needs:[], clientTeam:[], budget:"", budgetBreakdown:[] } } : {}),
});

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
    createdBy: "Matheus", notes: row.description || "", client: row.client_name || "",
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
      title: idea.title, description: idea.desc || null, author: idea.author || "Matheus",
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
const TOP = "44px";
const LOGO_B64 = "data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCABjAc8DASIAAhEBAxEB/8QAHAABAAIDAQEBAAAAAAAAAAAAAAYIBQcJBAMB/8QAUxAAAQMCAwQCCgwJCwQDAAAAAQACAwQFBgcRCBIhMUFRExQiNWFydYGxsgkWMjQ3OEJxc3ShsxUYOVJigoWR0RcjMzZVk5XBw8TSJFRW4VNXov/EABsBAQACAwEBAAAAAAAAAAAAAAADBAEFBgIH/8QAMhEBAAEDAgMGBAUFAQAAAAAAAAECAwQFEQYhMRIzQVFxsRNhgcEiMqGy8BUlNXKCkf/aAAwDAQACEQMRAD8At8iIeA1KAijN2vU0kroqR+5EOG+Obv4LHdvVv/eVH94VyWVxhiWbs0UUzVt4xtt9FerJpidoTdFgrDd5JpRS1RBcfcP6T4Cs6t/p+oWdQsxeszy/WJ8ktFcVxvAi+dRNFTwulmeGsbzKjVffamZxbT/zMfg90VX1PWcXTYj4s7zPSI6sXLtNHVKUUI7erf8AvKj+8K+tNdq+BwPbDpB0h53tVoqONMWatqrdUR9EUZVPkmSLw2m5RV7NB3Eo90zX7Qvcusxsm1k24u2qt6ZWKaoqjeBERTsiIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAiIgIiICIiAvhciRbqkjgRE70Ffdee597qn6F/oKgyu4r9J9mKukoVC0PmYw8nOAUuqbXRGjfGyBjSGndcBxB+dROl99ReOPSpxUf0Enin0Lg+Esazes35uUxPSOcfKVTHpiYndBI3mORr2nQtIIU9jdvMa7rAKgCntP73j8QehScEVTvep8Pw/cxZ6oziesM1X2u09xFz8Ll+WO1du6zTFzYWnQac3FY6rdvVczj0vcftUytbBHbqdreXYwf38VV0rGp1jVLt7I5xHPb67RHpEMW6fiXJmoZb6Fjd0UsWnhbqsddbHC+N0tI3scgGu4OTv4Lx3K81bK97YHhscbt0DdB1061nrbUiroo59NC4cR1FdFbuaVqtdzDpo50/KI+W8TCaJt3JmnZDaSZ9LUsmZ7ph10/yU5jeJI2yN5OAIUOvsYius7W8id7941Unsri61U5P5mn7lq+E6q8fKv4dU7xT7xO368kePvFU0vWiKFZzZk2bKzCUeJb5RV9XSvq2Uojo2sdJvOa4g6Pc0adwenqXdraaoq/4G2rsCYvxhasMW+w4lhq7nUspoZJ4YBG1zjoC4iUnT5gVYBARFpHNjaWwZlvjaqwnebLiCqrKZkb3yUkULoyHtDhoXSNPI9SDdyLXGRucOHs3aO6VWH7ddKJltkjjlFcyNpcXhxG7uPd+aeei2OgIiICIvnUzxU1NLU1EjY4YmF8j3Hg1oGpJ8yD6Iqe4l21BBiiSGwYOjrLJFLuiapqnRzTtB90AAQzUcgdfCrP5aYytGP8ABNuxXZHP7UrYydyQd3E8HRzHadIIIQSNERAREQEREBERAREQEREBERARFpP+X+n/ABhP5I/atL2Xtrtf8I9ujd/ouya9j3PN7pBuxERARFpTDGftPe8/qrKduF5YJaeoqYDcDWhzT2Fjna9j3Bz3dPdcNUG60REBERARFrfaeqqqhyExdV0VTNS1EVEHRywyFj2HfbxDhxCDZCLRew3cbhdMioqu519VXVBuVQ0y1MzpH6Dd0GriTot6ICIiAiIgLz3PvdU/Qv8AQV6F57n3uqfoX+gqvl9xX6T7MVdJQyl99ReOPSpxUe95PEPoUHpffUXjj0qcVHveTxD6FxXBvcX/AKe0quN0lAlPaf3vH4g9CgSntP73j8QehR8EfnvelP3YxesoWylnqqt8cEZed469Q49KmdJG6GliicQXMYGkj5l+xxxQMIjY2NvM6DTzrFV1+p4iWU7TM7r5N/8Aa2+FhYmgU1Xsi7+Kr+co6z/OiSimmzzmUdrhpWzg/wDyO9KlOHGltoi16ST9qic8jppnyuADnuLjpy4qYWLvTT+KfSVoeEuzXqN2uOm07f8AsIsf88o9iXvvL8zfQFn8PHW0QfMfSVgcS995PFb6FncOd54f1vWKu6JP99yY/wBv3Q9Wu9qZBV29kG+Aqm8t0/3cysSq7eyDfAVTeW6f7uZd2tqgbNfw94K8rw+supC5b7Nfw94K8rw+supCAucm3H8Yu9fVqX7lq6NrnJtx/GLvX1al+5ag3J7G33gxp9apPUkVt1Uj2NvvBjT61SepItJZ+Zi5g23OnGFBb8c4mo6Snu88cMEF1nZHG0POjWtDtAB1BB0kRc7ZdpDGluyftOErPfbg+9PfPJc7xUzOlqGtdIdyKN79SO50JdzGoA04rTlbiXEdbWmtrL/damqJ1M0tZI95PPXeJ1QddV5bxQw3S01lsqdewVcD4JNDod17S06eYrnnkZtJ41wNeKakxDc6zEGHXPDZ4KuQyzQt14uie7utR+aTodNOHNdDLPcqG8WmkuttqWVNFWQtnp5mHuXscNWkeYoOfGJtlHNi34nkttotdNdrcZCILgyrijYWa8C9rnBzTpzAB8GqutkLgI5a5XWrCktW2rqYA+Wplb7kyvcXODdfkjXQdemq53YjzPzKixDcooswcVsYyrla1rbxUANAedABvroZs419ddMjcJXC51tRW1k9va+aoqJTJJI7U8XOcSSfnQbARVP2ntqCfDt1qsG5dPgfX05MVddXND2wv5GOIHgXDkXHUA8ACeIqHiHGuL8QVjqy94nvFwmc4u3p6x7gCeoa6NHgGgQdbEXLnLDOjMLAF2gqrXiCsqqNjh2W3VkzpaeVo5t3Se54dLdCFIM7M7MUYizCq71hLGOJbVaauCCSOiguc0Tad/YmiRm61wHB4dxA48+lB0mRV42FcQX7EOUl4rb/AHu5Xaqju0kbJq2qfM9rRDGQ0OeSQNSTp4VTS6ZoZlsudUxmYWLGtbM8AC8VAAG8f00HVJFBNnqurbnklhC4XKsqK2sntkT5p55DJJI4jiXOPEnwlS6/vfHYrhJG9zHspZHNc06EENOhBQe1Fyk/lTzN/wDsTFv+M1H/ADXTLKCqqa3KrCtZW1E1TUz2imklmleXvkcYmkuc48SSekoJSiq/tPbTftNudRg/AbaeqvUJLK2vkG/FSP6WMbydIOnXg3loTrpTrE+P8b4mqnVN+xXeK97nb2ktW/caePuWA7reZ4ADmg6youT2E8xsd4Uq2VNgxZd6JzDr2NtU50TvGjcS13nCutst7R0OYtQzCmLY6ehxMGE08sQ3Ya8AanQfJkA47vI8SNOSCxao8fyin7U/2ivCqPH8op+1P9ogvCiIgKkGV35Qe6+Ubl9zIrvqkGV35Qe6+Ubl9zIgu+iLXGGs5sI4gzVuOW1BFdBere6ZszpYGthJiOjtHbxJ8HBBsdEQnQEnoQFrHar+LzjL6h/qMXoykzlwjmdd7tbMORXRk9qa11QauBsbTq4tG6Q468WnqXn2q/i84y+of6jEEP2CPgAh8qVPpat/KsOyNjTDOBNmFl8xVdYbdRNutS1pfqXyO7nuWNHFzvAAvLX7Xr7jWSxYHyxvV9hidxkfIWu0692Nj9OjmelBahFWDDm1/Zo7my3Y8wVeMMyH3UgJmDOPNzHNY/T5gfmVjsN32z4kstPebDcae42+pbvRTwP3mu/gR0g8R0oMiiIgLz3PvdU/Qv8AQV6F57n3uqfoX+gqvl9xX6T7MVdJQyl99ReOPSpxU+95PEPoUHpffUXjj0qcVPveXxD6FxXBvcX/AKe0quN0lAlPaf3vH4g9CgSntP73j8QehR8EfnvelP3YxessBiiucZO04nENA1k06T1LG223VFcT2LdaxvNzuS+Nc8yVkzydSZCftUussQhtkDQNCW7x+c8VVw8f+vapcrvzPYp8PlvtEfeXmmPjXJ3Q+piMNRJCSCWOLdR06KV4bJNoi16C4faovXnerpz1yO9KlGHGltoi16S4/avXClMU6ncinpET7wzj95LB4m77SeK30LO4c7zw/O71isFibvtJ4rfQs7hzvPD+t6xV7RP89k/9fuh6td7UyCrt7IN8BVN5bp/u5lYlV72/4JZshmSRsLmwXinkkP5rS2Ruv73Aedd2tqd7Nfw94K8rw+supC5UZFXOms2cmELnVvDKeC705kceTQXgEnwDXVdV0Bc5NuP4xd6+rUv3LV0bXNbbLudPdNojEj6Z4e2mMNK4jlvsiaHDzHUeZBvL2NvvBjT61SepIq1bRvw8Y28tVHrlWa9jdglbhbGFSWkRSVtPG13W5rHkj/8ATf3qsu0b8PGNvLVR65Qb32Hsl8N4nstVj3FlviujGVRprfRzjehBYAXSPbycdSAAeA0PPhpZXGWTGWeKLFPaazB9npBI0hlRQ0cdPNE7Tg5rmAHUdR1HWCoRsI/F5t/1+q+8W90HI/HeHqjCeNLzhqqfvy2yslpi/TTf3XEB3nGh86v/ALDd2qbps92yKpeXm31dRSRuPPcD99o8wfp8wCpXtN/D9jTypJ/krh7AXwCftep9DEFB8Uf1lun1yb1yr0U2NZ8BbC9pvtFIY7g60x0tG4c2yyvLQ4eFoLnfqqi+KP6y3T65N65VrM3qaefYFwTLECWU81JJLp0NIlZqf1nN/egqlYbXcMQ4gorPb4zPX3CpZTwtJ91I9wA1PzniV0cyi2esvcDYfgp62x2+/wB3cz/q66vp2zb7zzDGvBDGjo0GvWSVRTZwuVDac9cH19yeyOmZc42ue/k0v1Y0nqAc4HVdSkGq8zcg8tsbWKWi9rlvs1cGEU1dbaZkD4ndBIaAHjXmHfZzXODG2HLjhHFt0wzdmBtbbal0Eu77l2h4OHgI0I8BC65rmftf3Ghue0Niiagcx0cUsdO9zTqDJHE1r/3OBHmQWW9j1+Be+eWpfuIlRi799qz6d/rFXn9j1+Be+eWpfuIlRi799qz6d/rFB092aPgDwV5Ji9CmuI/6vXL6pL6hUI2ZHskyBwW5jg4C1Rt1HWNQftCmuKZI4cMXWaV4ZGyimc5x5ABhJKDkKV0fu2MZcB7IFvxJTODayHDlJFSE9E0kbGMPmLt7zLnArzbQFNPUbDVgfC1xbBR2uSXTobutb6XBBSa3wT3m+QU0lVG2etqWsdPUyhrQ57tC97jyGp1JK6LZQWrIzLXD9NQWjFGDpa8Rjtq4y3KmdPO/TujvF2rW89GjgB+9c5LbRVNyuNNb6KPstTUythhZvBu89x0aNToBqSOa2b+LrnT/AOB139/B/wA0Fus98NZJZm4bqo3YrwZQ4gZG51FcorlTskEmnBshDu7YTwIOumuo0K5/26sr7BfoK+hqDT19vqRJDLE8HckY7UEEcDxHMLY34uudP/gdd/fwf80/F1zp/wDA67+/g/5oOi2WuJI8YYAsWJ42hn4SoYqhzB8h7mjeb5najzKiOcNLiyt2y71S4GnfBiKSuaKGRkrYyHdrN17p3Adzvc1cvZusF4wvkjhmw3+kfSXKkgkbPA5wJjJle4AkEjkR0qsJ/KKftT/aIPf7UNsz+3K3/FqX+Ke1DbM/tyt/xal/irpIgpb7UNsz+3K3/FqX+KiOzHT4ipdsiCmxbK6W/RyVzbg90jXl0wp5N4lzeB49IXQBUgyu/KD3XyjcvuZEF31THJT4++Mfprl64VzlTLJT4++Mfprl64QXNX5J/Ru+Yr9X5J/Ru+YoKa+x8/CFj/6OL72Rb92q/i84y+of6jFoH2Pgh2YOPnNIIMURBHT/ADsi39tV/F5xl9Q/1GIKl7JWU8+bFSypxVUVMmDcOyObFSNeWtnqJCHuYCOQ03S4jiRujXqvrY7RarFbYrZZrdS2+ihbuxwU0QjY0fMFpnYXipY9ni1uptN+SsqnTkc9/shHH9UNW80Eex7grDGOrHLZsUWinuFM9pDS9v8AORE/KY/mx3hCqZlNWXfZ82k5MsrlcJanC19lYKZ8nLWThDNpyDt4djfpwPPoCuoqa7fgZFmhl9U0vCu3HDUc9GzsLPtLkFykREBfC5d7qn6F/oK+6/HtD2FjhqHDQqO9R8S3VRHjEwxMbxsglMQKmIngA8elTqVu/E9mum80hQmvpnUlXJA75J4HrHQVILPeIZYWQ1L9yVo03ncnefrXz7hbKtYl27iZE9mZ8/ON4mFPHqimZpqYL8HVnbfa3YXb+vPThp169SmcbdyNrdfcgBOyxbu92RmnXvBYW+XiNsLqekeHvdwc8cmjweFbzGxcLh61cvTc37XSOW/LpEefXqlpppsxM7o9Md6Z5HS4qdUzd2nib1MA+xQ21UjqytZEAd3XV56gpqtfwXYr2u35jlO0R+u/vDzjR1lBKrjUyn9M+lTCyt3bVTj9DX9/FRK4xmKvnjPMPPpUmslZTvtsTTKxro27rg5wHJUuFaqLWoXqbk7TtMc/Xm8Y/Kud2DxL33k+ZvoWew73nh/W9YqN3mVs1zne1wc3e0BHgCkuHwW2iAHqJ+0qxoFcXNbyK6ek9r90PVmd7sy96i+a+EKbHuXd6wlVPbG24UxZHI4aiOUEOjf5nBp8ylCLvltyIxXYLthbEVbYL5SSUdxoZTFNE4ciOkHpBGhB5EEFWdyj2wqqyYdp7NjqxVN3kpIxHFcKSVolkaBoOyNdoC79IEa9I14myOdOS2C81aRhvlNJS3SFu7BcqXRszB+a7UaPb4D5iFWDEmxfjWmnd+AMT2S4w73c9tCSnfp4QA8fagkePttCKexy02CcLVVLcJWlrau4yMLYNflBjdd49WpA6weSqMBc79e9GtqLhc7hUa6AF8s8r3fvLiT9qsdZNjHMGon0u2IMPUEWvF0T5Z3aeAbjR9qshkfs+YJyvmbc4BLeb8G6fhGraAYtRoexMHBmvXqT4dEGX2a8vH5aZT26wVYZ+E5S6ruJadR2d+mrdendaGt16d3Vc/No34eMbeWqj1yupiqJmdslYjxdmHf8T0+LrVTQ3SvlqmQyU8hcwPcSASOGoQbE2Efi82/6/VfeLe615s85fVuWOWlNhOvuFPcJoaiaYzQMLWkPdqBoePBbDQcutpv4fsaeVJP8lcPYC+AT9r1PoYoVmvsnYixnmPfsU02LbVSw3OsdUMhkp5C5gPQSOGq3bs4ZcV2VmXXtXuFyprjN27LU9mgY5rdHho00PHXuUHM/FH9Zbp9cm9croZlfhGkx3sfWXCda4MjuNkEbJCNexyBxcx+n6Lg0+ZaYu2xjiitulXWNxpZ2ied8oaaaThvOJ0+1WsykwvUYKy2sWFaqqiq57ZSiB80TS1ryCTqAePSg5aYuw9eMJYmrcP3ykko7jQymOVh6xycD0gjQg9IIVl8oNsCtsVggs2O7LU3l1NGI4bhSyNEz2gaASNdoHH9IEE9IJ4qyOeGSmD816FhvEUlFdoGbtNc6YDsrBz3XA8Hs16D4dCNVVy/7GOP6arLbLiCwXCmJOj53yQPA6NW7rhr8xQSDMzbLlr7FNb8CYdqbbWTsLDX10jXOg16WMbqC7qJPDqKqRVOqJJ3TVTpHTTHsjnyalzy7jvEnnrz1Vu8tNjOtZdYKzMDEFI6ijcHPobaXOdNp8kyODd0deg16iOa0ttbUdLb8/cQ0FDTxU1JTCnighiaGsjY2njAaAOQAQWd9juGuT14B5fhyT7mJVCz1wjWYIzXxBYKuJ7GMq3y0ziOEkDyXRuHXwOnzgjoVvfY7fgevHlyT7mJbLz3yYwvm1aYo7qZKC60rSKO5QNBkjB47jgfds147uo8BGpQVM2btpiXLTDXtUxDZ6i7WiF7pKOSnkDZqfeOpZo7g5pcSeYI1PPkMxnptW1GNcK1GFcGWOrtcNxYYayqqXtdM5juBjjazUDe5E6k6EgAc14bvsaZkQVZZbb3hytp+iSSaWF3nbuH0raeQ+yfTYRxHTYmxpdaW71lG8S0dFTMPYGSDiHvLhq8g8QNANdDx5IKLHgdCun+FcM0WMtmiz4WuGop7lhungc4DiwmFu68eFrgD5lW5+xTipzy442s2pOvvaVXCwDZZsOYIsmH6idlRNbaCGlfKwENeWMDSQDyB0QcrMcYYveCMXV2HL3TvpbhQTbp04Bw5te09LSNCD4VZrKrbGntWHYLXjyw1V1qqaMMZcKORoknA4DsjHaDe05uB49SsjnRk9g7NW2shv9K+C4QNIpbjTaNniH5up4Obr8l2vg0PFVYxJsX43pql3tfxLY7jT73cmq7JTv048wGvGvLpQZbNLbIqrlZJbbgKwT2qonYWPuFc9rpIdefY2N1G91OJOnUsfsq7RGNIMR23AuIKWuxVSVszYaaVh36ym16S4+7jA4neOrQCddBovnhvYvxtU1DPbBiayW6De7vtUSVD93hyBDBrz6VZ7JXJXBeVdI51kpX1d0lZuz3Kq0dM8dLW6DRjfAPOSg2UqPH8op+1P9orwrQH8gl4/Gb/AJWvw/Qdo9udsdpdhf2XTsPY9N7lrrxQb/REQFSDK78oPdfKNy+5kV31oHCOQt4sm0pWZrS3+gloqiqq5xRtheJQJo3tA3uWo3hr8yDfypSLhDlxt91tVe3tpaC7zODZ5DowNqYhuuJPIdk7kno0PUrrLVW0Hkjh7Ny2QOqp32290bC2kuEbA7Rp49jkbw3ma8eYIOunMghtVay2j8yrflzl1XT9sNN8r4XU1ppWnWSSZw3Q8N57rddSfABzIWlqDKHajw/TNs1hzRoX2yIbkTpayQua3loN+JxaAOgHh0KaZSbOTrTiyPG+ZmJZ8YYjheJKbsr3vhgcDq12r+6eQeXIDq5aBqz2ORj4MYYzpp2OjmZRwNcxw0LSJHggjoIKsPtV/F5xl9Q/1GKO7P8AkndstMwsUYkrb5Q11Neg/scMMTmujJlLxqTz4EhbEzhwpU44yzvmE6SripJ7lT9hZNK0uaw7wOpA49CCoWxHm9RYKqJsF4tnNDZrvN2xbq2bVsUU/uHNLjwDXboGvIOHHnqL0RvZIxskbmvY4Atc06gg9IVf8L7M1hfk1BgPGdTFXVtLVz1NHc6Fpjkp+yacG72uo4cWkaHh0jVQylyI2gMEtNBl9mtDJawSIoaqaSMMb4I3Nka3o9yUFqL1dLbZLVUXW711PQ0NMwyTTzvDGMaOkkqmNmnn2jNq+nvtJTze1HDjo3NkkaQDFE4uYD1Olk1OnPd16lJvxbs18d1kD82c0H1FFG7eNLSSPm0OvyQ4NjaSOndPzFWPy3wLhnL3Dcdgwvb20lI078jid6SZ/S97ubnejkNAgkqIiAiIg8N2t0VfFx0ZK0dy/wDyPgUXrKCrpXESwu0HygNWnzqbIQCNDyXPatw5jajV8Tfs1+cePrCG5Zpr5+KAcV6aO31VW7SKI6fnO4AedS/tOk3t7tePXr3V9wABoOAWkxuCoive/c3jyiPvKKnF85eO1UEVBDut7qR3u3df/pexEXbY9i3j24tWo2pjpC1ERTG0MJiO2yTkVdO3ecBo9o5nwqNkEHQgg+FT9fGWkppX78kEb3dZauW1fhWjMvTfs1dmZ6x4eqvcx+1O8InbLdPWyt0a5sWvdPI4aeBTCKNsUTY2DRrRoAv1rQ1oa0AAcgF+ra6NotrS6Jimd6p6z9o+SS1ai3AiIt0lEREBERAREQEREBERAREQEREBc0tsf4xmKfHg+4jXS1a1xjkRlTi/EVViHEWFBXXOrLTPP2/Ux75DQ0dyyQNHADkEGsvY7fgevHlyT7mJWXUay8wHhTL6zzWjCFpFsoppzUSRCeWXekLQ0nWRzjyaOGunBSVAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERB/9k=";
const THEME_MAP = { "default": "#BBF246", "blue": "#3B82F6", "purple": "#8B5CF6", "pink": "#EC4899", "orange": "#F59E0B", "red": "#EF4444", "cyan": "#06B6D4" };
function getB(isDark, accent) {
  const a = accent || "#BBF246";
  if (isDark) return {
    dark: "#192126", accent: a, muted: "#8B9099", text: "#E8EAED", bg: "#0F1419", bgCard: "#1C2228", bgInput: "#1C2228",
    border: "rgba(255,255,255,0.08)", blue: "#60A5FA", green: "#34D399", red: "#F87171", orange: "#FBBF24", purple: "#A78BFA", yellow: "#FBBF24",
    pink: "#F472B6", cyan: "#22D3EE", textOnAccent: "#192126",
  };
  return {
    dark: "#192126", accent: a, muted: "#8B8F92", text: "#192126", bg: "#F7F7F8", bgCard: "#fff", bgInput: "#fff",
    border: "rgba(11,35,66,0.08)", blue: "#3B82F6", green: "#10B981", red: "#EF4444", orange: "#F59E0B", purple: "#8B5CF6", yellow: "#F59E0B",
    pink: "#EC4899", cyan: "#06B6D4", textOnAccent: "#192126",
  };
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
      caption:{by:"Alice",text:"🏡 Seu novo lar te espera no Parque das Flores!\n\n✅ Área de lazer completa\n✅ Segurança 24h\n✅ Localização privilegiada\n\n📲 Agende sua visita!",hashtags:"#imoveis #petropolis #condominio",date:"23/02"},
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
      caption:{by:"Alice",text:"🍞 Menu especial de sábado chegou!\n\nConfira as delícias que preparamos 😋",hashtags:"#padaria #petropolis",date:"19/02"},
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

/* ═══════════════════════ CHAT DATA ═══════════════════════ */
const CHAT_CONTACTS = [
  ...AGENCY_TEAM.map(t=>({...t,type:"team"})),
  ...CLIENTS_DATA_INIT.map(c=>({id:100+c.id,name:c.name,role:"Cliente · "+c.plan,photo:null,status:c.status==="ativo"?"online":"offline",type:"client"})),
];
const CHAT_GROUPS = [
  {id:"g1",name:"Equipe Geral",members:AGENCY_TEAM.map(t=>t.name),type:"group",lastMsg:"Matheus: Vamos alinhar a pauta de amanhã",time:"10:32",unread:3},
  {id:"g2",name:"Social Media",members:["Alice","Allan","Matheus"],type:"group",lastMsg:"Alice: Criativos do TechSmart prontos",time:"09:15",unread:1},
];
const CHAT_MSGS_INIT = {
  "g1":[
    {id:1,from:"Matheus",text:"Bom dia equipe! Vamos alinhar a pauta de amanhã",time:"10:30",read:true},
    {id:2,from:"Alice",text:"Bom dia! Já estou com os criativos da Casa Nova prontos",time:"10:31",read:true},
    {id:3,from:"Victoria",text:"Oi! O vídeo do reels do TechSmart ficou pronto, vou subir agora",time:"10:32",read:false},
  ],
  "1":[
    {id:1,from:"Alice",text:"Oi Matheus, terminei o briefing do carrossel da Casa Nova",time:"09:00",read:true},
    {id:2,from:"Matheus",text:"Perfeito! Manda pra Victoria começar a arte",time:"09:05",read:true},
  ],
  "101":[
    {id:1,from:"Casa Nova Imóveis",text:"Bom dia! Vi o post do condomínio, ficou ótimo!",time:"14:00",read:true},
    {id:2,from:"me",text:"Que bom que gostou! Tem mais 2 posts pra aprovação essa semana",time:"14:05",read:true},
    {id:3,from:"Casa Nova Imóveis",text:"Perfeito, pode mandar que aprovo rápido",time:"14:10",read:false},
  ],
};

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

function useToast() {
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const ToastEl = toast ? <div style={{ position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)", background: B.dark, color: "#fff", padding: "10px 20px", borderRadius: 14, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)", animation: "toastIn .3s ease", display: "flex", alignItems: "center", gap: 8 }}><span style={{ color: B.accent }}>{IC.check}</span>{toast}</div> : null;
  return { toast, showToast, ToastEl };
}

/* ═══════════════════════ LOGIN / AUTH ═══════════════════════ */
function LoginPage({ onAuth }) {
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

  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !pw.trim()) { setError("Preencha email e senha"); return; }
    /* Try Supabase auth if available */
    if (supabase) {
      setLoginLoading(true); setError("");
      try {
        const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (authErr) { setError(authErr.message === "Invalid login credentials" ? "Email ou senha incorretos" : authErr.message); setLoginLoading(false); return; }
        /* Load profile from DB */
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
        const userObj = {
          id: data.user.id, name: profile?.name || data.user.user_metadata?.name || email.split("@")[0],
          email, role: profile?.role === "admin" ? "CEO" : profile?.role === "member" ? (profile?.nick || "Colaborador") : "Cliente",
          supaRole: profile?.role || "member", photo: profile?.photo_url || TEAM_PHOTOS.matheus,
          nick: profile?.nick || profile?.name || email.split("@")[0],
          phone: profile?.phone || "", cpf: "", birth: "", social: "", blood: "", remember,
        };
        setLoginLoading(false); onAuth(userObj);
      } catch (e) { setError("Erro de conexão"); setLoginLoading(false); }
      return;
    }
    /* Fallback: mock login */
    if (!emailValid) { setError("Use um e-mail @uniquemkt.com.br"); return; }
    if (!pwStrong(pw)) { setError("Senha não atende os critérios"); return; }
    const member = AGENCY_TEAM.find(m => m.name.toLowerCase() === emailLocal.toLowerCase());
    const defaultPhoto = TEAM_PHOTOS.matheus;
    onAuth({ name: member?.name || emailLocal, email, role: member?.role || "Colaborador", photo: member?.photo || defaultPhoto, phone: member?.phone || "", nick: member?.name || emailLocal, cpf: "", birth: "", social: "", blood: "", remember });
  };

  const [regSuccess, setRegSuccess] = useState("");
  const handleRegister = async () => {
    if (supabase) {
      setLoginLoading(true); setError(""); setRegSuccess("");
      try {
        const { data, error: authErr } = await supabase.auth.signUp({
          email: rEmail, password: rPw,
          options: { data: { name: rName, nick: rNick, phone: rPhone, role: "member", job_title: rCargo } }
        });
        if (authErr) { setError(authErr.message); setLoginLoading(false); return; }
        setLoginLoading(false);
        setRegSuccess("Conta criada! Verifique seu email para confirmar.");
        setMode("login"); setStep(1);
      } catch (e) { setError("Erro de conexão"); setLoginLoading(false); }
      return;
    }
    /* Fallback mock */
    onAuth({ name: rName, nick: rNick, email: rEmail, role: rCargo, photo: null, phone: rPhone, cpf: rCpf, birth: rBirth, social: rSocial, blood: rBlood, remember: false });
  };

  const nextStep = () => {
    setError("");
    if (step === 1 && !step1Valid) { setError("Preencha todos os campos corretamente"); return; }
    if (step === 2 && !step2Valid) { setError("Preencha telefone e e-mail válido"); return; }
    if (step === 3 && !step3Valid) { setError("Selecione seu cargo"); return; }
    if (step === 4) { if (!step4Valid) { setError("Verifique a senha"); return; } handleRegister(); return; }
    setStep(s => s + 1);
  };

  const stepLabels = ["Dados","Contato","Função","Segurança"];
  const stepValid = [step1Valid, step2Valid, step3Valid, step4Valid];

  /* ── PENDING SCREEN ── */
  if (mode === "pending") return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
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
      <img src={LOGO_B64} alt="UniqueHub" style={{ height: 56, objectFit: "contain", marginBottom: 8 }} />
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
    <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "40px 24px 32px", minHeight: "100vh", overflowY: "auto" }}>
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

        <p style={{ fontSize: 11, color: B.muted, marginTop: 16, textAlign: "center" }}>Unique Marketing 360 — Agency Panel v1.0</p>
      </div>
    </div>
  );

  /* ── LOGIN MODE ── */
  return (
    <div className="screen" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", minHeight: "100vh" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: 340 }}>
        {logoJSX(32)}

        <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.04)", borderRadius: 12, padding: 3, width: "100%", marginBottom: 20 }}>
          {["login", "register"].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(""); }} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", background: mode === m ? "#fff" : "transparent", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: mode === m ? B.dark : B.muted, boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>
              {m === "login" ? "Entrar" : "Cadastrar"}
            </button>
          ))}
        </div>

        <label style={{ fontSize: 12, fontWeight: 600, alignSelf: "flex-start", marginBottom: 6 }}>E-mail corporativo</label>
        <div style={{ position: "relative", width: "100%", marginBottom: 4 }}>
          <input value={email} onChange={e => supabase ? setEmail(e.target.value) : handleEmailField(e.target.value, setEmail)} placeholder={supabase ? "seu@email.com" : `seu.nome${emailDomain}`} className="tinput" style={{ paddingRight: 14 }} />
        </div>
        {email && !emailValid && <p style={{ fontSize: 11, color: B.red, alignSelf: "flex-start", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "flex" }}>{IC.x}</span> Apenas e-mails @uniquemkt.com.br</p>}
        {email && emailValid && <p style={{ fontSize: 11, color: B.green, alignSelf: "flex-start", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><span style={{ display: "flex" }}>{IC.check}</span> E-mail válido</p>}

        <label style={{ fontSize: 12, fontWeight: 600, alignSelf: "flex-start", marginBottom: 6, marginTop: 8 }}>Senha</label>
        <div style={{ position: "relative", width: "100%" }}>
          <input value={pw} onChange={e => setPw(e.target.value)} onFocus={() => setPwFocus(true)} onBlur={() => setTimeout(() => setPwFocus(false), 200)} type={showPw ? "text" : "password"} placeholder="Sua senha segura" className="tinput" style={{ paddingRight: 44 }} />
          <button onClick={() => setShowPw(!showPw)} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: B.muted, display: "flex", padding: 6 }}>{showPw ? IC.eyeOff : IC.eye}</button>
        </div>

        {(pwFocus || pw.length > 0) && <div style={{ width: "100%", marginTop: 8, padding: "10px 12px", background: "rgba(0,0,0,0.02)", borderRadius: 12, border: `1px solid ${B.border}` }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: B.muted, marginBottom: 6 }}>Critérios de segurança:</p>
          {pwChecks(pw).map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: i ? 3 : 0 }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: c.ok ? B.green : "rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                {c.ok && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </div>
              <span style={{ fontSize: 11, color: c.ok ? B.green : B.muted }}>{c.label}</span>
            </div>
          ))}
        </div>}

        {error && <p style={{ fontSize: 12, color: B.red, marginTop: 10, textAlign: "center" }}>{error}</p>}
        {regSuccess && <p style={{ fontSize: 12, color: B.green, marginTop: 10, textAlign: "center" }}>{regSuccess}</p>}

        <div onClick={() => setRemember(!remember)} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, cursor: "pointer", padding: "8px 0" }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${remember ? B.accent : B.border}`, background: remember ? B.accent : B.bgCard, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", flexShrink: 0 }}>
            {remember && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#192126" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: B.muted }}>Lembrar meu acesso</span>
        </div>

        <button onClick={handleLogin} disabled={loginLoading} className="pill full accent" style={{ marginTop: 8, opacity: loginLoading ? 0.6 : (supabase ? (email.includes("@") && pw.length >= 6 ? 1 : 0.4) : ((emailValid && pwStrong(pw)) ? 1 : 0.4)) }}>
          {loginLoading ? "Entrando..." : <>Entrar {IC.arrowR()}</>}
        </button>

        <p style={{ fontSize: 11, color: B.muted, marginTop: 20, textAlign: "center" }}>Unique Marketing 360 — Agency Panel v1.0</p>
      </div>
    </div>
  );
}

/* ═══════════════════════ HOME / DASHBOARD ═══════════════════════ */
function HomePage({ user, goSub, goTab, clients }) {
  const CDATA = (clients && clients.length > 0) ? clients : [];
  const totalClients = CDATA.length;
  const activeClients = CDATA.filter(c => c.status === "ativo").length;
  const totalRevNum = CDATA.reduce((a, c) => a + parseBRL(c.monthly), 0);
  const totalRevenue = `R$ ${totalRevNum.toLocaleString("pt-BR")}`;
  const pendingApprovals = CDATA.reduce((a, c) => a + (c.pending||0), 0);
  const avgScore = Math.round(CDATA.reduce((a, c) => a + (c.score||0), 0) / (totalClients||1));
  const today = new Date();
  const hours = today.getHours();
  const greeting = hours < 12 ? "Bom dia" : hours < 18 ? "Boa tarde" : "Boa noite";

  const DEFAULT_ORDER = ["summary","shortcuts","team","clients","financial"];
  const [blockOrder, setBlockOrder] = useState(DEFAULT_ORDER);
  const [editing, setEditing] = useState(false);

  const moveBlock = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= blockOrder.length) return;
    setBlockOrder(prev => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  };

  const EditHandle = ({ i }) => editing ? (
    <div style={{ display:"flex", gap:3, marginBottom:6 }}>
      <button disabled={i===0} onClick={(e)=>{e.stopPropagation();moveBlock(i,-1);}} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${B.border}`, background:i===0?"transparent":`${B.accent}08`, cursor:i===0?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", opacity:i===0?.3:1 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg></button>
      <button disabled={i===blockOrder.length-1} onClick={(e)=>{e.stopPropagation();moveBlock(i,1);}} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${B.border}`, background:i===blockOrder.length-1?"transparent":`${B.accent}08`, cursor:i===blockOrder.length-1?"default":"pointer", display:"flex", alignItems:"center", justifyContent:"center", opacity:i===blockOrder.length-1?.3:1 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg></button>
    </div>
  ) : null;

  /* ── Today's tasks for activity feed ── */
  const todayTasks = [
    { action: "Review carrossel Casa Nova", time: "09:00", icon: "📋", color: B.orange },
    { action: "Publicar stories Bella", time: "10:00", icon: "📱", color: B.purple },
    { action: "Reunião TechSmart", time: "14:00", icon: "📹", color: B.blue },
    { action: "Entregar reels Studio", time: "17:00", icon: "🎬", color: B.green },
  ];

  const BLOCKS = {
    summary: (i) => (
      <div key="summary">
        <EditHandle i={i} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8 }}>
          {[
            { label:"Receita", value:totalRevenue, sub:"+12% vs mês ant.", color:B.green, icon:"💰" },
            { label:"Clientes", value:totalClients, sub:`${activeClients} ativos`, color:B.accent, icon:"👥" },
            { label:"Pendentes", value:pendingApprovals, sub:"aguardando ação", color:B.orange, icon:"⏳" },
            { label:"Score", value:avgScore, sub:"satisfação média", color:B.purple, icon:"⭐" },
          ].map((s, j) => (
            <Card key={j} delay={j*0.04} style={{ padding:"14px 16px", position:"relative", overflow:"hidden" }}>
              <div style={{ position:"absolute", top:10, right:10, fontSize:20, opacity:0.12 }}>{s.icon}</div>
              <p style={{ fontSize:9, color:B.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:1 }}>{s.label}</p>
              <p style={{ fontSize:22, fontWeight:900, color:s.color, marginTop:4 }}>{s.value}</p>
              <p style={{ fontSize:10, color:B.muted, marginTop:2 }}>{s.sub}</p>
            </Card>
          ))}
        </div>
      </div>
    ),
    pipeline: (i) => (
      <div key="pipeline">
        <EditHandle i={i} />
        <Card style={{ background:B.dark, color:"#fff", border:editing?`2px dashed ${B.accent}`:"none", padding:0, overflow:"hidden" }}>
          <div style={{ padding:"16px 18px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ color:B.accent, display:"flex" }}>{IC.content(B.accent)}</span>
              <p style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.6)", letterSpacing:1.5, textTransform:"uppercase" }}>Pipeline</p>
            </div>
            <button onClick={() => goTab("content")} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:600, color:B.accent }}>Ver tudo →</button>
          </div>
          <div style={{ display:"flex", justifyContent:"space-around", padding:"0 12px 16px" }}>
            {[
              { l:"Criação", k:["idea","briefing","design","caption","planning","creation"], c:B.blue },
              { l:"Revisão", k:["review"], c:B.orange },
              { l:"Cliente", k:["client","execution"], c:B.purple },
              { l:"Publicado", k:["published","completed"], c:B.green },
            ].map((p,j) => {
              const count = DEMANDS_INIT.filter(d => p.k.includes(d.stage)).length;
              return (
                <div key={j} style={{ textAlign:"center", flex:1 }}>
                  <div style={{ width:38, height:38, borderRadius:12, background:`${p.c}20`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 6px" }}>
                    <span style={{ fontSize:16, fontWeight:900, color:p.c }}>{count}</span>
                  </div>
                  <p style={{ fontSize:9, color:"rgba(255,255,255,0.5)", fontWeight:600 }}>{p.l}</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    ),
    activity: (i) => (
      <div key="activity">
        <EditHandle i={i} />
        <div style={{ border:editing?`2px dashed ${B.accent}40`:"none", borderRadius:16, padding:editing?4:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <p className="sl">Agenda de hoje</p>
            <button onClick={() => goSub("calendar")} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:600, color:B.accent }}>Calendário →</button>
          </div>
          <Card>
            {todayTasks.map((t, j) => (
              <div key={j} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderTop:j?`1px solid ${B.border}`:"none" }}>
                <div style={{ width:36, height:36, borderRadius:10, background:`${t.color}10`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{t.icon}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.action}</p>
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:B.muted, fontVariantNumeric:"tabular-nums" }}>{t.time}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    ),
    shortcuts: (i) => (
      <div key="shortcuts">
        <EditHandle i={i} />
        <div style={{ border:editing?`2px dashed ${B.accent}40`:"none", borderRadius:16, padding:editing?4:0 }}>
          <p className="sl" style={{ marginBottom:8 }}>Acesso rápido</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
            {[
              { k:"checkin", l:"Check-in", icon:"📍", c:B.green },
              { k:"clients", l:"Clientes", icon:"👥", c:B.blue },
              { k:"content", l:"Conteúdo", icon:"📋", c:B.orange },
              { k:"ai", l:"IA", icon:"🤖", c:B.purple },
              { k:"calendar", l:"Agenda", icon:"📅", c:B.accent },
              { k:"gamify", l:"Ranking", icon:"🏆", c:"#F59E0B" },
              { k:"financial", l:"Financeiro", icon:"💰", c:B.green },
              { k:"reports", l:"Relatórios", icon:"📊", c:B.red },
            ].map((s,j) => (
              <Card key={j} delay={j*0.03} onClick={() => ["home","content","chat"].includes(s.k) ? goTab(s.k) : goSub(s.k)} style={{ cursor:"pointer", padding:12, textAlign:"center" }}>
                <span style={{ fontSize:22, display:"block", marginBottom:4 }}>{s.icon}</span>
                <p style={{ fontSize:9, fontWeight:700, color:B.text }}>{s.l}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    ),
    team: (i) => (
      <div key="team">
        <EditHandle i={i} />
        <div style={{ border:editing?`2px dashed ${B.accent}40`:"none", borderRadius:16, padding:editing?4:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <p className="sl">Equipe</p>
            <button onClick={() => goSub("team")} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:600, color:B.accent }}>Ver todos →</button>
          </div>
          <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4 }} className="hscroll">
            {AGENCY_TEAM.map((m, j) => (
              <Card key={m.id} delay={j*0.04} style={{ minWidth:110, flex:"0 0 auto", textAlign:"center", padding:"16px 12px" }}>
                <div style={{ position:"relative", display:"inline-block", marginBottom:8 }}>
                  <Av src={m.photo} name={m.name} sz={44} fs={16} />
                  <div style={{ position:"absolute", bottom:0, right:-2, width:12, height:12, borderRadius:6, background:m.status==="online"?B.green:B.muted, border:`2.5px solid ${B.bgCard}` }} />
                </div>
                <p style={{ fontSize:12, fontWeight:700 }}>{m.name}</p>
                <p style={{ fontSize:9, color:B.muted, marginTop:2 }}>{m.role}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    ),
    clients: (i) => (
      <div key="clients">
        <EditHandle i={i} />
        <div style={{ border:editing?`2px dashed ${B.accent}40`:"none", borderRadius:16, padding:editing?4:0 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
            <p className="sl">Clientes</p>
            <button onClick={() => goSub("clients")} style={{ background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:10, fontWeight:600, color:B.accent }}>Ver todos →</button>
          </div>
          {CDATA.slice(0, 4).map((c, j) => (
            <Card key={c.id} delay={0.04 + j * 0.03} onClick={() => goSub("clients")} style={{ marginTop:j?6:0, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <Av name={c.name} sz={38} fs={14} />
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</p>
                  <div style={{ display:"flex", gap:4, marginTop:3 }}>
                    <Tag color={B.accent}>{c.plan}</Tag>
                    {c.pending > 0 && <Tag color={B.orange}>{c.pending} pendente{c.pending > 1 ? "s" : ""}</Tag>}
                  </div>
                </div>
                <p style={{ fontSize:13, fontWeight:700 }}>{c.monthly}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    ),
    financial: (i) => (
      <div key="financial">
        <EditHandle i={i} />
        <div style={{ border:editing?`2px dashed ${B.accent}40`:"none", borderRadius:16, padding:editing?4:0 }}>
          <p className="sl" style={{ marginBottom:8 }}>Financeiro</p>
          <Card delay={0.3} onClick={() => goSub("financial")} style={{ cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
              <div style={{ width:38, height:38, borderRadius:12, background:`${B.green}12`, display:"flex", alignItems:"center", justifyContent:"center", color:B.green }}>{IC.dollar}</div>
              <div style={{ flex:1 }}><p style={{ fontSize:14, fontWeight:700 }}>Faturamento Mensal</p><p style={{ fontSize:10, color:B.muted }}>Março 2026</p></div>
              {IC.chev()}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
              <div style={{ padding:8, background:`${B.green}06`, borderRadius:10, textAlign:"center" }}>
                <p style={{ fontSize:14, fontWeight:800, color:B.green }}>R$ 18.4k</p>
                <p style={{ fontSize:9, color:B.muted }}>Receita</p>
              </div>
              <div style={{ padding:8, background:`${B.blue}06`, borderRadius:10, textAlign:"center" }}>
                <p style={{ fontSize:14, fontWeight:800, color:B.blue }}>7</p>
                <p style={{ fontSize:9, color:B.muted }}>Pagantes</p>
              </div>
              <div style={{ padding:8, background:`${B.accent}06`, borderRadius:10, textAlign:"center" }}>
                <p style={{ fontSize:14, fontWeight:800, color:B.accent }}>R$ 2.6k</p>
                <p style={{ fontSize:9, color:B.muted }}>Ticket</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    ),
  };

  const DEFAULT_ORDER2 = ["summary","pipeline","activity","shortcuts","team","clients","financial"];
  React.useEffect(() => { if (blockOrder.length < 7) setBlockOrder(DEFAULT_ORDER2); }, []);

  return (
    <div className="pg" style={{ paddingTop: "52px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Av src={user?.photo} name={user?.name} sz={48} fs={18} />
          <div>
            <p style={{ fontSize: 12, color: B.muted }}>{greeting},</p>
            <h2 style={{ fontSize: 18, fontWeight: 800 }}>{user?.nick || user?.name || "Usuário"}</h2>
            <p style={{ fontSize: 11, color: B.accent, fontWeight: 600, marginTop: 1 }}>{user?.role || "Colaborador"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => goSub("notifs")} className="ib" style={{ position: "relative" }}>{IC.bell}<Badge n={5} style={{ position: "absolute", top: -4, right: -4 }} /></button>
          <button onClick={() => goSub("settings")} className="ib">{IC.settings("currentColor")}</button>
        </div>
      </div>

      {/* Dynamic date */}
      {(() => {
        const diasSemana = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
        const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
        const d = new Date();
        return (
          <p style={{ fontSize: 13, color: B.muted, marginBottom: 12, fontWeight: 500 }}>
            Hoje é <span style={{ fontWeight: 700, color: B.text }}>{diasSemana[d.getDay()]}</span>, <span style={{ fontWeight: 700, color: B.text }}>{d.getDate()}</span> de <span style={{ fontWeight: 700, color: B.text }}>{meses[d.getMonth()]}</span> de <span style={{ fontWeight: 700, color: B.text }}>{d.getFullYear()}</span>.
          </p>
        );
      })()}

      {/* Edit dashboard toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button onClick={() => setEditing(!editing)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 8, background: editing ? B.accent : `${B.muted}10`, border: editing ? `1.5px solid ${B.accent}` : `1.5px solid ${B.border}`, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: editing ? B.dark : B.muted }}>
          {editing ? <>{IC.check} Pronto</> : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Organizar</>}
        </button>
      </div>

      {/* Render blocks in order */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {blockOrder.map((key, i) => BLOCKS[key] ? BLOCKS[key](i) : null)}
      </div>
    </div>
  );
}


/* ═══════════════════════ CHECK-IN SYSTEM ═══════════════════════ */
function CheckinPage({ onBack, user }) {
  const [checkedIn, setCheckedIn] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [history, setHistory] = useState([
    { date: "25/02", start: "08:32", end: "17:45", total: "9h 13m" },
    { date: "24/02", start: "08:15", end: "18:02", total: "9h 47m" },
    { date: "21/02", start: "09:00", end: "17:30", total: "8h 30m" },
    { date: "20/02", start: "08:45", end: "18:15", total: "9h 30m" },
    { date: "19/02", start: "08:20", end: "17:50", total: "9h 30m" },
  ]);

  useEffect(() => {
    let interval;
    if (checkedIn && startTime) {
      interval = setInterval(() => { setElapsed(Math.floor((Date.now() - startTime) / 1000)); }, 1000);
    }
    return () => clearInterval(interval);
  }, [checkedIn, startTime]);

  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const handleCheckin = () => { setCheckedIn(true); setStartTime(Date.now()); setElapsed(0); };
  const handleCheckout = () => {
    const now = new Date();
    const startD = new Date(startTime);
    const totalH = Math.floor(elapsed / 3600);
    const totalM = Math.floor((elapsed % 3600) / 60);
    setHistory(prev => [{ date: `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`, start: `${String(startD.getHours()).padStart(2, "0")}:${String(startD.getMinutes()).padStart(2, "0")}`, end: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, total: `${totalH}h ${totalM}m` }, ...prev]);
    setCheckedIn(false); setStartTime(null); setElapsed(0);
  };

  return (
    <div className="pg">
      <Head title="Check-in" onBack={onBack} />
      <Card style={{ background: B.dark, color: "#fff", border: "none", textAlign: "center", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 8 }}>
          <span style={{ color: B.accent, display: "flex" }}>{IC.clock}</span>
          <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase" }}>PONTO DIGITAL</p>
        </div>
        {checkedIn ? (<>
          <p style={{ fontSize: 44, fontWeight: 900, color: B.accent, fontVariantNumeric: "tabular-nums", letterSpacing: 2 }}>{formatTime(elapsed)}</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Jornada em andamento</p>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: B.green, margin: "10px auto 0", animation: "skPulse 1.5s ease infinite" }} />
        </>) : (<>
          <p style={{ fontSize: 44, fontWeight: 900, color: "rgba(255,255,255,0.15)", fontVariantNumeric: "tabular-nums" }}>00:00:00</p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Aguardando check-in</p>
        </>)}
      </Card>
      <button onClick={checkedIn ? handleCheckout : handleCheckin} style={{ width: "100%", padding: 16, marginTop: 12, borderRadius: 16, border: "none", background: checkedIn ? `${B.red}12` : B.accent, color: checkedIn ? B.red : B.dark, fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, transition: "all .2s" }}>
        <span style={{ display: "flex" }}>{checkedIn ? IC.pause : IC.play}</span>
        {checkedIn ? "Encerrar Jornada" : "Iniciar Jornada"}
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 14 }}>
        <Card delay={0.06}><p style={{ fontSize: 9, color: B.muted, textTransform: "uppercase", letterSpacing: 1 }}>Esta semana</p><p style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>37h 30m</p></Card>
        <Card delay={0.08}><p style={{ fontSize: 9, color: B.muted, textTransform: "uppercase", letterSpacing: 1 }}>Este mês</p><p style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>162h 15m</p></Card>
      </div>
      <p className="sl" style={{ marginTop: 16, marginBottom: 8 }}>Histórico</p>
      {history.map((h, i) => (
        <Card key={i} delay={0.1 + i * 0.03} style={{ marginTop: i ? 6 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${B.accent}10`, display: "flex", alignItems: "center", justifyContent: "center", color: B.accent, fontSize: 11, fontWeight: 800 }}>{h.date.split("/")[0]}</div>
            <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 600 }}>{h.date}</p><p style={{ fontSize: 11, color: B.muted }}>{h.start} — {h.end}</p></div>
            <Tag color={B.green}>{h.total}</Tag>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════ CLIENTS PAGE ═══════════════════════ */
const SOCIAL_PLATFORMS = [
  { key:"instagram", name:"Instagram", icon:"instagram", c:"#E1306C", urlBase:"instagram.com/" },
  { key:"facebook", name:"Facebook", icon:"facebook", c:"#1877F2", urlBase:"facebook.com/" },
  { key:"tiktok", name:"TikTok", icon:"tiktok", c:"#010101", urlBase:"tiktok.com/@" },
  { key:"linkedin", name:"LinkedIn", icon:"linkedin", c:"#0A66C2", urlBase:"linkedin.com/company/" },
  { key:"youtube", name:"YouTube", icon:"youtube", c:"#FF0000", urlBase:"youtube.com/@" },
  { key:"twitter", name:"X (Twitter)", icon:"twitter", c:"#1D9BF0", urlBase:"x.com/" },
  { key:"google", name:"Google Meu Negócio", icon:null, c:"#4285F4", urlBase:"business.google.com" },
  { key:"pinterest", name:"Pinterest", icon:null, c:"#E60023", urlBase:"pinterest.com/" },
];

function ClientsPage({ onBack, onNavigate, clients: propClients, setClients: propSetClients }) {
  const [localClients, localSetClients] = useState(CLIENTS_DATA_INIT);
  const clients = propClients || localClients;
  const setClients = propSetClients || localSetClients;
  const [filter, setFilter] = useState("all");

  const [sel, setSel] = useState(null);
  const [profileTab, setProfileTab] = useState("info");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({});
  const [editingSocial, setEditingSocial] = useState(null);
  const [socialForm, setSocialForm] = useState({});
  const [search, setSearch] = useState("");
  const [libCat, setLibCat] = useState("all");
  const [addingFile, setAddingFile] = useState(false);
  const [fileForm, setFileForm] = useState({});
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const { showToast, ToastEl } = useToast();
  const filtered = clients.filter(c => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const saveClient = async () => {
    if (!form.name?.trim()) return showToast("Informe o nome da empresa");
    const nc = {
      id: Date.now(), name: form.name.trim(), plan: form.plan || "Traction", status: form.status || "trial",
      monthly: form.monthly || "R$ 0", pending: 0, score: 0,
      contact: form.contact || "", phone: form.phone || "", email: form.email || "",
      cnpj: form.cnpj || "", address: form.address || "", segment: form.segment || "", since: new Date().toLocaleDateString("pt-BR",{month:"2-digit",year:"numeric"}),
      socials: { instagram:{connected:false}, facebook:{connected:false}, google:{connected:false}, tiktok:{connected:false}, linkedin:{connected:false}, youtube:{connected:false}, twitter:{connected:false}, pinterest:{connected:false} },
    };
    /* Save to Supabase */
    const result = await supaCreateClient(nc);
    if (result?.data) { nc.id = result.data.id; nc.supaId = result.data.id; }
    else if (supabase) { showToast("Erro: " + (result?.err || "desconhecido")); }
    setClients(p => [...p, nc]);
    setCreating(false); setForm({}); 
    if (result?.data) showToast("Cliente cadastrado! ✓");
    else if (!supabase) showToast("Cliente cadastrado! ✓");
  };

  const updateClient = (id, data) => {
    setClients(p => p.map(c => c.id === id ? { ...c, ...data } : c));
    if (sel?.id === id) setSel(p => ({ ...p, ...data }));
    /* Sync to Supabase */
    const client = clients.find(c => c.id === id);
    if (client?.supaId) supaUpdateClient(client.supaId, data);
  };

  const connectSocial = (platformKey) => {
    if (!sel) return;
    const current = sel.socials?.[platformKey] || {};
    if (current.connected) {
      /* Disconnect */
      const ns = { ...sel.socials, [platformKey]: { connected: false } };
      updateClient(sel.id, { socials: ns });
      showToast("Desconectado");
    } else {
      setEditingSocial(platformKey);
      setSocialForm({ user: current.user || "", followers: current.followers || "", reviews: current.reviews || "" });
    }
  };

  const saveSocial = () => {
    if (!editingSocial || !sel) return;
    const ns = { ...sel.socials, [editingSocial]: { connected: true, user: socialForm.user || "", followers: socialForm.followers || "", reviews: socialForm.reviews || "" } };
    updateClient(sel.id, { socials: ns });
    setEditingSocial(null); setSocialForm({});
    showToast("Rede conectada! ✓");
  };

  const GoogleIcon = ({sz=18}) => <svg width={sz} height={sz} viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>;
  const PinterestIcon = ({sz=18}) => <svg width={sz} height={sz} viewBox="0 0 24 24" fill="#E60023"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.15 9.42 7.6 11.18-.1-.95-.2-2.42.04-3.46.22-.94 1.4-5.95 1.4-5.95s-.36-.72-.36-1.78c0-1.66.97-2.9 2.17-2.9 1.02 0 1.52.77 1.52 1.7 0 1.03-.66 2.58-1 4.01-.28 1.2.6 2.18 1.78 2.18 2.13 0 3.77-2.25 3.77-5.5 0-2.87-2.06-4.88-5.01-4.88-3.41 0-5.42 2.56-5.42 5.21 0 1.03.4 2.14.89 2.74.1.12.11.22.08.34-.09.37-.29 1.2-.33 1.36-.05.22-.18.26-.4.16-1.5-.7-2.43-2.88-2.43-4.64 0-3.78 2.75-7.25 7.92-7.25 4.16 0 7.4 2.97 7.4 6.93 0 4.14-2.61 7.46-6.23 7.46-1.22 0-2.36-.63-2.75-1.38l-.75 2.85c-.27 1.04-1 2.35-1.49 3.15C9.57 23.81 10.76 24 12 24c6.63 0 12-5.37 12-12S18.63 0 12 0z"/></svg>;

  /* ── SOCIAL CONNECTION MODAL ── */
  if (editingSocial) {
    const plat = SOCIAL_PLATFORMS.find(p => p.key === editingSocial);
    return (
      <div className="pg">
        {ToastEl}
        <Head title={`Conectar ${plat.name}`} onBack={() => setEditingSocial(null)} />
        <Card style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ width:56, height:56, borderRadius:16, background:`${plat.c}12`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
            {plat.icon ? <NetworkIcon name={plat.name.split(" ")[0]} sz={28} active /> : plat.key === "google" ? <GoogleIcon sz={28} /> : <PinterestIcon sz={28} />}
          </div>
          <p style={{ fontSize:16, fontWeight:700 }}>Conectar {plat.name}</p>
          <p style={{ fontSize:12, color:B.muted, marginTop:4 }}>Vincule o perfil de <strong>{sel?.name}</strong></p>
        </Card>
        <Card>
          <label className="sl" style={{ display:"block", marginBottom:6 }}>@ Usuário / Perfil</label>
          <input value={socialForm.user||""} onChange={e=>setSocialForm(p=>({...p,user:e.target.value}))} placeholder={`Ex: ${plat.urlBase}nome`} className="tinput" style={{ marginBottom:12 }} />
          {plat.key === "google" ? <>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Nota média (avaliações)</label>
            <input value={socialForm.reviews||""} onChange={e=>setSocialForm(p=>({...p,reviews:e.target.value}))} placeholder="Ex: 4.7★" className="tinput" />
          </> : <>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Seguidores</label>
            <input value={socialForm.followers||""} onChange={e=>setSocialForm(p=>({...p,followers:e.target.value}))} placeholder="Ex: 12.4k" className="tinput" />
          </>}
        </Card>
        <button onClick={saveSocial} className="pill full accent" style={{ marginTop:16, padding:"14px 0" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          &nbsp; Conectar {plat.name}
        </button>
      </div>
    );
  }

  /* ── ADD CLIENT FORM ── */
  if (creating) return (
    <div className="pg">
      {ToastEl}
      <Head title="Novo Cliente" onBack={() => { setCreating(false); setForm({}); }} />

      <p className="sl" style={{ marginBottom:6 }}>Dados da empresa</p>
      <Card>
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Nome da empresa *</label>
        <input value={form.name||""} onChange={e=>f("name",e.target.value)} placeholder="Ex: Casa Nova Imóveis" className="tinput" style={{ marginBottom:10 }} />
        <label className="sl" style={{ display:"block", marginBottom:4 }}>CNPJ</label>
        <input value={form.cnpj||""} onChange={e=>f("cnpj",e.target.value)} placeholder="00.000.000/0001-00" className="tinput" style={{ marginBottom:10 }} />
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Segmento</label>
        <input value={form.segment||""} onChange={e=>f("segment",e.target.value)} placeholder="Ex: Imobiliário, Estética, Tecnologia..." className="tinput" style={{ marginBottom:10 }} />
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Endereço</label>
        <input value={form.address||""} onChange={e=>f("address",e.target.value)} placeholder="Rua, número - Cidade/UF" className="tinput" />
      </Card>

      <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Contato principal</p>
      <Card>
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Nome do contato</label>
        <input value={form.contact||""} onChange={e=>f("contact",e.target.value)} placeholder="Ex: Roberto Silva" className="tinput" style={{ marginBottom:10 }} />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <div>
            <label className="sl" style={{ display:"block", marginBottom:4 }}>Telefone</label>
            <input value={form.phone||""} onChange={e=>f("phone",e.target.value)} placeholder="(24) 99999-9999" className="tinput" />
          </div>
          <div>
            <label className="sl" style={{ display:"block", marginBottom:4 }}>E-mail</label>
            <input value={form.email||""} onChange={e=>f("email",e.target.value)} placeholder="email@empresa.com" className="tinput" />
          </div>
        </div>
      </Card>

      <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Plano e valor</p>
      <Card>
        <label className="sl" style={{ display:"block", marginBottom:6 }}>Plano</label>
        <div style={{ display:"flex", gap:6, marginBottom:10 }}>
          {["Traction","Growth 360","Partner"].map(p=>(
            <button key={p} onClick={()=>{f("plan",p);f("monthly",PLAN_VALUES[p]);}} className={`htab${form.plan===p?" a":""}`} style={{ flex:1 }}>{p}<span style={{display:"block",fontSize:9,opacity:0.6,marginTop:2}}>{PLAN_VALUES[p]}</span></button>
          ))}
        </div>
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Valor mensal</label>
        <input value={form.monthly||""} onChange={e=>f("monthly",e.target.value)} placeholder="R$ 2.500" className="tinput" style={{ marginBottom:10 }} />
        <label className="sl" style={{ display:"block", marginBottom:6 }}>Status</label>
        <div style={{ display:"flex", gap:6 }}>
          {[{k:"ativo",l:"Ativo"},{k:"trial",l:"Trial"}].map(s=>(
            <button key={s.k} onClick={()=>f("status",s.k)} className={`htab${form.status===s.k?" a":""}`} style={{ flex:1 }}>{s.l}</button>
          ))}
        </div>
      </Card>

      <button onClick={saveClient} className="pill full accent" style={{ marginTop:20, padding:"14px 0" }}>Cadastrar Cliente</button>
    </div>
  );

  /* ── CLIENT DETAIL / PROFILE ── */
  if (sel) {
    const connectedCount = Object.values(sel.socials||{}).filter(s=>s.connected).length;
    const files = sel.files || [];
    const invoices = sel.invoices || [
      { id:1, month:"Fev/2026", value:sel.monthly, status:"pago", paidAt:"05/02/2026" },
      { id:2, month:"Jan/2026", value:sel.monthly, status:"pago", paidAt:"03/01/2026" },
      { id:3, month:"Dez/2025", value:sel.monthly, status:"pago", paidAt:"04/12/2025" },
    ];
    const contract = sel.contract || {
      type: "Sem fidelidade",
      startDate: sel.since ? `01/${sel.since}` : "01/01/2025",
      endDate: "Sem fidelidade",
      services: sel.plan === "Partner"
        ? ["Tudo do Plano Growth 360º","Consultoria de Vendas & CRM","Produção de Campanhas Publicitárias","Desenvolvimento Web Contínuo (CRO)","Gestão Omnichannel","Acesso Direto ao Founder"]
        : sel.plan === "Growth 360"
        ? ["Planejamento Estratégico & Mentoria Mensal","Tráfego Pago (Google & Meta Ads)","Gestão Completa de Redes Sociais","Captação de Conteúdo In-loco (Foto & Vídeo)","Motion Design & Criativos de Alta Conversão","Reuniões Quinzenais de Alinhamento"]
        : ["Gestão de Tráfego OU Social Media","Edição e Motion","Design para Posts Estáticos","Relatórios de Performance","Suporte Comercial"],
      posts: sel.plan === "Partner" ? "Ilimitado" : sel.plan === "Growth 360" ? "12/mês" : "8/mês",
      payment: "Boleto bancário",
      status: "ativo",
    };

    const LIB_CATS = [
      { key:"brand", label:"Manual de Marca", icon:"📕", c:B.red, desc:"Logo, paleta, tipografia, brandbook" },
      { key:"feed", label:"Posts Feed", icon:"📱", c:B.blue, desc:"Artes para feed do Instagram/Facebook" },
      { key:"stories", label:"Stories", icon:"📲", c:B.pink, desc:"Artes de stories para Instagram" },
      { key:"reels", label:"Capas de Reels", icon:"🎬", c:B.purple, desc:"Thumbnails e capas de reels" },
      { key:"videos", label:"Vídeos", icon:"🎥", c:B.orange, desc:"Reels, TikTok, YouTube" },
      { key:"digital", label:"Artes Digitais", icon:"🖥️", c:B.cyan, desc:"Banners, thumbnails, ads" },
      { key:"print", label:"Material Impresso", icon:"🖨️", c:B.green, desc:"Cartões, flyers, banners físicos" },
      { key:"docs", label:"Documentos", icon:"📄", c:B.muted, desc:"Contratos, briefings, relatórios" },
      { key:"ref", label:"Referências", icon:"💡", c:B.yellow, desc:"Moodboards, inspirações" },
      { key:"other", label:"Outros", icon:"📁", c:B.muted, desc:"Demais arquivos" },
    ];
    const catMap = { "Manual de Marca":"brand","Posts Feed":"feed","Stories":"stories","Capas de Reels":"reels","Vídeos":"videos","Artes Digitais":"digital","Material Impresso":"print","Documentos":"docs","Referências":"ref" };
    const getFileCat = (f) => catMap[f.category] || "other";

    const addFile = () => {
      if (!fileForm.name?.trim()) return showToast("Informe o nome do arquivo");
      const nf = { id: Date.now(), name: fileForm.name.trim(), category: fileForm.category || "Outros", date: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric"}), size: (Math.random()*10+0.5).toFixed(1)+"MB" };
      updateClient(sel.id, { files: [...files, nf] });
      setAddingFile(false); setFileForm({});
      showToast("Arquivo adicionado! ✓");
    };

    const removeFile = (fid) => {
      updateClient(sel.id, { files: files.filter(f=>f.id!==fid) });
    };

    const filteredFiles = libCat === "all" ? files : files.filter(f => getFileCat(f) === libCat);

    const fileIcon = (name) => {
      const ext = name.split(".").pop()?.toLowerCase();
      if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return { ic: IC.img, c: B.pink };
      if (["mp4","mov","avi","mkv"].includes(ext)) return { ic: IC.vid, c: B.orange };
      if (["pdf"].includes(ext)) return { ic: IC.doc, c: B.red };
      if (["psd","ai","fig","xd"].includes(ext)) return { ic: IC.palette, c: B.purple };
      if (["doc","docx","txt"].includes(ext)) return { ic: IC.doc, c: B.blue };
      return { ic: IC.doc, c: B.muted };
    };

    const PLANS = [
      { key:"Traction", price:"R$ 1.480", services:["Gestão de Tráfego OU Social Media","Edição e Motion","Design para Posts Estáticos","Relatórios de Performance","Suporte Comercial"], posts:"8/mês", desc:"Estrutura essencial para profissionalizar sua presença digital", target:"Startups & PMEs" },
      { key:"Growth 360", price:"R$ 2.480", services:["Planejamento Estratégico & Mentoria Mensal","Tráfego Pago (Google & Meta Ads)","Gestão Completa de Redes Sociais","Captação de Conteúdo In-loco (Foto & Vídeo)","Motion Design & Criativos de Alta Conversão","Reuniões Quinzenais de Alinhamento"], posts:"12/mês", desc:"Operação de marketing completa focada em ROI e Market Share", target:"Scale-ups & Expansão" },
      { key:"Partner", price:"R$ 4.480", services:["Tudo do Plano Growth 360º","Consultoria de Vendas & CRM","Produção de Campanhas Publicitárias","Desenvolvimento Web Contínuo (CRO)","Gestão Omnichannel","Acesso Direto ao Founder"], posts:"Ilimitado", desc:"Solução definitiva com acesso à diretoria e produção de elite", target:"Grandes Contas & Business" },
    ];

    const changePlan = (newPlan) => {
      const planData = PLANS.find(p => p.key === newPlan);
      updateClient(sel.id, { plan: newPlan, monthly: planData.price });
      setShowPlanPicker(false);
      showToast(`Plano alterado para ${newPlan}! ✓`);
    };

    const executeClientAction = (type) => {
      if (type === "pause") { updateClient(sel.id, { status: "pausado" }); showToast("Cliente pausado ⏸"); }
      else if (type === "cancel") { updateClient(sel.id, { status: "cancelado" }); showToast("Cliente cancelado"); }
      else if (type === "reactivate") { updateClient(sel.id, { status: "ativo" }); showToast("Cliente reativado! ✓"); }
      setConfirmAction(null);
    };

    /* CONFIRM ACTION MODAL */
    if (confirmAction) return (
      <div className="pg">
        {ToastEl}
        <Head title={confirmAction.label} onBack={() => setConfirmAction(null)} />
        <Card style={{ textAlign:"center", padding:24 }}>
          <div style={{ width:56, height:56, borderRadius:28, background: confirmAction.type==="cancel" ? `${B.red}12` : confirmAction.type==="pause" ? `${B.orange}12` : `${B.green}12`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px" }}>
            {confirmAction.type === "cancel"
              ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.red} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              : confirmAction.type === "pause"
              ? <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.orange} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>
              : <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={B.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            }
          </div>
          <h3 style={{ fontSize:16, fontWeight:800 }}>{confirmAction.label}</h3>
          <p style={{ fontSize:13, color:B.muted, marginTop:6, lineHeight:1.5 }}>
            {confirmAction.type === "cancel" && `Tem certeza que deseja cancelar o contrato de ${sel.name}? O cliente perderá acesso a todos os serviços.`}
            {confirmAction.type === "pause" && `O cliente ${sel.name} será pausado. Os serviços serão suspensos temporariamente mas o contrato continua ativo.`}
            {confirmAction.type === "reactivate" && `Reativar todos os serviços de ${sel.name}?`}
          </p>
        </Card>
        <div style={{ display:"flex", gap:8, marginTop:16 }}>
          <button onClick={() => setConfirmAction(null)} style={{ flex:1, padding:"14px 0", borderRadius:12, border:`1.5px solid ${B.border}`, background:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, color:B.text }}>Voltar</button>
          <button onClick={() => executeClientAction(confirmAction.type)} style={{ flex:1, padding:"14px 0", borderRadius:12, border:"none", background: confirmAction.type==="cancel"?B.red:confirmAction.type==="pause"?B.orange:B.green, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, color:"#fff" }}>Confirmar</button>
        </div>
      </div>
    );

    /* PLAN PICKER MODAL */
    if (showPlanPicker) return (
      <div className="pg">
        {ToastEl}
        <Head title="Alterar Plano" onBack={() => setShowPlanPicker(false)} />
        <Card style={{ marginBottom:12, background:`${B.accent}06`, border:`1px solid ${B.accent}15` }}>
          <p style={{ fontSize:12, color:B.text }}>Plano atual: <strong>{sel.plan}</strong> — {sel.monthly}/mês</p>
        </Card>
        {PLANS.map((plan, i) => {
          const isCurrent = plan.key === sel.plan;
          const curIdx = PLANS.findIndex(p=>p.key===sel.plan);
          return (
            <Card key={plan.key} style={{ marginTop: i?8:0, borderLeft:`4px solid ${isCurrent ? B.accent : B.border}`, opacity: isCurrent ? 0.7 : 1 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <div>
                  <p style={{ fontSize:15, fontWeight:800 }}>{plan.key}</p>
                  <p style={{ fontSize:18, fontWeight:900, color:B.green }}>{plan.price}<span style={{ fontSize:11, color:B.muted, fontWeight:400 }}>/mês</span></p>
                </div>
                {isCurrent ? <Tag color={B.accent}>Atual</Tag> : (
                  <button onClick={() => changePlan(plan.key)} style={{ padding:"8px 16px", borderRadius:10, background: i > curIdx ? B.accent : `${B.orange}15`, border: i > curIdx ? "none" : `1.5px solid ${B.orange}40`, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, color: i > curIdx ? B.dark : B.orange }}>
                    {i > curIdx ? "⬆ Upgrade" : "⬇ Downgrade"}
                  </button>
                )}
              </div>
              <p style={{ fontSize:11, color:B.muted, marginBottom:4 }}>{plan.desc}</p>
              <Tag color={B.purple} style={{ marginBottom:8 }}>{plan.target}</Tag>
              <p style={{ fontSize:11, color:B.muted, marginBottom:6 }}>Sem fidelidade · Início imediato</p>
              {plan.services.map((s,j) => (
                <div key={j} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 0" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={B.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span style={{ fontSize:12 }}>{s}</span>
                </div>
              ))}
            </Card>
          );
        })}
      </div>
    );

    /* ADD FILE FORM */
    if (addingFile) return (
      <div className="pg">
        {ToastEl}
        <Head title="Novo Arquivo" onBack={() => { setAddingFile(false); setFileForm({}); }} />
        <Card>
          <label className="sl" style={{ display:"block", marginBottom:4 }}>Nome do arquivo *</label>
          <input value={fileForm.name||""} onChange={e=>setFileForm(p=>({...p,name:e.target.value}))} placeholder="Ex: post_lancamento_feed.png" className="tinput" style={{ marginBottom:12 }} />
          <label className="sl" style={{ display:"block", marginBottom:6 }}>Categoria</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {LIB_CATS.filter(c=>c.key!=="other").map(cat => (
              <button key={cat.key} onClick={() => setFileForm(p=>({...p,category:cat.label}))} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", borderRadius:10, border:`1.5px solid ${fileForm.category===cat.label ? B.accent : B.border}`, background: fileForm.category===cat.label ? `${B.accent}10` : B.bgCard, cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                <span style={{ fontSize:16 }}>{cat.icon}</span>
                <span style={{ fontSize:11, fontWeight:600 }}>{cat.label}</span>
              </button>
            ))}
          </div>
        </Card>
        <button onClick={addFile} className="pill full accent" style={{ marginTop:16, padding:"14px 0" }}>Adicionar Arquivo</button>
      </div>
    );

    return (
    <div className="pg">
      {ToastEl}
      <Head title={sel.name} onBack={() => { setSel(null); setProfileTab("info"); }} />
      <Card style={{ textAlign:"center", marginBottom:10 }}>
        <Av name={sel.name} sz={64} fs={24} />
        <h3 style={{ fontSize:18, fontWeight:800, marginTop:8 }}>{sel.name}</h3>
        {sel.segment && <p style={{ fontSize:12, color:B.muted, marginTop:2 }}>{sel.segment}</p>}
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:8, flexWrap:"wrap" }}>
          <Tag color={B.accent}>{sel.plan}</Tag>
          <Tag color={sel.status==="ativo"?B.green:sel.status==="pausado"?B.orange:sel.status==="cancelado"?B.red:B.orange}>{sel.status==="ativo"?"Ativo":sel.status==="pausado"?"Pausado":sel.status==="cancelado"?"Cancelado":"Trial"}</Tag>
          <Tag color={B.blue}>Desde {sel.since}</Tag>
        </div>
      </Card>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:6, marginBottom:10 }}>
        <Card style={{ textAlign:"center", padding:8 }}><p style={{ fontSize:14, fontWeight:800, color:B.green }}>{sel.monthly}</p><p style={{ fontSize:8, color:B.muted }}>Mensal</p></Card>
        <Card style={{ textAlign:"center", padding:8 }}><p style={{ fontSize:14, fontWeight:800, color:B.orange }}>{sel.pending}</p><p style={{ fontSize:8, color:B.muted }}>Pendentes</p></Card>
        <Card style={{ textAlign:"center", padding:8 }}><p style={{ fontSize:14, fontWeight:800, color:B.blue }}>{connectedCount}</p><p style={{ fontSize:8, color:B.muted }}>Redes</p></Card>
        <Card style={{ textAlign:"center", padding:8 }}><p style={{ fontSize:14, fontWeight:800, color:B.purple }}>{files.length}</p><p style={{ fontSize:8, color:B.muted }}>Arquivos</p></Card>
      </div>
      <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
        {[{k:"info",l:"Dados"},{k:"socials",l:"Redes"},{k:"library",l:"Biblioteca"},{k:"contract",l:"Contrato"},{k:"financial",l:"Financeiro"},{k:"actions",l:"Ações"}].map(t=>(
          <button key={t.k} onClick={()=>setProfileTab(t.k)} className={`htab${profileTab===t.k?" a":""}`} style={{ fontSize:11, whiteSpace:"nowrap", flexShrink:0 }}>{t.l}</button>
        ))}
      </div>

      {profileTab === "info" && <>
        <p className="sl" style={{ marginBottom:6 }}>Contato principal</p>
        <Card>
          {[
            { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, label:"Nome", field:"contact" },
            { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.green} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>, label:"Telefone", field:"phone" },
            { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.blue} strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label:"E-mail", field:"email" },
          ].map((item,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderTop: i ? `1px solid ${B.border}` : "none" }}>
              <div style={{ width:36, height:36, borderRadius:10, background:`${B.accent}08`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{item.icon}</div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:10, color:B.muted, marginBottom:2 }}>{item.label}</p>
                <input value={sel[item.field]||""} onChange={e=>updateClient(sel.id,{[item.field]:e.target.value})} placeholder={`Adicionar ${item.label.toLowerCase()}`} className="tinput" style={{ padding:"4px 8px", fontSize:13, fontWeight:600, border:"none", background:"transparent", width:"100%" }} onBlur={e=>{ if(e.target.value) showToast("Salvo ✓"); }} />
              </div>
            </div>
          ))}
        </Card>

        <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Nome da empresa</p>
        <Card>
          <input value={sel.name||""} onChange={e=>updateClient(sel.id,{name:e.target.value})} className="tinput" style={{ fontWeight:700, fontSize:15, border:"none", background:"transparent", width:"100%", padding:"2px 0" }} />
        </Card>

        <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Plano e Status</p>
        <Card>
          <div style={{ display:"flex", gap:6, marginBottom:10 }}>
            {["Traction","Growth 360","Partner"].map(p=>(
              <button key={p} onClick={()=>updateClient(sel.id,{plan:p})} style={{ flex:1, padding:"8px 0", borderRadius:10, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, border:sel.plan===p?`2px solid ${B.accent}`:`1.5px solid ${B.border}`, background:sel.plan===p?`${B.accent}15`:B.bgCard, color:sel.plan===p?B.accent:B.muted }}>{p}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {["ativo","pausado","cancelado"].map(s=>{
              const sc = s==="ativo"?B.green:s==="pausado"?B.orange:B.red;
              return <button key={s} onClick={()=>updateClient(sel.id,{status:s})} style={{ flex:1, padding:"8px 0", borderRadius:10, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, border:sel.status===s?`2px solid ${sc}`:`1.5px solid ${B.border}`, background:sel.status===s?`${sc}15`:B.bgCard, color:sel.status===s?sc:B.muted, textTransform:"capitalize" }}>{s}</button>;
            })}
          </div>
        </Card>

        <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Dados da empresa</p>
        <Card>
          {[{label:"CNPJ",field:"cnpj",ph:"00.000.000/0000-00"},{label:"Segmento",field:"segment",ph:"Ex: Restaurante, Imobiliária..."},{label:"Endereço",field:"address",ph:"Rua, nº, bairro, cidade"},{label:"Cliente desde",field:"since",ph:"MM/YYYY"}].map((item,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderTop: i?`1px solid ${B.border}`:"none", gap:10 }}>
              <span style={{ fontSize:11, color:B.muted, flexShrink:0 }}>{item.label}</span>
              <input value={sel[item.field]||""} onChange={e=>updateClient(sel.id,{[item.field]:e.target.value})} placeholder={item.ph} className="tinput" style={{ textAlign:"right", fontSize:13, fontWeight:600, border:"none", background:"transparent", maxWidth:"60%", padding:"2px 0" }} />
            </div>
          ))}
        </Card>

        <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Valor mensal</p>
        <Card>
          <input value={sel.monthly||""} onChange={e=>updateClient(sel.id,{monthly:e.target.value})} placeholder="R$ 0" className="tinput" style={{ fontWeight:700, fontSize:15, border:"none", background:"transparent", width:"100%", padding:"2px 0" }} />
        </Card>

        <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Observações</p>
        <Card><textarea value={sel.notes||""} onChange={e=>updateClient(sel.id,{notes:e.target.value})} placeholder="Anotações internas sobre o cliente..." className="tinput" style={{ minHeight:80, resize:"vertical" }} /></Card>
      </>}

      {profileTab === "socials" && <>
        <Card style={{ marginBottom:12, background:`${B.accent}06`, border:`1px solid ${B.accent}15` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <div><p style={{ fontSize:13, fontWeight:700, color:B.text }}>Redes conectadas: {connectedCount}/{SOCIAL_PLATFORMS.length}</p><p style={{ fontSize:11, color:B.muted }}>Conecte os perfis para gerenciar conteúdo</p></div>
          </div>
        </Card>
        {SOCIAL_PLATFORMS.map((plat) => {
          const data = sel.socials?.[plat.key] || {}; const connected = data.connected;
          return (
            <Card key={plat.key} style={{ marginTop:6, cursor:"pointer", borderLeft:`4px solid ${connected?plat.c:B.border}` }} onClick={()=>connectSocial(plat.key)}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:`${plat.c}${connected?"15":"08"}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {plat.icon ? <NetworkIcon name={plat.name.split(" ")[0]} sz={20} active={connected} /> : plat.key==="google" ? <GoogleIcon sz={20}/> : <PinterestIcon sz={20}/>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:B.text }}>{plat.name}</p>
                  {connected ? <p style={{ fontSize:11, color:plat.c, fontWeight:500 }}>{data.user} {data.followers?`· ${data.followers}`:""}{data.reviews?` · ${data.reviews}`:""}</p> : <p style={{ fontSize:11, color:B.muted }}>Não conectado</p>}
                </div>
                {connected ? <div style={{ display:"flex", alignItems:"center", gap:6 }}><div style={{ width:8, height:8, borderRadius:4, background:B.green }}/><span style={{ fontSize:10, fontWeight:600, color:B.green }}>Ativo</span></div> : <span style={{ fontSize:10, fontWeight:600, color:B.accent, padding:"4px 10px", borderRadius:8, background:`${B.accent}10` }}>Conectar</span>}
              </div>
            </Card>
          );
        })}
      </>}

      {profileTab === "library" && <>
        <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:10, overflowX:"auto", paddingBottom:4 }}>
          <button onClick={()=>setLibCat("all")} className={`htab${libCat==="all"?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>Todos ({files.length})</button>
          {LIB_CATS.map(cat => {
            const count = files.filter(f=>getFileCat(f)===cat.key).length;
            if (count===0 && libCat!==cat.key) return null;
            return <button key={cat.key} onClick={()=>setLibCat(cat.key)} className={`htab${libCat===cat.key?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>{cat.icon} {cat.label} ({count})</button>;
          })}
        </div>
        {libCat === "all" && LIB_CATS.map(cat => {
          const catFiles = files.filter(f=>getFileCat(f)===cat.key);
          if (catFiles.length===0) return null;
          return (
            <div key={cat.key}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10, marginBottom:6 }}>
                <p className="sl">{cat.icon} {cat.label}</p>
                <span style={{ fontSize:10, color:B.muted }}>{catFiles.length} arquivo{catFiles.length>1?"s":""}</span>
              </div>
              {catFiles.map(f => { const fi=fileIcon(f.name); return (
                <Card key={f.id} style={{ marginTop:4 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:`${fi.c}10`, display:"flex", alignItems:"center", justifyContent:"center", color:fi.c, flexShrink:0 }}>{fi.ic}</div>
                    <div style={{ flex:1, minWidth:0 }}><p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</p><p style={{ fontSize:10, color:B.muted }}>{f.size} · {f.date}</p></div>
                    <button onClick={e=>{e.stopPropagation();removeFile(f.id);}} style={{ background:"none", border:"none", cursor:"pointer", color:B.muted, display:"flex", padding:4 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                  </div>
                </Card>
              );})}
            </div>
          );
        })}
        {libCat !== "all" && (filteredFiles.length===0 ? (
          <Card style={{ textAlign:"center", padding:24 }}><p style={{ fontSize:20 }}>{LIB_CATS.find(c=>c.key===libCat)?.icon}</p><p style={{ fontSize:13, fontWeight:600, marginTop:6 }}>Nenhum arquivo nesta categoria</p><p style={{ fontSize:11, color:B.muted, marginTop:4 }}>{LIB_CATS.find(c=>c.key===libCat)?.desc}</p></Card>
        ) : filteredFiles.map(f => { const fi=fileIcon(f.name); return (
          <Card key={f.id} style={{ marginTop:4 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:38, height:38, borderRadius:10, background:`${fi.c}10`, display:"flex", alignItems:"center", justifyContent:"center", color:fi.c, flexShrink:0 }}>{fi.ic}</div>
              <div style={{ flex:1, minWidth:0 }}><p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</p><p style={{ fontSize:10, color:B.muted }}>{f.size} · {f.date}</p></div>
              <button onClick={e=>{e.stopPropagation();removeFile(f.id);}} style={{ background:"none", border:"none", cursor:"pointer", color:B.muted, display:"flex", padding:4 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          </Card>
        );}))}
        <button onClick={()=>setAddingFile(true)} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, width:"100%", padding:16, marginTop:12, borderRadius:14, border:`2px dashed ${B.accent}30`, background:`${B.accent}04`, cursor:"pointer", color:B.accent, fontSize:12, fontWeight:600, fontFamily:"inherit" }}>{IC.upload} Adicionar arquivo à biblioteca</button>
      </>}

      {profileTab === "contract" && <>
        <Card style={{ marginBottom:10, borderLeft:`4px solid ${contract.status==="ativo"?B.green:B.red}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:44, height:44, borderRadius:14, background:`${contract.status==="ativo"?B.green:B.red}12`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={contract.status==="ativo"?B.green:B.red} strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <div style={{ flex:1 }}><p style={{ fontSize:15, fontWeight:700 }}>Contrato {contract.type}</p><p style={{ fontSize:11, color:B.muted }}>Status: <span style={{ fontWeight:700, color:contract.status==="ativo"?B.green:B.red }}>{contract.status==="ativo"?"Ativo":"Encerrado"}</span></p></div>
            <Tag color={B.accent}>{sel.plan}</Tag>
          </div>
        </Card>
        <p className="sl" style={{ marginBottom:6 }}>Detalhes do contrato</p>
        <Card>
          {[{label:"Tipo",value:contract.type},{label:"Início",value:contract.startDate},{label:"Vigência",value:contract.endDate},{label:"Valor",value:sel.monthly},{label:"Pagamento",value:contract.payment},{label:"Posts",value:contract.posts}].map((item,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderTop:i?`1px solid ${B.border}`:"none" }}><span style={{ fontSize:11, color:B.muted }}>{item.label}</span><span style={{ fontSize:13, fontWeight:600 }}>{item.value}</span></div>
          ))}
        </Card>
        <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Serviços — {sel.plan}</p>
        <Card>
          {contract.services.map((s,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderTop:i?`1px solid ${B.border}`:"none" }}>
              <div style={{ width:22, height:22, borderRadius:11, background:`${B.green}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={B.green} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
              <span style={{ fontSize:13, fontWeight:500 }}>{s}</span>
            </div>
          ))}
        </Card>
      </>}

      {profileTab === "financial" && <>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:12 }}>
          <Card style={{ textAlign:"center", padding:12, background:`${B.green}08`, border:`1px solid ${B.green}15` }}><p style={{ fontSize:20, fontWeight:900, color:B.green }}>{sel.monthly}</p><p style={{ fontSize:10, color:B.muted }}>Mensal</p></Card>
          <Card style={{ textAlign:"center", padding:12 }}><p style={{ fontSize:20, fontWeight:900, color:B.text }}>R$ {(parseBRL(sel.monthly)*12).toLocaleString("pt-BR",{minimumFractionDigits:0})}</p><p style={{ fontSize:10, color:B.muted }}>Anual estimada</p></Card>
        </div>
        <p className="sl" style={{ marginBottom:6 }}>Plano e status</p>
        <Card style={{ marginBottom:10 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div><p style={{ fontSize:14, fontWeight:700 }}>Plano {sel.plan}</p><p style={{ fontSize:12, color:B.muted }}>{sel.monthly}/mês</p></div>
            <button onClick={()=>setShowPlanPicker(true)} style={{ padding:"8px 14px", borderRadius:10, background:`${B.accent}10`, border:`1.5px solid ${B.accent}30`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.text }}>Alterar plano</button>
          </div>
          <div style={{ display:"flex", gap:6 }}>
            {(sel.status==="ativo"||sel.status==="trial") && <>
              <button onClick={()=>setConfirmAction({type:"pause",label:"Pausar Cliente"})} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 0", borderRadius:10, border:`1.5px solid ${B.orange}30`, background:`${B.orange}06`, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.orange }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pausar
              </button>
              <button onClick={()=>setConfirmAction({type:"cancel",label:"Cancelar Cliente"})} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 0", borderRadius:10, border:`1.5px solid ${B.red}30`, background:`${B.red}06`, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.red }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Cancelar
              </button>
            </>}
            {(sel.status==="pausado"||sel.status==="cancelado") && (
              <button onClick={()=>setConfirmAction({type:"reactivate",label:"Reativar Cliente"})} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px 0", borderRadius:10, border:`1.5px solid ${B.green}30`, background:`${B.green}06`, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.green }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Reativar
              </button>
            )}
          </div>
        </Card>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <p className="sl">Faturas</p>
          <button onClick={()=>{const nInv={id:Date.now(),month:new Date().toLocaleDateString("pt-BR",{month:"short",year:"numeric"}),value:sel.monthly,status:"pendente",paidAt:null};updateClient(sel.id,{invoices:[nInv,...invoices]});showToast("Fatura gerada! ✓");}} style={{ fontSize:10, fontWeight:600, color:B.accent, background:`${B.accent}10`, border:"none", padding:"4px 10px", borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>+ Nova fatura</button>
        </div>
        {invoices.map((inv,i)=>(
          <Card key={inv.id||i} style={{ marginTop:i?6:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:inv.status==="pago"?`${B.green}10`:`${B.orange}10`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {inv.status==="pago"?<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.green} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.orange} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
              </div>
              <div style={{ flex:1 }}><p style={{ fontSize:13, fontWeight:600 }}>{inv.month}</p><p style={{ fontSize:11, color:B.muted }}>{inv.status==="pago"?`Pago em ${inv.paidAt}`:"Aguardando pagamento"}</p></div>
              <div style={{ textAlign:"right" }}><p style={{ fontSize:14, fontWeight:700, color:inv.status==="pago"?B.green:B.orange }}>{inv.value}</p><Tag color={inv.status==="pago"?B.green:B.orange}>{inv.status==="pago"?"Pago":"Pendente"}</Tag></div>
            </div>
            {inv.status!=="pago" && <button onClick={()=>{updateClient(sel.id,{invoices:invoices.map(x=>x.id===inv.id?{...x,status:"pago",paidAt:new Date().toLocaleDateString("pt-BR")}:x)});showToast("Pagamento confirmado! ✓");}} style={{ width:"100%", marginTop:8, padding:"8px 0", borderRadius:10, border:`1.5px solid ${B.green}30`, background:`${B.green}06`, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:B.green }}>Confirmar pagamento</button>}
          </Card>
        ))}
        <p className="sl" style={{ marginTop:16, marginBottom:6 }}>Dados de cobrança</p>
        <Card>
          {[{label:"Pagamento",value:contract.payment},{label:"Vencimento",value:"Dia 05"},{label:"CNPJ",value:sel.cnpj},{label:"E-mail NF",value:sel.email}].map((item,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderTop:i?`1px solid ${B.border}`:"none" }}><span style={{ fontSize:11, color:B.muted }}>{item.label}</span><span style={{ fontSize:12, fontWeight:600, textAlign:"right", maxWidth:"55%" }}>{item.value||"—"}</span></div>
          ))}
        </Card>
      </>}

      {profileTab === "actions" && <>
        {[
          { l:"Ver conteúdos", ic:IC.content, c:B.accent, desc:"Demandas e posts do cliente", act:()=>onNavigate?.("content") },
          { l:"Abrir chat", ic:IC.chat, c:B.blue, desc:"Conversar com o cliente", act:()=>onNavigate?.("chat") },
          { l:"Biblioteca", ic:()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>, c:B.purple, desc:`${files.length} arquivos do cliente`, act:()=>setProfileTab("library") },
          { l:"Redes Sociais", ic:()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>, c:B.pink, desc:`${connectedCount} redes conectadas`, act:()=>setProfileTab("socials") },
          { l:"Contrato", ic:()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>, c:B.cyan, desc:`Plano ${sel.plan} — ${contract.type}`, act:()=>setProfileTab("contract") },
          { l:"Financeiro", ic:IC.financial, c:B.green, desc:`${sel.monthly}/mês`, act:()=>setProfileTab("financial") },
          { l:"Alterar plano", ic:()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>, c:B.orange, desc:"Upgrade ou downgrade", act:()=>setShowPlanPicker(true) },
          { l:"Excluir cliente", ic:()=><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>, c:B.red, desc:"Remover permanentemente", act:async ()=>{
            if (!confirm(`Excluir ${sel.name}? Essa ação não pode ser desfeita.`)) return;
            if (sel.supaId) await supaDeleteClient(sel.supaId);
            setClients(p=>p.filter(c=>c.id!==sel.id));
            setSel(null); showToast("Cliente excluído ✓");
          } },
        ].map((a,i) => (
          <Card key={i} delay={i*0.03} onClick={a.act} style={{ marginTop:i?6:0, cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:`${a.c}12`, display:"flex", alignItems:"center", justifyContent:"center", color:a.c }}>{typeof a.ic==="function"?a.ic("currentColor"):a.ic}</div>
              <div style={{ flex:1 }}><p style={{ fontSize:13, fontWeight:600 }}>{a.l}</p><p style={{ fontSize:11, color:B.muted }}>{a.desc}</p></div>
              {IC.chev()}
            </div>
          </Card>
        ))}
      </>}
    </div>
    );
  }

  /* ── CLIENT LIST ── */
  return (
    <div className="pg">
      {ToastEl}
      <Head title="Clientes" onBack={onBack} />
      {/* Summary */}
      <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ color:B.accent, display:"flex" }}>{IC.users}</span>
            <div><p style={{ fontSize:22, fontWeight:900, color:"#fff" }}>{clients.length}</p><p style={{ fontSize:11, color:"rgba(255,255,255,0.5)" }}>clientes cadastrados</p></div>
          </div>
          <button onClick={() => setCreating(true)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:12, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, color:B.text }}>
            {IC.plus} Novo
          </button>
        </div>
      </Card>
      {/* Search */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:B.muted, display:"flex" }}>{IC.search(B.muted)}</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente..." className="tinput" style={{ paddingLeft:40 }} />
      </div>
      {/* Filter tabs */}
      <div style={{ display:"flex", gap:6, marginBottom:10 }}>
        {[{k:"all",l:"Todos"},{k:"ativo",l:"Ativos"},{k:"trial",l:"Trial"},{k:"pausado",l:"Pausados"},{k:"cancelado",l:"Cancelados"}].map(ft=>{
          const count = clients.filter(c=>ft.k==="all"||c.status===ft.k).length;
          if (count === 0 && ft.k !== "all" && ft.k !== "ativo") return null;
          return <button key={ft.k} onClick={()=>setFilter(ft.k)} className={`htab${filter===ft.k?" a":""}`}>{ft.l} <span style={{ fontSize:9, marginLeft:2 }}>({count})</span></button>;
        })}
      </div>
      {/* Client cards */}
      {filtered.map((c,i) => {
        const socialCount = Object.values(c.socials||{}).filter(s=>s.connected).length;
        return (
        <Card key={c.id} delay={i*0.03} onClick={()=>setSel(c)} style={{ marginTop: i?6:0, cursor:"pointer" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <Av name={c.name} sz={42} fs={16} />
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ fontSize:14, fontWeight:600 }}>{c.name}</p>
              <div style={{ display:"flex", gap:4, marginTop:3, alignItems:"center" }}>
                <Tag color={B.accent}>{c.plan}</Tag>
                <Tag color={c.status==="ativo"?B.green:B.orange}>{c.status==="ativo"?"Ativo":"Trial"}</Tag>
                {socialCount > 0 && <span style={{ fontSize:9, color:B.muted }}>{socialCount} rede{socialCount>1?"s":""}</span>}
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <p style={{ fontSize:13, fontWeight:700 }}>{c.monthly}</p>
              {c.pending > 0 && <p style={{ fontSize:10, color:B.orange, fontWeight:600 }}>{c.pending} pendente{c.pending>1?"s":""}</p>}
            </div>
          </div>
        </Card>
        );
      })}
      {filtered.length === 0 && <Card style={{ textAlign:"center", padding:32 }}>
        <p style={{ fontSize:14, fontWeight:700, color:B.text }}>Nenhum cliente encontrado</p>
        <p style={{ fontSize:12, color:B.muted, marginTop:4 }}>Tente ajustar a busca ou adicione um novo cliente.</p>
      </Card>}
    </div>
  );
}

/* ═══════════════════════ ACADEMY PAGE ═══════════════════════ */
function AcademyPage({ onBack }) {
  const [selCat, setSelCat] = useState(null);
  const [selCourse, setSelCourse] = useState(null);
  const cats = [
    { id: "mkt", name: "Marketing Digital", icon: IC.trending, c: B.accent, courses: [
      { t: "Fundamentos de Marketing Digital", dur: "2h 30m", lessons: 12, progress: 100, desc: "Aprenda os conceitos essenciais de marketing digital, desde SEO até redes sociais." },
      { t: "Estratégias de Conteúdo", dur: "1h 45m", lessons: 8, progress: 60, desc: "Como criar conteúdo que engaja e converte. Planejamento, criação e distribuição." },
      { t: "Marketing de Influência", dur: "1h 15m", lessons: 6, progress: 0, desc: "Estratégias para trabalhar com influenciadores e maximizar ROI em parcerias." },
    ]},
    { id: "design", name: "Design", icon: IC.palette, c: B.purple, courses: [
      { t: "Princípios de Design Visual", dur: "3h", lessons: 15, progress: 80, desc: "Tipografia, cores, composição e hierarquia visual para peças de marketing." },
      { t: "Design para Redes Sociais", dur: "2h", lessons: 10, progress: 40, desc: "Criação de posts, stories, carrosséis e reels com ferramentas profissionais." },
      { t: "Branding e Identidade Visual", dur: "2h 30m", lessons: 12, progress: 0, desc: "Como criar e manter a identidade visual de uma marca de forma consistente." },
    ]},
    { id: "trafego", name: "Tráfego Pago", icon: IC.target, c: B.blue, courses: [
      { t: "Google Ads — Completo", dur: "4h", lessons: 20, progress: 45, desc: "Do zero ao avançado em Google Ads. Rede de pesquisa, display, shopping e YouTube." },
      { t: "Meta Ads — Facebook e Instagram", dur: "3h 30m", lessons: 18, progress: 70, desc: "Campanhas de conversão, tráfego e engajamento. Pixel, públicos e otimização." },
      { t: "Métricas e Analytics", dur: "2h", lessons: 10, progress: 0, desc: "KPIs essenciais, GA4, dashboards de performance e tomada de decisão baseada em dados." },
    ]},
    { id: "video", name: "Audiovisual", icon: IC.vid, c: B.orange, courses: [
      { t: "Captação de Vídeo para Redes", dur: "2h 15m", lessons: 11, progress: 30, desc: "Técnicas de gravação, iluminação e enquadramento para conteúdo de redes sociais." },
      { t: "Edição com CapCut e Premiere", dur: "3h", lessons: 14, progress: 0, desc: "Edição profissional de vídeos curtos e longos para redes sociais e YouTube." },
    ]},
    { id: "conduta", name: "Conduta e Regras", icon: IC.shield, c: B.red, courses: [
      { t: "Código de Conduta Unique", dur: "30m", lessons: 4, progress: 100, desc: "Regras internas, valores da empresa, postura profissional e ética no trabalho." },
      { t: "Processos e Fluxos Internos", dur: "45m", lessons: 6, progress: 85, desc: "Como funcionam os processos de aprovação, entrega, comunicação e feedback." },
      { t: "Atendimento ao Cliente", dur: "1h", lessons: 7, progress: 50, desc: "Boas práticas de comunicação com clientes, gestão de expectativas e resolução de problemas." },
    ]},
    { id: "social", name: "Social Media", icon: IC.share, c: B.pink, courses: [
      { t: "Planejamento de Conteúdo", dur: "2h", lessons: 10, progress: 65, desc: "Como montar um calendário editorial eficiente e alinhar com estratégia de marca." },
      { t: "Copywriting para Redes", dur: "1h 30m", lessons: 8, progress: 20, desc: "Técnicas de escrita persuasiva para legendas, CTAs e anúncios." },
    ]},
  ];

  if (selCourse) return (
    <div className="pg">
      <Head title="" onBack={() => setSelCourse(null)} />
      <div style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: `${selCat?.c || B.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", color: selCat?.c || B.accent }}>{React.cloneElement(selCat?.icon || IC.star, { width: 28, height: 28 })}</div>
        <h2 style={{ fontSize: 18, fontWeight: 800 }}>{selCourse.t}</h2>
        <p style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>{selCourse.lessons} aulas · {selCourse.dur}</p>
      </div>
      <Card><p style={{ fontSize: 13, lineHeight: 1.7 }}>{selCourse.desc}</p></Card>
      <Card style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><p style={{ fontSize: 13, fontWeight: 600 }}>Progresso</p><span style={{ fontSize: 14, fontWeight: 800, color: selCourse.progress === 100 ? B.green : B.accent }}>{selCourse.progress}%</span></div>
        <div style={{ height: 8, borderRadius: 4, background: "#eee" }}><div style={{ height: 8, borderRadius: 4, background: selCourse.progress === 100 ? B.green : B.accent, width: `${selCourse.progress}%`, transition: "width .6s ease" }} /></div>
      </Card>
      <p className="sl" style={{ marginTop: 16, marginBottom: 8 }}>Aulas</p>
      {Array.from({ length: selCourse.lessons }, (_, i) => {
        const done = i < Math.floor(selCourse.lessons * selCourse.progress / 100);
        return (
          <Card key={i} delay={i * 0.03} style={{ marginTop: i ? 6 : 0, opacity: done ? 0.6 : 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: done ? B.green : `${B.accent}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? <span style={{ color: "#fff", display: "flex" }}>{IC.check}</span> : <span style={{ fontSize: 12, fontWeight: 800, color: B.accent }}>{i + 1}</span>}</div>
              <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 600, textDecoration: done ? "line-through" : "none" }}>Aula {i + 1}</p><p style={{ fontSize: 10, color: B.muted }}>{done ? "Concluída" : "Disponível"}</p></div>
              {!done && <span style={{ color: B.accent, display: "flex" }}>{IC.play}</span>}
            </div>
          </Card>
        );
      })}
      {selCourse.progress < 100 && <button className="pill full accent" style={{ marginTop: 14 }}>Continuar de onde parou</button>}
    </div>
  );

  if (selCat) return (
    <div className="pg">
      <Head title={selCat.name} onBack={() => setSelCat(null)} />
      {selCat.courses.map((course, i) => (
        <Card key={i} delay={i * 0.04} onClick={() => setSelCourse(course)} style={{ marginTop: i ? 8 : 0, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${selCat.c}12`, display: "flex", alignItems: "center", justifyContent: "center", color: selCat.c }}>{React.cloneElement(selCat.icon, { width: 20, height: 20 })}</div>
            <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 600 }}>{course.t}</p><p style={{ fontSize: 11, color: B.muted }}>{course.lessons} aulas · {course.dur}</p><div style={{ height: 4, borderRadius: 2, background: "#eee", marginTop: 6, width: "100%" }}><div style={{ height: 4, borderRadius: 2, background: course.progress === 100 ? B.green : selCat.c, width: `${course.progress}%` }} /></div></div>
            <span style={{ fontSize: 13, fontWeight: 800, color: course.progress === 100 ? B.green : selCat.c }}>{course.progress}%</span>
          </div>
        </Card>
      ))}
    </div>
  );

  const totalCourses = cats.reduce((a, c) => a + c.courses.length, 0);
  const completedCourses = cats.reduce((a, c) => a + c.courses.filter(x => x.progress === 100).length, 0);

  return (
    <div className="pg">
      <Head title="Academy" onBack={onBack} />
      <Card style={{ background: B.dark, color: "#fff", border: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={{ color: B.accent, display: "flex" }}>{IC.award}</span><p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase" }}>TREINAMENTOS</p></div>
        <div style={{ display: "flex", justifyContent: "center", gap: 20 }}>
          <div style={{ textAlign: "center" }}><span style={{ fontSize: 24, fontWeight: 900, color: B.accent }}>{totalCourses}</span><p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Cursos</p></div>
          <div style={{ textAlign: "center" }}><span style={{ fontSize: 24, fontWeight: 900, color: B.green }}>{completedCourses}</span><p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Concluídos</p></div>
          <div style={{ textAlign: "center" }}><span style={{ fontSize: 24, fontWeight: 900, color: "#fff" }}>{totalCourses - completedCourses}</span><p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Pendentes</p></div>
        </div>
      </Card>
      {cats.map((cat, i) => (
        <Card key={cat.id} delay={i * 0.04 + 0.06} onClick={() => setSelCat(cat)} style={{ marginTop: i ? 8 : 6, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: `${cat.c}12`, display: "flex", alignItems: "center", justifyContent: "center", color: cat.c }}>{cat.icon}</div>
            <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 700 }}>{cat.name}</p><p style={{ fontSize: 11, color: B.muted }}>{cat.courses.length} cursos · {cat.courses.filter(c => c.progress === 100).length} concluído{cat.courses.filter(c => c.progress === 100).length !== 1 ? "s" : ""}</p></div>
            {IC.chev()}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════ FINANCIAL PAGE ═══════════════════════ */
function FinancialPage({ onBack, clients: propClients }) {
  const CDATA = propClients || CLIENTS_DATA_INIT;
  const totalRevReal = CDATA.reduce((a, c) => a + parseBRL(c.monthly), 0);
  const payingClients = CDATA.filter(c => c.status === "ativo" && c.plan !== "Trial").length;
  const trialClients = CDATA.filter(c => c.status === "trial" || c.plan === "Trial").length;
  const ticketMedio = payingClients > 0 ? Math.round(totalRevReal / payingClients) : 0;
  const months = [
    { m: "Mar 2026", revenue: `R$ ${totalRevReal.toLocaleString("pt-BR")}`, clients: CDATA.length, paying: payingClients, trial: trialClients, ticket: `R$ ${ticketMedio.toLocaleString("pt-BR")}`, growth: "+12%", expenses: "R$ 8.200", profit: `R$ ${(totalRevReal - 8200).toLocaleString("pt-BR")}` },
    { m: "Fev 2026", revenue: "R$ 18.400", clients: 7, paying: 6, trial: 1, ticket: "R$ 2.628", growth: "+8%", expenses: "R$ 7.800", profit: "R$ 10.200" },
    { m: "Jan 2026", revenue: "R$ 16.400", clients: 6, paying: 5, trial: 1, ticket: "R$ 2.733", growth: "+5%", expenses: "R$ 7.500", profit: "R$ 8.600" },
  ];
  const [sel, setSel] = useState(null);
  const cur = sel || months[0];

  return (
    <div className="pg">
      <Head title="Financeiro" onBack={onBack} />
      <Card style={{ background: B.dark, color: "#fff", border: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={{ color: B.accent, display: "flex" }}>{IC.dollar}</span><p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: 2, textTransform: "uppercase" }}>FINANCEIRO — {cur.m.toUpperCase()}</p></div>
        <p style={{ fontSize: 32, fontWeight: 900, color: B.accent }}>{cur.revenue}</p>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Receita mensal</p>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <div><span style={{ fontSize: 14, fontWeight: 800, color: B.green }}>{cur.growth}</span><p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Crescimento</p></div>
          <div><span style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>{cur.profit}</span><p style={{ fontSize: 9, color: "rgba(255,255,255,0.4)" }}>Lucro</p></div>
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 6, marginTop: 10 }}>
        <Card delay={0.04} style={{ textAlign: "center", padding: 12 }}><span style={{ display: "flex", justifyContent: "center", color: B.blue, marginBottom: 4 }}>{IC.users}</span><p style={{ fontSize: 20, fontWeight: 800 }}>{cur.clients}</p><p style={{ fontSize: 10, color: B.muted }}>Total clientes</p></Card>
        <Card delay={0.06} style={{ textAlign: "center", padding: 12 }}><span style={{ display: "flex", justifyContent: "center", color: B.green, marginBottom: 4 }}>{IC.check}</span><p style={{ fontSize: 20, fontWeight: 800, color: B.green }}>{cur.paying}</p><p style={{ fontSize: 10, color: B.muted }}>Pagantes</p></Card>
        <Card delay={0.08} style={{ textAlign: "center", padding: 12 }}><span style={{ display: "flex", justifyContent: "center", color: B.orange, marginBottom: 4 }}>{IC.clock}</span><p style={{ fontSize: 20, fontWeight: 800, color: B.orange }}>{cur.trial}</p><p style={{ fontSize: 10, color: B.muted }}>Trial / Gratuito</p></Card>
        <Card delay={0.1} style={{ textAlign: "center", padding: 12 }}><span style={{ display: "flex", justifyContent: "center", color: B.accent, marginBottom: 4 }}>{IC.trending}</span><p style={{ fontSize: 16, fontWeight: 800 }}>{cur.ticket}</p><p style={{ fontSize: 10, color: B.muted }}>Ticket médio</p></Card>
      </div>
      <p className="sl" style={{ marginTop: 16, marginBottom: 8 }}>Despesas vs Receita</p>
      <Card delay={0.12}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div><p style={{ fontSize: 12, color: B.muted }}>Receita</p><p style={{ fontSize: 16, fontWeight: 800, color: B.green }}>{cur.revenue}</p></div>
          <div style={{ textAlign: "right" }}><p style={{ fontSize: 12, color: B.muted }}>Despesas</p><p style={{ fontSize: 16, fontWeight: 800, color: B.red }}>{cur.expenses}</p></div>
        </div>
        <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden" }}><div style={{ width: "55%", background: B.green, borderRadius: "6px 0 0 6px" }} /><div style={{ width: "45%", background: B.red, borderRadius: "0 6px 6px 0" }} /></div>
        <div style={{ marginTop: 10, padding: "10px 14px", background: `${B.green}06`, borderRadius: 10, textAlign: "center" }}><p style={{ fontSize: 10, color: B.muted }}>Lucro líquido</p><p style={{ fontSize: 20, fontWeight: 900, color: B.green }}>{cur.profit}</p></div>
      </Card>
      <p className="sl" style={{ marginTop: 16, marginBottom: 8 }}>Receita por cliente</p>
      {CDATA.map((c, i) => (
        <Card key={c.id} delay={0.15 + i * 0.03} style={{ marginTop: i ? 6 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Av name={c.name} sz={34} fs={13} /><div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</p><Tag color={c.status === "ativo" ? B.green : B.orange}>{c.plan}</Tag></div><p style={{ fontSize: 14, fontWeight: 700 }}>{c.monthly}</p></div>
        </Card>
      ))}
      <p className="sl" style={{ marginTop: 16, marginBottom: 8 }}>Histórico mensal</p>
      {months.map((m, i) => (
        <Card key={i} delay={0.3 + i * 0.03} onClick={() => setSel(m)} style={{ marginTop: i ? 6 : 0, cursor: "pointer", border: cur.m === m.m ? `1.5px solid ${B.accent}` : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 600 }}>{m.m}</p><p style={{ fontSize: 11, color: B.muted }}>{m.clients} clientes · {m.paying} pagantes</p></div><div style={{ textAlign: "right" }}><p style={{ fontSize: 14, fontWeight: 800, color: B.green }}>{m.revenue}</p><p style={{ fontSize: 10, color: B.green }}>{m.growth}</p></div></div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════ STAGE BAR (shared) ═══════════════════════ */
function StageBar({ type, current, compact }) {
  const getStages = t => t === "campaign" ? CAMPAIGN_STAGES : t === "video" ? VIDEO_STAGES : SOCIAL_STAGES;
  const stages = getStages(type);
  const idx = stages.indexOf(current);
  const pct = stages.length > 1 ? (idx / (stages.length - 1)) * 100 : 100;
  if (compact) {
    /* List card: single gradient bar */
    return (
      <div style={{ width:"100%", height:4, borderRadius:2, background:`${B.border}` }}>
        <div style={{ width:`${pct}%`, height:"100%", borderRadius:2, background:`linear-gradient(90deg, ${B.accent}90, ${B.accent})`, transition:"width .4s ease" }} />
      </div>
    );
  }
  /* Detail view: segmented bar */
  return (
    <div style={{ display:"flex", gap:3, alignItems:"center" }}>
      {stages.map((s,i) => {
        const done = i <= idx; const active = i === idx;
        const opacity = done ? 0.4 + (i / stages.length) * 0.6 : 0;
        return (<div key={s} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
          <div style={{ width:"100%", height:5, borderRadius:3, background: done ? B.accent : "#eee", opacity: done ? opacity : 1, transition:"all .3s", boxShadow: active ? `0 0 6px ${B.accent}40` : "none" }} />
          <span style={{ fontSize:7, color: done ? B.dark : B.muted, fontWeight: active ? 800 : 500, whiteSpace:"nowrap" }}>{STAGE_CFG[s].l}</span>
        </div>);
      })}
    </div>
  );
}

/* ═══════════════════════ CONTENT / DEMAND PAGE ═══════════════════════ */
/* ── Carousel/Image Preview Component ── */
function PostPreview({ format, client, slides, compact, children, uploadedFiles }) {
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const vidRef = React.useRef(null);
  const detailColors = {"Casa Nova Imóveis":["#1a5276","#2e86c1"],"Bella Estética":["#6c3483","#af7ac5"],"TechSmart":["#1b4f72","#2980b9"],"Padaria Real":["#7e5109","#d4ac0d"],"Studio Fitness":["#1e8449","#2ecc71"]};
  const [cA,cB] = detailColors[client] || ["#1C2228","#C8FA5F"];
  const arrowSz = compact ? 28 : 36;

  const imgFiles = (uploadedFiles||[]).filter(f => f.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name||""));
  const vidFiles = (uploadedFiles||[]).filter(f => f.url && /\.(mp4|mov|webm)$/i.test(f.name||""));
  const hasReal = imgFiles.length > 0 || vidFiles.length > 0;

  /* Carrossel = formato Carrossel OU múltiplas imagens uploaded */
  const isCarousel = format === "Carrossel" || imgFiles.length > 1;
  const total = isCarousel ? Math.max(imgFiles.length, slides || 2) : 1;
  const slideCount = imgFiles.length > 1 ? imgFiles.length : total;

  /* Aspect ratio por formato */
  const isVertical = ["Stories","Reels","Shorts"].includes(format) || vidFiles.length > 0;
  const aspect = isVertical ? "9/16" : "4/5";

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!vidRef.current) return;
    if (playing) { vidRef.current.pause(); setPlaying(false); }
    else { vidRef.current.play(); setPlaying(true); }
  };

  return (
    <div style={{ position:"relative", borderRadius:compact?0:12, overflow:"hidden" }}>
      {hasReal ? (
        <div style={{ position:"relative", aspectRatio:aspect, background:`linear-gradient(135deg, ${cA} 0%, ${cB} 100%)` }}>
          {imgFiles.length > 0 ? (
            <img src={imgFiles[Math.min(cur, imgFiles.length-1)]?.url} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
          ) : vidFiles.length > 0 ? (<>
            <video ref={vidRef} src={vidFiles[0]?.url+"#t=0.1"} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} preload="metadata" playsInline loop onClick={togglePlay} />
            <div onClick={togglePlay} style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", zIndex:1, cursor:"pointer", background: playing ? "transparent" : "rgba(0,0,0,0.25)", transition:"background .3s" }}>
              {!playing && <div style={{ width:compact?40:60, height:compact?40:60, borderRadius:"50%", background:"rgba(255,255,255,0.95)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
                <svg width={compact?18:28} height={compact?18:28} viewBox="0 0 24 24" fill="#111" style={{ marginLeft:compact?2:3 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>}
              {playing && <div style={{ position:"absolute", bottom:compact?8:14, right:compact?8:14, width:compact?28:36, height:compact?28:36, borderRadius:"50%", background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width={compact?10:14} height={compact?10:14} viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              </div>}
            </div>
          </>) : null}
          {isCarousel && imgFiles.length > 1 && <div style={{ position:"absolute", top:compact?6:10, right:compact?6:10, padding:"2px 8px", borderRadius:10, background:"rgba(0,0,0,0.55)", zIndex:2 }}>
            <span style={{ fontSize:10, fontWeight:700, color:"#fff" }}>{Math.min(cur+1,imgFiles.length)}/{imgFiles.length}</span>
          </div>}
        </div>
      ) : (
        <div style={{ aspectRatio:aspect, background:`linear-gradient(135deg, ${cA} 0%, ${cB} 100%)`, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", position:"relative" }}>
          <span style={{ fontSize:compact?28:40, opacity:0.25 }}>{isCarousel?(cur===0?"📸":cur===total-1?"📲":"🖼️"):(format==="Reels"||format==="Stories"?"🎬":"📸")}</span>
          {isCarousel && <p style={{ fontSize:compact?11:14, color:"rgba(255,255,255,0.7)", marginTop:4, fontWeight:700 }}>Slide {cur+1} de {total}</p>}
          <p style={{ fontSize:compact?12:15, color:"rgba(255,255,255,0.8)", marginTop:compact?2:4, fontWeight:700 }}>{client}</p>
        </div>
      )}
      {/* Carousel arrows */}
      {isCarousel && slideCount > 1 && cur > 0 && <button onClick={e=>{e.stopPropagation();setCur(p=>p-1);}} style={{ position:"absolute", left:6, top:"50%", transform:"translateY(-50%)", width:arrowSz, height:arrowSz, borderRadius:arrowSz/2, background:"rgba(0,0,0,0.6)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3 }}>
        <svg width={compact?12:16} height={compact?12:16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>}
      {isCarousel && cur < slideCount-1 && <button onClick={e=>{e.stopPropagation();setCur(p=>p+1);}} style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", width:arrowSz, height:arrowSz, borderRadius:arrowSz/2, background:"rgba(0,0,0,0.6)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", zIndex:3 }}>
        <svg width={compact?12:16} height={compact?12:16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>}
      {/* Carousel dots */}
      {isCarousel && slideCount > 1 && <div style={{ position:"absolute", bottom:compact?6:10, left:"50%", transform:"translateX(-50%)", display:"flex", gap:compact?3:5 }}>
        {Array.from({length:slideCount}).map((_,di) => <div key={di} style={{ width:di===cur?(compact?12:18):(compact?5:8), height:compact?5:8, borderRadius:4, background:di===cur?"#fff":"rgba(255,255,255,0.35)", transition:"all .25s" }} />)}
      </div>}
      {children}
    </div>
  );
}

function ContentPage({ user, clients: propClients, demands, setDemands }) {
  const CDATA = propClients || [];
  const [filter, setFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(null);
  const [calYear, setCalYear] = useState(null);
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createType, setCreateType] = useState(null);
  const [form, setForm] = useState({});
  const [editMode, setEditMode] = useState(false);
  const { showToast, ToastEl } = useToast();

  const filtered = demands.filter(d => {
    if (filter !== "all" && d.type !== filter) return false;
    if (clientFilter !== "all" && d.client !== clientFilter) return false;
    if (dateFilter) {
      const dDate = d.createdAt; /* format DD/MM */
      const [y, m, dy] = dateFilter.split("-");
      const target = `${dy}/${m}`;
      if (dDate !== target) return false;
    }
    return true;
  });
  const uniqueClients = [...new Set(demands.map(d => d.client))].sort();
  const getStages = t => t === "campaign" ? CAMPAIGN_STAGES : t === "video" ? VIDEO_STAGES : SOCIAL_STAGES;
  const pendingCount = demands.filter(d => !["published","completed"].includes(d.stage)).length;
  const priorityColor = p => p === "alta" ? B.red : p === "média" ? B.orange : B.green;
  const typeLabel = t => t === "social" ? "Post" : t === "campaign" ? "Campanha" : t === "video" ? "Vídeo" : "Outro";
  const typeColor = t => t === "social" ? B.blue : t === "campaign" ? B.purple : t === "video" ? B.orange : B.muted;

  /* ── Advance Stage ── */
  const syncMilestones = (demand, stageKey) => {
    if (demand.type !== "campaign" || !demand.campaign?.milestones?.length) return demand;
    const stages = CAMPAIGN_STAGES;
    const stageIdx = stages.indexOf(stageKey);
    const ms = demand.campaign.milestones.map((m, i) => ({ ...m, done: i <= stageIdx - 1 }));
    return { ...demand, campaign: { ...demand.campaign, milestones: ms } };
  };

  const advanceStage = (d) => {
    const stages = getStages(d.type);
    const idx = stages.indexOf(d.stage);
    if (idx < stages.length - 1) {
      const next = stages[idx + 1];
      setDemands(prev => prev.map(x => x.id === d.id ? syncMilestones({ ...x, stage: next }, next) : x));
      setSel(prev => syncMilestones({ ...prev, stage: next }, next));
      if (d.supaId) supaUpdateDemand(d.supaId, { stage: next });
      showToast(`Avançou para: ${STAGE_CFG[next].l}`);
    }
  };

  const rejectToStage = (d, targetStage) => {
    setDemands(prev => prev.map(x => x.id === d.id ? syncMilestones({ ...x, stage: targetStage }, targetStage) : x));
    setSel(prev => syncMilestones({ ...prev, stage: targetStage }, targetStage));
    if (d.supaId) supaUpdateDemand(d.supaId, { stage: targetStage });
    showToast(`Voltou para: ${STAGE_CFG[targetStage].l}`);
  };

  /* ── Create New Demand ── */
  const handleCreate = async () => {
    if (!createType) return;
    const newD = {
      id: Date.now(), type: createType, client: form.client || "Novo Cliente", title: form.title || "Nova demanda",
      stage: createType === "campaign" ? "planning" : "idea", priority: form.priority || "média",
      network: (form.networks && form.networks.length > 0) ? form.networks.join(", ") : "Instagram", format: form.format || "Feed", sponsored: form.sponsored || false,
      assignees: form.assignees || [user?.name || "Matheus"], createdAt: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}),
      steps: { idea: { by: user?.name || "Matheus", text: form.idea || "", date: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) } },
      scheduling: { date: form.schedDate || "", time: form.schedTime || "" }, traffic: { budget: form.budget || "" },
      ...(createType === "campaign" ? { campaign: { desc: form.desc || "", refs: form.refs || "", dateStart: form.dateStart || "", dateEnd: form.dateEnd || "", location: form.location || "", needs: [], clientTeam: [], budget: form.budget || "", budgetBreakdown: [], milestones: [] } } : {}),
    };
    /* Find client ID for Supabase */
    const clientObj = CDATA.find(c => c.name === form.client);
    const result = await supaCreateDemand(newD, clientObj?.supaId || clientObj?.id);
    let toastMsg = "Demanda criada!";
    if (result?.data) { newD.id = result.data.id; newD.supaId = result.data.id; toastMsg = "Demanda criada! ✓"; }
    else if (result?.err) { toastMsg = "Erro: " + result.err; }
    setDemands(prev => [newD, ...prev]);
    setCreating(false); setCreateType(null); setForm({});
    showToast(toastMsg);
  };

  /* ── CREATE SHEET ── */
  if (creating) return (
    <div className="pg" style={{ paddingTop: TOP }}>
      {ToastEl}
      <Head title={createType ? `Nova ${typeLabel(createType)}` : "Nova Demanda"} onBack={() => { if (createType) setCreateType(null); else setCreating(false); }} />
      {!createType ? (
        <div>
          <p style={{ fontSize:13, color:B.muted, marginBottom:12 }}>Que tipo de demanda você quer criar?</p>
          {[{k:"social",l:"Post para Rede Social",d:"Feed, stories, reels, carrossel",ic:IC.img,c:B.blue},
            {k:"campaign",l:"Campanha Publicitária",d:"Evento, ação presencial ou online",ic:IC.target,c:B.purple},
            {k:"video",l:"Produção de Vídeo",d:"Institucional, depoimento, produto",ic:IC.vid,c:B.orange},
            {k:"email",l:"E-mail Marketing",d:"Newsletter, promoção, nutrição",ic:IC.mail,c:B.green},
            {k:"blog",l:"Blog / SEO",d:"Artigo, landing page, conteúdo",ic:IC.doc,c:B.cyan},
          ].map((t,i) => (
            <Card key={t.k} delay={i*0.04} onClick={() => setCreateType(t.k)} style={{ marginTop: i?8:0, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:14, background:`${t.c}12`, display:"flex", alignItems:"center", justifyContent:"center", color:t.c }}>{t.ic}</div>
                <div style={{ flex:1 }}><p style={{ fontSize:14, fontWeight:700 }}>{t.l}</p><p style={{ fontSize:11, color:B.muted }}>{t.d}</p></div>
                {IC.chev()}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div>
          <label className="sl" style={{ display:"block", marginBottom:6 }}>Cliente</label>
          <select value={form.client||""} onChange={e=>setForm({...form,client:e.target.value})} className="tinput" style={{ marginBottom:12 }}>
            <option value="">Selecionar cliente...</option>
            {CDATA.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          <label className="sl" style={{ display:"block", marginBottom:6 }}>Título da demanda</label>
          <input value={form.title||""} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex: Carrossel novos produtos" className="tinput" style={{ marginBottom:12 }} />
          {createType === "social" && <>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Redes sociais</label>
            <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
              {["Instagram","Facebook","TikTok","LinkedIn","YouTube","Twitter"].map(n=>{
                const nets = form.networks || [];
                const sel = nets.includes(n);
                return (
                <button key={n} onClick={()=>setForm({...form, networks: sel ? nets.filter(x=>x!==n) : [...nets, n]})} style={{
                  display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:12, cursor:"pointer", fontFamily:"inherit",
                  border:`1.5px solid ${sel ? (NETWORK_CFG[n]?.c||B.accent) : B.border}`,
                  background: sel ? `${NETWORK_CFG[n]?.c||B.accent}10` : B.bgCard,
                  color: sel ? (NETWORK_CFG[n]?.c||B.text) : B.muted, fontSize:12, fontWeight:600, transition:"all .2s",
                }}>
                  <NetworkIcon name={n} sz={18} active={sel} />
                  {n}
                  {sel && <span style={{ marginLeft:2, display:"flex" }}>{IC.check}</span>}
                </button>
              );})}
            </div>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Formato</label>
            <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
              {["Feed","Stories","Reels","Carrossel","Shorts"].map(f=>(
                <button key={f} onClick={()=>setForm({...form,format:f})} className={`htab${form.format===f?" a":""}`} style={{ fontSize:11 }}>{f}</button>
              ))}
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>Post patrocinado?</span>
              <Toggle on={form.sponsored||false} onToggle={()=>setForm({...form,sponsored:!form.sponsored})} />
            </div>
            {form.sponsored && <>
              <label className="sl" style={{ display:"block", marginBottom:6 }}>Orçamento do boost</label>
              <input value={form.budget||""} onChange={e=>setForm({...form,budget:e.target.value})} placeholder="R$ 150" className="tinput" style={{ marginBottom:12 }} />
            </>}
          </>}
          {createType === "campaign" && <>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Descrição da campanha</label>
            <textarea value={form.desc||""} onChange={e=>setForm({...form,desc:e.target.value})} placeholder="Do que se trata, objetivos..." className="tinput" style={{ marginBottom:12, minHeight:80, resize:"vertical" }} />
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Referências</label>
            <input value={form.refs||""} onChange={e=>setForm({...form,refs:e.target.value})} placeholder="Campanhas de referência..." className="tinput" style={{ marginBottom:12 }} />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
              <div><label className="sl" style={{ display:"block", marginBottom:6 }}>Data início</label><input type="date" value={form.dateStart||""} onChange={e=>setForm({...form,dateStart:e.target.value})} className="tinput" /></div>
              <div><label className="sl" style={{ display:"block", marginBottom:6 }}>Data fim</label><input type="date" value={form.dateEnd||""} onChange={e=>setForm({...form,dateEnd:e.target.value})} className="tinput" /></div>
            </div>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Local</label>
            <input value={form.location||""} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Onde será a campanha" className="tinput" style={{ marginBottom:12 }} />
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Orçamento total</label>
            <input value={form.budget||""} onChange={e=>setForm({...form,budget:e.target.value})} placeholder="R$ 5.000" className="tinput" style={{ marginBottom:12 }} />
          </>}
          <label className="sl" style={{ display:"block", marginBottom:6 }}>Ideia / Briefing inicial</label>
          <textarea value={form.idea||""} onChange={e=>setForm({...form,idea:e.target.value})} placeholder="Descreva a ideia da demanda..." className="tinput" style={{ marginBottom:12, minHeight:80, resize:"vertical" }} />
          <label className="sl" style={{ display:"block", marginBottom:6 }}>Prioridade</label>
          <div style={{ display:"flex", gap:6, marginBottom:16 }}>
            {["baixa","média","alta"].map(p=>(
              <button key={p} onClick={()=>setForm({...form,priority:p})} style={{ flex:1, padding:"10px 0", borderRadius:12, border:`1.5px solid ${form.priority===p?priorityColor(p):B.border}`, background: form.priority===p?`${priorityColor(p)}12`:B.bgCard, color: form.priority===p?priorityColor(p):B.muted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", textTransform:"capitalize" }}>{p}</button>
            ))}
          </div>
          <button onClick={handleCreate} className="pill full accent" style={{ opacity:(form.title&&form.client)?1:0.4 }}>Criar Demanda {IC.arrowR()}</button>
        </div>
      )}
    </div>
  );

  /* ── DETAIL VIEW ── */
  if (sel) {
    const stages = getStages(sel.type);
    const stageIdx = stages.indexOf(sel.stage);
    const curStageCfg = STAGE_CFG[sel.stage];
    const isCampaign = sel.type === "campaign";

    /* helper: update a step field in sel and demands */
    const updateStep = (stepKey, data) => {
      const newSteps = { ...(sel.steps||{}), [stepKey]: { ...(sel.steps?.[stepKey]||{}), ...data } };
      setDemands(prev => prev.map(x => x.id === sel.id ? { ...x, steps: newSteps } : x));
      setSel(prev => ({ ...prev, steps: newSteps }));
      if (sel.supaId) supaUpdateDemand(sel.supaId, { steps: newSteps });
    };
    const updateField = (field, val) => {
      setDemands(prev => prev.map(x => x.id === sel.id ? { ...x, [field]: val } : x));
      setSel(prev => ({ ...prev, [field]: val }));
      if (sel.supaId) {
        const supaField = field === "network" ? "networks" : field;
        const supaVal = field === "network" ? (val ? val.split(", ") : []) : val;
        supaUpdateDemand(sel.supaId, { [supaField]: supaVal });
      }
    };

    /* Role label for each stage */
    const stageRole = { idea:"Head / CEO", briefing:"Social Media", design:"Designer / Audiovisual", caption:"Social Media", review:"Gerente", client:"Cliente", published:"—",
      planning:"Head / CEO", creation:"Equipe", execution:"Equipe", completed:"—", production:"Audiovisual", editing:"Editor" };
    const stageIcon = { idea:IC.ideas, briefing:IC.doc, design:IC.img, caption:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
      review:IC.shield, client:IC.users, published:IC.check, planning:IC.ideas, creation:IC.img, execution:IC.target, completed:IC.check, production:IC.vid, editing:IC.vid };

    /* Section render helper (NOT a component - avoids re-mount) */
    const renderSection = (stageKey, children) => {
      const idx = stages.indexOf(stageKey);
      const done = idx < stageIdx; const active = idx === stageIdx; const future = idx > stageIdx;
      const cfg = STAGE_CFG[stageKey];
      return (
        <div key={stageKey} style={{ marginBottom:8, borderRadius:16, border:`1.5px solid ${active ? cfg.c : done ? `${cfg.c}30` : B.border}`, background: active ? `${cfg.c}06` : B.bgCard, padding:14, opacity: future ? 0.45 : 1, position:"relative", transition:"all .3s" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom: (done||active) ? 10 : 0 }}>
            <div style={{ width:28, height:28, borderRadius:14, background: done ? cfg.c : active ? `${cfg.c}20` : `${B.muted}10`, display:"flex", alignItems:"center", justifyContent:"center", color: done ? "#fff" : active ? cfg.c : B.muted, flexShrink:0 }}>
              {done ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : <span style={{ display:"flex", transform:"scale(0.75)" }}>{stageIcon[stageKey]||IC.doc}</span>}
            </div>
            <div style={{ flex:1 }}>
              <span style={{ fontSize:13, fontWeight:700, color: active ? cfg.c : done ? B.dark : B.muted }}>{cfg.l}</span>
              <span style={{ fontSize:10, color:B.muted, marginLeft:6 }}>{stageRole[stageKey]}</span>
            </div>
            {active && <Tag color={cfg.c}>Etapa atual</Tag>}
            {future && <span style={{ fontSize:10, color:B.muted }}>🔒</span>}
          </div>
          {(done || active) && children}
        </div>
      );
    };

    return (
      <div className="pg" style={{ paddingTop: TOP }}>
        {ToastEl}
        <Head title="" onBack={() => { setSel(null); setEditMode(false); }} right={<div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={async ()=>{
            if (!confirm(`Excluir "${sel.title}"?`)) return;
            if (sel.supaId) await supaDeleteDemand(sel.supaId);
            setDemands(p=>p.filter(d=>d.id!==sel.id));
            setSel(null); setEditMode(false); showToast("Demanda excluída ✓");
          }} className="ib" style={{padding:8,border:`1.5px solid ${B.border}`}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.red} strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>} />

        {/* ═══ EDIT MODE ═══ */}
        {editMode ? (
          <Card style={{ marginBottom:14 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <p style={{ fontSize:14, fontWeight:700 }}>Editando demanda</p>
              <button onClick={()=>{setEditMode(false);showToast("Alterações salvas ✓");}} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 14px",borderRadius:8,background:B.accent,border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,color:B.textOnAccent}}>
                {IC.check} Salvar
              </button>
            </div>
            <label className="sl" style={{ display:"block", marginBottom:4 }}>Título</label>
            <input value={sel.title} onChange={e=>updateField("title",e.target.value)} className="tinput" style={{ marginBottom:10, fontWeight:700, fontSize:15 }} />

            <label className="sl" style={{ display:"block", marginBottom:4 }}>Cliente</label>
            <select value={CDATA.find(c=>c.name===sel.client)?.supaId||""} onChange={e=>{
              const cl = CDATA.find(c=>c.supaId===e.target.value);
              if (cl) { updateField("client", cl.name); if(sel.supaId) supaUpdateDemand(sel.supaId,{client_id:cl.supaId}); }
            }} className="tinput" style={{ marginBottom:10 }}>
              <option value="">Selecionar cliente</option>
              {CDATA.map(c=><option key={c.supaId||c.id} value={c.supaId||c.id}>{c.name}</option>)}
            </select>

            <label className="sl" style={{ display:"block", marginBottom:4 }}>Prioridade</label>
            <div style={{ display:"flex", gap:6, marginBottom:10 }}>
              {["baixa","média","alta"].map(p=>(
                <button key={p} onClick={()=>updateField("priority",p)} style={{ flex:1, padding:"8px 0", borderRadius:10, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, border:sel.priority===p?`2px solid ${priorityColor(p)}`:`1.5px solid ${B.border}`, background:sel.priority===p?`${priorityColor(p)}15`:B.bgCard, color:sel.priority===p?priorityColor(p):B.muted, textTransform:"capitalize" }}>{p === "alta" ? "🔴 Alta" : p === "média" ? "🟡 Média" : "🟢 Baixa"}</button>
              ))}
            </div>

            <label className="sl" style={{ display:"block", marginBottom:4 }}>Redes</label>
            <div style={{ display:"flex", gap:5, marginBottom:10, flexWrap:"wrap" }}>
              {["Instagram","Facebook","TikTok","LinkedIn","YouTube","Twitter"].map(n=>{
                const nets = sel.network ? sel.network.split(", ") : [];
                const on = nets.includes(n);
                return <button key={n} onClick={()=>{
                  const updated = on ? nets.filter(x=>x!==n) : [...nets, n];
                  updateField("network", updated.join(", "));
                }} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 10px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", border:`1.5px solid ${on?(NETWORK_CFG[n]?.c||B.accent):B.border}`, background:on?`${NETWORK_CFG[n]?.c||B.accent}10`:B.bgCard, color:on?(NETWORK_CFG[n]?.c||B.text):B.muted, fontSize:11, fontWeight:600 }}>
                  <NetworkIcon name={n} sz={14} active={on} />{n}
                </button>;
              })}
            </div>

            <label className="sl" style={{ display:"block", marginBottom:4 }}>Formato</label>
            <div style={{ display:"flex", gap:5, marginBottom:10, flexWrap:"wrap" }}>
              {["Feed","Stories","Reels","Carrossel","Shorts"].map(f=>(
                <button key={f} onClick={()=>updateField("format",f)} className={`htab${sel.format===f?" a":""}`} style={{ fontSize:11 }}>{f}</button>
              ))}
            </div>

            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>Patrocinado?</span>
              <Toggle on={sel.sponsored||false} onToggle={()=>updateField("sponsored",!sel.sponsored)} />
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <div style={{ flex:1 }}>
                <label className="sl" style={{ display:"block", marginBottom:4 }}>Data</label>
                <input value={sel.scheduling?.date||""} onChange={e=>updateField("scheduling",{...sel.scheduling,date:e.target.value})} placeholder="DD/MM" className="tinput" />
              </div>
              <div style={{ flex:1 }}>
                <label className="sl" style={{ display:"block", marginBottom:4 }}>Horário</label>
                <input value={sel.scheduling?.time||""} onChange={e=>updateField("scheduling",{...sel.scheduling,time:e.target.value})} placeholder="18:00" className="tinput" />
              </div>
            </div>

            {sel.sponsored && <div style={{ marginTop:10 }}>
              <label className="sl" style={{ display:"block", marginBottom:4 }}>Orçamento tráfego</label>
              <input value={sel.traffic?.budget||""} onChange={e=>updateField("traffic",{...sel.traffic,budget:e.target.value})} placeholder="R$ 150" className="tinput" />
            </div>}
          </Card>
        ) : (
        <div style={{ textAlign:"center", marginBottom:14 }}>
          <Av name={sel.client} sz={48} fs={18} />
          <h2 style={{ fontSize:17, fontWeight:800, marginTop:8 }}>{sel.title}</h2>
          <p style={{ fontSize:12, color:B.muted, marginTop:2 }}>{sel.client} · {typeLabel(sel.type)} · {sel.createdAt}</p>
          <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:8, flexWrap:"wrap" }}>
            <Tag color={typeColor(sel.type)}>{typeLabel(sel.type)}</Tag>
            <Tag color={curStageCfg.c}>{curStageCfg.l}</Tag>
            {sel.network && <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 10px", borderRadius:20, background:`${NETWORK_CFG[sel.network]?.c||B.blue}10`, fontSize:11, fontWeight:600, color:NETWORK_CFG[sel.network]?.c||B.blue }}>
              <NetworkIcon name={sel.network} sz={14} active />{sel.network}
            </span>}
            {sel.format && <Tag color={B.cyan}>{sel.format}</Tag>}
            {sel.sponsored && <Tag color={B.orange}>Patrocinado</Tag>}
            {sel.scheduling?.date && <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, color:B.muted, fontWeight:600 }}>📅 {sel.scheduling.date}{sel.scheduling.time ? ` às ${sel.scheduling.time}` : ""}</span>}
          </div>
          <button onClick={()=>setEditMode(true)} style={{ marginTop:12, display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:"100%", padding:"10px 0", borderRadius:12, background:`${B.accent}10`, border:`1.5px solid ${B.accent}30`, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:700, color:B.accent }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Editar demanda
          </button>
        </div>
        )}
        {/* ═══ POST PREVIEW ═══ */}
        {sel.type === "social" && (() => {
          const selNetworks = sel.network ? sel.network.split(", ") : [];
          const isSelCarousel = sel.format === "Carrossel";
          const selSlides = isSelCarousel ? parseInt(sel.steps?.briefing?.text?.match(/(\d+)\s*slide/i)?.[1]) || 5 : 0;
          const selCaption = sel.steps?.caption?.text || "";
          return (
            <Card style={{ marginBottom:10, padding:0, overflow:"hidden" }}>
              <p className="sl" style={{ padding:"12px 14px 8px" }}>Preview do post</p>
              <div style={{ margin:"0 14px", borderRadius:12, overflow:"hidden" }}>
                <PostPreview format={sel.format} client={sel.client} slides={selSlides} uploadedFiles={[...(sel.steps?.design?.files||[]), ...(sel.steps?.production?.files||[]), ...(sel.steps?.editing?.files||[])]}>
                  <div style={{ position:"absolute", top:10, left:10 }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:8, background:"rgba(0,0,0,0.55)", color:"#fff" }}>{sel.format}{isSelCarousel?` · ${selSlides} slides`:""}</span>
                  </div>
                  <div style={{ position:"absolute", top:10, right:10, display:"flex", gap:4 }}>
                    {selNetworks.map((n,ni) => (
                      <div key={ni} style={{ width:28, height:28, borderRadius:9, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        <NetworkIcon name={n.trim()} sz={15} active />
                      </div>
                    ))}
                  </div>
                </PostPreview>
              </div>
              <div style={{ padding:"12px 14px 14px" }}>
                {selCaption && <p style={{ fontSize:13, color:B.text, lineHeight:1.6, whiteSpace:"pre-wrap", marginBottom:10, maxHeight:120, overflow:"auto" }}>{selCaption}</p>}
                {sel.steps?.caption?.hashtags && <p style={{ fontSize:11, color:B.accent, marginBottom:10 }}>{sel.steps.caption.hashtags}</p>}
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center" }}>
                  {sel.scheduling?.date && <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:11, color:B.muted, fontWeight:600 }}>📅 {sel.scheduling.date}{sel.scheduling.time ? ` às ${sel.scheduling.time}` : ""}</span>}
                  {sel.traffic?.budget ? <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8, background:`${B.orange}12`, color:B.orange }}>ADS · {sel.traffic.budget}</span> : <span style={{ fontSize:10, fontWeight:600, padding:"3px 10px", borderRadius:8, background:`${B.muted}08`, color:B.muted }}>Orgânico</span>}
                </div>
              </div>
            </Card>
          );
        })()}

        {/* Stage Bar */}
        <Card style={{ marginBottom:10 }}><StageBar type={sel.type} current={sel.stage} /></Card>

        {/* Assignees */}
        <Card style={{ marginBottom:10 }}>
          <p className="sl" style={{ marginBottom:8 }}>Equipe responsável</p>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {(sel.assignees||[]).map(a=>{
              const m = AGENCY_TEAM.find(t=>t.name===a);
              return (<div key={a} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px 4px 4px", borderRadius:20, background:`${B.accent}08`, border:`1px solid ${B.accent}15` }}>
                <Av src={m?.photo} name={a} sz={24} fs={10} /><span style={{ fontSize:11, fontWeight:600 }}>{a}</span>
                {m?.role && <span style={{ fontSize:9, color:B.muted }}>· {m.role}</span>}
              </div>);
            })}
          </div>
        </Card>

        {/* ═══ CAMPAIGN DETAIL ═══ */}
        {isCampaign && sel.campaign && <>
          <Card style={{ marginBottom:8 }}>
            <p className="sl" style={{ marginBottom:6 }}>Sobre a campanha</p>
            <p style={{ fontSize:13, lineHeight:1.6 }}>{sel.campaign.desc}</p>
            {sel.campaign.refs && <><p className="sl" style={{ marginTop:10, marginBottom:4 }}>Referências</p><p style={{ fontSize:12, color:B.muted }}>{sel.campaign.refs}</p></>}
          </Card>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:8 }}>
            <Card style={{ padding:12, textAlign:"center" }}><p style={{ fontSize:9, color:B.muted, textTransform:"uppercase" }}>Início</p><p style={{ fontSize:14, fontWeight:800 }}>{sel.campaign.dateStart}</p></Card>
            <Card style={{ padding:12, textAlign:"center" }}><p style={{ fontSize:9, color:B.muted, textTransform:"uppercase" }}>Fim</p><p style={{ fontSize:14, fontWeight:800 }}>{sel.campaign.dateEnd}</p></Card>
          </div>
          <Card style={{ marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}><span style={{ color:B.green, display:"flex" }}>{IC.dollar}</span><p style={{ fontSize:13, fontWeight:600 }}>Orçamento: <span style={{ color:B.green }}>{sel.campaign.budget}</span></p></div>
            {sel.campaign.budgetBreakdown?.map((b,i)=>(<div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderTop: i?`1px solid ${B.border}`:"none" }}><span style={{ fontSize:12 }}>{b.item}</span><span style={{ fontSize:12, fontWeight:700 }}>{b.val}</span></div>))}
          </Card>
          {sel.campaign.milestones?.length > 0 && <Card style={{ marginBottom:8 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
              <p className="sl">Andamento</p>
              <span style={{ fontSize:11, fontWeight:700, color:B.accent }}>{sel.campaign.milestones.filter(m=>m.done).length}/{sel.campaign.milestones.length}</span>
            </div>
            <div style={{ height:6, borderRadius:3, background:`${B.muted}15`, marginBottom:12 }}>
              <div style={{ width:`${(sel.campaign.milestones.filter(m=>m.done).length/sel.campaign.milestones.length)*100}%`, height:"100%", borderRadius:3, background:B.green, transition:"width .4s" }} />
            </div>
            {sel.campaign.milestones.map((m,i)=>(<div key={i} onClick={() => {
              const updated = sel.campaign.milestones.map((ms,j) => j===i ? {...ms, done:!ms.done} : ms);
              const newSel = {...sel, campaign:{...sel.campaign, milestones:updated}};
              setSel(newSel);
              setDemands(prev => prev.map(x => x.id===sel.id ? newSel : x));
            }} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderTop: i?`1px solid ${B.border}`:"none", cursor:"pointer" }}>
              <div style={{ width:24, height:24, borderRadius:12, background: m.done?B.green:`${B.muted}15`, display:"flex", alignItems:"center", justifyContent:"center", transition:"all .2s", flexShrink:0 }}>{m.done && <span style={{ color:"#fff", display:"flex", transform:"scale(0.7)" }}>{IC.check}</span>}</div>
              <span style={{ fontSize:13, fontWeight: m.done?400:600, textDecoration: m.done?"line-through":"none", color: m.done?B.muted:B.text, flex:1 }}>{m.l}</span>
              {m.done && <span style={{ fontSize:10, color:B.green, fontWeight:600 }}>Concluído</span>}
            </div>))}
          </Card>}
        </>}

        {/* ═══ SOCIAL/VIDEO WORKFLOW SECTIONS ═══ */}
        {!isCampaign && <>
          <p className="sl" style={{ marginBottom:8, marginTop:4 }}>Workflow da demanda</p>

          {/* ── 1. IDEIA (Head/CEO) ── */}
          {renderSection("idea", <>
            {sel.stage === "idea" ? <>
              <label className="sl" style={{ display:"block", marginBottom:4 }}>Descreva a ideia / conceito</label>
              <textarea value={sel.steps?.idea?.text||""} onChange={e=>updateStep("idea",{text:e.target.value, by:user?.name||"Matheus", date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})})} placeholder="Ex: Post carrossel mostrando os diferenciais do produto..." className="tinput" style={{ minHeight:80, resize:"vertical" }} />
            </> : sel.steps?.idea?.text && <>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <Av name={sel.steps.idea.by} sz={22} fs={9} />
                <span style={{ fontSize:11, fontWeight:600 }}>{sel.steps.idea.by}</span>
                <span style={{ fontSize:10, color:B.muted }}>{sel.steps.idea.date}</span>
              </div>
              <p style={{ fontSize:13, lineHeight:1.6, background:B.bgCard, padding:10, borderRadius:10, border:`1px solid ${B.border}` }}>{sel.steps.idea.text}</p>
            </>}
          </>)}

          {/* ── 2. BRIEFING (Social Media → Designer) ── */}
          {renderSection("briefing", <>
            {sel.stage === "briefing" ? <>
              <div style={{ background:`${STAGE_CFG.idea.c}08`, padding:10, borderRadius:10, marginBottom:10, border:`1px solid ${STAGE_CFG.idea.c}15` }}>
                <p style={{ fontSize:10, fontWeight:700, color:STAGE_CFG.idea.c, marginBottom:4 }}>💡 Ideia do Head:</p>
                <p style={{ fontSize:12, lineHeight:1.5 }}>{sel.steps?.idea?.text || "—"}</p>
              </div>
              <label className="sl" style={{ display:"block", marginBottom:4 }}>Instruções para o Designer / Audiovisual</label>
              <textarea value={sel.steps?.briefing?.text||""} onChange={e=>updateStep("briefing",{text:e.target.value, by:user?.name||"Alice", date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})})} placeholder="Ex: 5 slides 1080x1080. Slide 1: fachada com logo. Tons quentes. Fonte: Montserrat..." className="tinput" style={{ minHeight:100, resize:"vertical" }} />
              <p style={{ fontSize:10, color:B.muted, marginTop:4 }}>Inclua: dimensões, quantidade de peças, paleta de cores, referências visuais, textos obrigatórios</p>
            </> : sel.steps?.briefing?.text && <>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <Av name={sel.steps.briefing.by} sz={22} fs={9} />
                <span style={{ fontSize:11, fontWeight:600 }}>{sel.steps.briefing.by}</span>
                <span style={{ fontSize:10, color:B.muted }}>{sel.steps.briefing.date}</span>
              </div>
              <div style={{ background:B.bgCard, padding:12, borderRadius:10, border:`1px solid ${B.border}` }}>
                <p className="sl" style={{ marginBottom:4, fontSize:10 }}>📋 Orientações para o Designer / Audiovisual:</p>
                <p style={{ fontSize:13, lineHeight:1.6, whiteSpace:"pre-line" }}>{sel.steps.briefing.text}</p>
              </div>
            </>}
          </>)}

          {/* ── 3. DESIGN (Designer/Audiovisual) ── */}
          {renderSection("design", <>
            {sel.stage === "design" ? <>
              {/* Show briefing instructions for designer to read */}
              <div style={{ background:`${STAGE_CFG.briefing.c}08`, padding:10, borderRadius:10, marginBottom:10, border:`1px solid ${STAGE_CFG.briefing.c}15` }}>
                <p style={{ fontSize:10, fontWeight:700, color:STAGE_CFG.briefing.c, marginBottom:4 }}>📋 Briefing da Social Media:</p>
                <p style={{ fontSize:12, lineHeight:1.5, whiteSpace:"pre-line" }}>{sel.steps?.briefing?.text || "—"}</p>
              </div>
              <label className="sl" style={{ display:"block", marginBottom:6 }}>
                {(sel.format==="Reels"||sel.format==="Shorts") ? "Enviar vídeo criado" : "Enviar arte criada"}
              </label>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {(sel.steps?.design?.files||[]).map((f,i) => {
                  const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.name || f);
                  const isVid = /\.(mp4|mov|avi|webm)$/i.test(f.name || f);
                  const fName = f.name || f;
                  const fUrl = f.url || null;
                  return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:`${B.pink}06`, borderRadius:10, border:`1px solid ${B.pink}15` }}>
                    {isImg && fUrl ? <img src={fUrl} alt="" style={{ width:40, height:40, borderRadius:8, objectFit:"cover" }} /> :
                     isVid ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={B.pink} strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> :
                     <span style={{ color:B.pink, display:"flex" }}>{IC.img}</span>}
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fName}</p>
                      {f.size && <p style={{ fontSize:9, color:B.muted }}>{f.size > 1048576 ? `${(f.size/1048576).toFixed(1)} MB` : `${(f.size/1024).toFixed(0)} KB`}</p>}
                    </div>
                    {fUrl && <a href={fUrl} target="_blank" rel="noopener" style={{ color:B.accent, display:"flex", cursor:"pointer" }} onClick={e=>e.stopPropagation()}>{IC.download}</a>}
                    <button onClick={async () => { if (f.path) await supaDeleteFile(f.path); const nf = [...(sel.steps?.design?.files||[])]; nf.splice(i,1); updateStep("design",{files:nf}); }} style={{ background:"none", border:"none", cursor:"pointer", color:B.red, display:"flex" }}>{IC.x}</button>
                  </div>
                  );
                })}
                <input type="file" id="designUpload" multiple accept="image/*,video/*,.psd,.ai,.pdf,.prproj,.aep" style={{ display:"none" }} onChange={async (e)=>{
                  const files = Array.from(e.target.files);
                  if (!files.length) return;
                  showToast(`Enviando ${files.length} arquivo${files.length>1?"s":""}...`);
                  const uploaded = [];
                  for (const file of files) {
                    const result = await supaUploadFile(file, sel.supaId || sel.id);
                    if (result.error) { showToast(`❌ ${file.name}: ${result.error}`); }
                    else uploaded.push(result);
                  }
                  if (uploaded.length > 0) {
                    updateStep("design", { files: [...(sel.steps?.design?.files||[]), ...uploaded], by: user?.name||"Victoria", date: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) });
                    showToast(`${uploaded.length} arquivo${uploaded.length>1?"s":""} enviado${uploaded.length>1?"s":""}! ✓`);
                  }
                  e.target.value = "";
                }} />
                <button onClick={()=>document.getElementById("designUpload").click()} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px", borderRadius:12, border:`2px dashed ${B.pink}40`, background:`${B.pink}04`, cursor:"pointer", color:B.pink, fontSize:12, fontWeight:600, fontFamily:"inherit" }}>
                  {IC.upload} Selecionar arquivos
                </button>
              </div>
              <p style={{ fontSize:10, color:B.muted, marginTop:4 }}>Imagens, vídeos, PSD, AI — múltiplos arquivos</p>
            </> : sel.steps?.design?.files?.length > 0 && <>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <Av name={sel.steps.design.by||"Designer"} sz={22} fs={9} />
                <span style={{ fontSize:11, fontWeight:600 }}>{sel.steps.design.by||"Designer"}</span>
                <span style={{ fontSize:10, color:B.muted }}>{sel.steps.design.date}</span>
              </div>
              {/* Thumbnail grid for images */}
              {sel.steps.design.files.some(f => f.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name||"")) && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:8 }}>
                  {sel.steps.design.files.filter(f => f.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name||"")).map((f,i) => (
                    <a key={i} href={f.url} target="_blank" rel="noopener" style={{ display:"block", borderRadius:10, overflow:"hidden", aspectRatio:"4/5", border:`1px solid ${B.border}` }}>
                      <img src={f.url} alt={f.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                    </a>
                  ))}
                </div>
              )}
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {sel.steps.design.files.map((f,i)=>{
                  const fName = f.name || f;
                  const fUrl = f.url || null;
                  const isVid = /\.(mp4|mov|avi|webm)$/i.test(fName);
                  return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:`${B.pink}06`, borderRadius:10, border:`1px solid ${B.pink}15` }}>
                    {isVid ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.pink} strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> :
                     <span style={{ color:B.pink, display:"flex" }}>{IC.img}</span>}
                    <span style={{ fontSize:12, fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fName}</span>
                    {fUrl && <a href={fUrl} target="_blank" rel="noopener" style={{ color:B.accent, display:"flex", cursor:"pointer" }}>{IC.download}</a>}
                  </div>);
                })}
              </div>
            </>}
          </>)}

          {/* ── 3b. PRODUÇÃO (Vídeo — Audiovisual) ── */}
          {sel.type === "video" && renderSection("production", <>
            {sel.stage === "production" ? <>
              {sel.steps?.briefing?.text && <div style={{ background:`${STAGE_CFG.briefing.c}08`, padding:10, borderRadius:10, marginBottom:10, border:`1px solid ${STAGE_CFG.briefing.c}15` }}>
                <p style={{ fontSize:10, fontWeight:700, color:STAGE_CFG.briefing.c, marginBottom:4 }}>📋 Briefing:</p>
                <p style={{ fontSize:12, lineHeight:1.5, whiteSpace:"pre-line" }}>{sel.steps?.briefing?.text || "—"}</p>
              </div>}
              <label className="sl" style={{ display:"block", marginBottom:6 }}>Enviar material gravado</label>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {(sel.steps?.production?.files||[]).map((f,i) => {
                  const fName = f.name || f;
                  const fUrl = f.url || null;
                  const isVid = /\.(mp4|mov|avi|webm)$/i.test(fName);
                  const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(fName);
                  return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:`${B.orange}06`, borderRadius:10, border:`1px solid ${B.orange}15` }}>
                    {isImg && fUrl ? <img src={fUrl} alt="" style={{ width:40, height:40, borderRadius:8, objectFit:"cover" }} /> :
                     isVid ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={B.orange} strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> :
                     <span style={{ color:B.orange, display:"flex" }}>{IC.img}</span>}
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fName}</p>
                      {f.size && <p style={{ fontSize:9, color:B.muted }}>{(f.size/1024/1024).toFixed(1)} MB</p>}
                    </div>
                    {fUrl && <a href={fUrl} target="_blank" rel="noopener" style={{ color:B.accent, display:"flex", cursor:"pointer" }} onClick={e=>e.stopPropagation()}>{IC.download}</a>}
                    <button onClick={async () => { if (f.path) await supaDeleteFile(f.path); const nf = [...(sel.steps?.production?.files||[])]; nf.splice(i,1); updateStep("production",{files:nf}); }} style={{ background:"none", border:"none", cursor:"pointer", color:B.red, display:"flex" }}>{IC.x}</button>
                  </div>);
                })}
                <input type="file" id="productionUpload" multiple accept="video/*,image/*,.prproj,.aep" style={{ display:"none" }} onChange={async (e)=>{
                  const files = Array.from(e.target.files);
                  if (!files.length) return;
                  showToast(`Enviando ${files.length} arquivo${files.length>1?"s":""}...`);
                  const uploaded = [];
                  for (const file of files) {
                    const result = await supaUploadFile(file, sel.supaId || sel.id);
                    if (result.error) { showToast(`❌ ${file.name}: ${result.error}`); }
                    else uploaded.push(result);
                  }
                  if (uploaded.length > 0) {
                    updateStep("production", { files: [...(sel.steps?.production?.files||[]), ...uploaded], by: user?.name||"Victoria", date: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) });
                    showToast(`${uploaded.length} arquivo${uploaded.length>1?"s":""} enviado${uploaded.length>1?"s":""}! ✓`);
                  }
                  e.target.value = "";
                }} />
                <button onClick={()=>document.getElementById("productionUpload").click()} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px", borderRadius:12, border:`2px dashed ${B.orange}40`, background:`${B.orange}04`, cursor:"pointer", color:B.orange, fontSize:12, fontWeight:600, fontFamily:"inherit" }}>
                  {IC.upload} Selecionar vídeos / fotos
                </button>
              </div>
              <p style={{ fontSize:10, color:B.muted, marginTop:4 }}>MP4, MOV, JPG, PNG, Premiere, After Effects</p>
            </> : sel.steps?.production?.files?.length > 0 && <>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <Av name={sel.steps.production.by||"Audiovisual"} sz={22} fs={9} />
                <span style={{ fontSize:11, fontWeight:600 }}>{sel.steps.production.by||"Audiovisual"}</span>
                <span style={{ fontSize:10, color:B.muted }}>{sel.steps.production.date}</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {sel.steps.production.files.map((f,i)=>{
                  const fName = f.name || f; const fUrl = f.url || null;
                  return (<div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:`${B.orange}06`, borderRadius:10, border:`1px solid ${B.orange}15` }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.orange} strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                    <span style={{ fontSize:12, fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fName}</span>
                    {fUrl && <a href={fUrl} target="_blank" rel="noopener" style={{ color:B.accent, display:"flex", cursor:"pointer" }}>{IC.download}</a>}
                  </div>);
                })}
              </div>
            </>}
          </>)}

          {/* ── 3c. EDIÇÃO (Vídeo — Editor) ── */}
          {sel.type === "video" && renderSection("editing", <>
            {sel.stage === "editing" ? <>
              {sel.steps?.production?.files?.length > 0 && <div style={{ background:`${B.orange}06`, padding:10, borderRadius:10, marginBottom:10, border:`1px solid ${B.orange}15` }}>
                <p style={{ fontSize:10, fontWeight:700, color:B.orange, marginBottom:6 }}>🎬 Material gravado:</p>
                {sel.steps.production.files.map((f,i)=>(<div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginTop:i?4:0 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={B.orange} strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg><span style={{ fontSize:12, fontWeight:600 }}>{f.name||f}</span></div>))}
              </div>}
              <label className="sl" style={{ display:"block", marginBottom:4 }}>Notas de edição</label>
              <textarea value={sel.steps?.editing?.text||""} onChange={e=>updateStep("editing",{text:e.target.value, by:user?.name||"Allan", date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})})} placeholder="Cortes, transições, trilha sonora, legendas..." className="tinput" style={{ minHeight:80, resize:"vertical" }} />
              <label className="sl" style={{ display:"block", marginBottom:6, marginTop:10 }}>Enviar vídeo editado</label>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {(sel.steps?.editing?.files||[]).map((f,i) => {
                  const fName = f.name || f; const fUrl = f.url || null;
                  return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:`${B.cyan}06`, borderRadius:10, border:`1px solid ${B.cyan}15` }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={B.cyan} strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{fName}</p>
                      {f.size && <p style={{ fontSize:9, color:B.muted }}>{(f.size/1024/1024).toFixed(1)} MB</p>}
                    </div>
                    {fUrl && <a href={fUrl} target="_blank" rel="noopener" style={{ color:B.accent, display:"flex", cursor:"pointer" }} onClick={e=>e.stopPropagation()}>{IC.download}</a>}
                    <button onClick={async () => { if (f.path) await supaDeleteFile(f.path); const nf = [...(sel.steps?.editing?.files||[])]; nf.splice(i,1); updateStep("editing",{files:nf}); }} style={{ background:"none", border:"none", cursor:"pointer", color:B.red, display:"flex" }}>{IC.x}</button>
                  </div>);
                })}
                <input type="file" id="editingUpload" multiple accept="video/*,.prproj,.aep" style={{ display:"none" }} onChange={async (e)=>{
                  const files = Array.from(e.target.files);
                  if (!files.length) return;
                  showToast(`Enviando ${files.length} arquivo${files.length>1?"s":""}...`);
                  const uploaded = [];
                  for (const file of files) {
                    const result = await supaUploadFile(file, sel.supaId || sel.id);
                    if (result.error) { showToast(`❌ ${file.name}: ${result.error}`); }
                    else uploaded.push(result);
                  }
                  if (uploaded.length > 0) {
                    updateStep("editing", { files: [...(sel.steps?.editing?.files||[]), ...uploaded], by: user?.name||"Allan", date: new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) });
                    showToast(`${uploaded.length} arquivo${uploaded.length>1?"s":""} enviado${uploaded.length>1?"s":""}! ✓`);
                  }
                  e.target.value = "";
                }} />
                <button onClick={()=>document.getElementById("editingUpload").click()} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"14px", borderRadius:12, border:`2px dashed ${B.cyan}40`, background:`${B.cyan}04`, cursor:"pointer", color:B.cyan, fontSize:12, fontWeight:600, fontFamily:"inherit" }}>
                  {IC.upload} Enviar vídeo editado
                </button>
              </div>
            </> : sel.steps?.editing?.text && <>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <Av name={sel.steps.editing.by||"Editor"} sz={22} fs={9} />
                <span style={{ fontSize:11, fontWeight:600 }}>{sel.steps.editing.by||"Editor"}</span>
                <span style={{ fontSize:10, color:B.muted }}>{sel.steps.editing.date}</span>
              </div>
              <p style={{ fontSize:12, lineHeight:1.5, whiteSpace:"pre-line" }}>{sel.steps.editing.text}</p>
              {sel.steps?.editing?.files?.length > 0 && <div style={{ display:"flex", flexDirection:"column", gap:4, marginTop:6 }}>
                {sel.steps.editing.files.map((f,i)=>{
                  const fName = f.name||f; const fUrl = f.url||null;
                  return (<div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:`${B.cyan}06`, borderRadius:10, border:`1px solid ${B.cyan}15` }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.cyan} strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                    <span style={{ fontSize:12, fontWeight:600, flex:1 }}>{fName}</span>
                    {fUrl && <a href={fUrl} target="_blank" rel="noopener" style={{ color:B.accent, display:"flex", cursor:"pointer" }}>{IC.download}</a>}
                  </div>);
                })}
              </div>}
            </>}
          </>)}

          {/* ── 4. LEGENDA (Social Media) ── */}
          {renderSection("caption", <>
            {sel.stage === "caption" ? <>
              {/* Show design files for reference */}
              {sel.steps?.design?.files?.length > 0 && <div style={{ background:`${B.pink}06`, padding:10, borderRadius:10, marginBottom:10, border:`1px solid ${B.pink}15` }}>
                <p style={{ fontSize:10, fontWeight:700, color:B.pink, marginBottom:6 }}>🎨 Material do Designer:</p>
                {sel.steps.design.files.map((f,i)=>(<div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginTop:i?4:0 }}><span style={{ color:B.pink, display:"flex", transform:"scale(0.8)" }}>{IC.img}</span><span style={{ fontSize:12, fontWeight:600 }}>{f.name||f}</span>{f.url && <a href={f.url} target="_blank" rel="noopener" style={{color:B.accent,display:"flex",transform:"scale(0.8)"}}>{IC.download}</a>}</div>))}
              </div>}
              <label className="sl" style={{ display:"block", marginBottom:4 }}>Legenda do post</label>
              <textarea value={sel.steps?.caption?.text||""} onChange={e=>updateStep("caption",{text:e.target.value, by:user?.name||"Alice", date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})})} placeholder="Escreva a legenda do post..." className="tinput" style={{ minHeight:100, resize:"vertical" }} />
              <label className="sl" style={{ display:"block", marginBottom:4, marginTop:8 }}>Hashtags</label>
              <input value={sel.steps?.caption?.hashtags||""} onChange={e=>updateStep("caption",{hashtags:e.target.value})} placeholder="#marketing #petropolis" className="tinput" />
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginTop:10 }}>
                <div><label className="sl" style={{ display:"block", marginBottom:4 }}>Data</label><input type="text" value={sel.scheduling?.date||""} onChange={e=>updateField("scheduling",{...sel.scheduling,date:e.target.value})} placeholder="DD/MM" className="tinput" /></div>
                <div><label className="sl" style={{ display:"block", marginBottom:4 }}>Horário</label><input type="text" value={sel.scheduling?.time||""} onChange={e=>updateField("scheduling",{...sel.scheduling,time:e.target.value})} placeholder="18:00" className="tinput" /></div>
              </div>
              {sel.sponsored && <div style={{ marginTop:8 }}><label className="sl" style={{ display:"block", marginBottom:4 }}>Orçamento do boost</label><input value={sel.traffic?.budget||""} onChange={e=>updateField("traffic",{...sel.traffic,budget:e.target.value})} placeholder="R$ 150" className="tinput" /></div>}
            </> : sel.steps?.caption?.text && <>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <Av name={sel.steps.caption.by} sz={22} fs={9} />
                <span style={{ fontSize:11, fontWeight:600 }}>{sel.steps.caption.by}</span>
                <span style={{ fontSize:10, color:B.muted }}>{sel.steps.caption.date}</span>
              </div>
              <div style={{ background:B.bgCard, padding:12, borderRadius:10, border:`1px solid ${B.border}` }}>
                <p style={{ fontSize:13, lineHeight:1.6, whiteSpace:"pre-line" }}>{sel.steps.caption.text}</p>
                {sel.steps.caption.hashtags && <p style={{ fontSize:11, color:B.blue, marginTop:6 }}>{sel.steps.caption.hashtags}</p>}
              </div>
              {sel.steps?.design?.files?.length > 0 && <div style={{ marginTop:8 }}>
                <p style={{ fontSize:10, color:B.muted, marginBottom:4 }}>📎 Material do designer:</p>
                {sel.steps.design.files.map((f,i) => (<span key={i} style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:8, background:`${B.pink}08`, fontSize:10, fontWeight:600, color:B.pink, marginRight:4 }}>{IC.img} {f}</span>))}
              </div>}
              {sel.scheduling?.date && <div style={{ display:"flex", gap:10, marginTop:10, padding:10, background:`${B.accent}06`, borderRadius:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ color:B.accent, display:"flex" }}>{IC.calendar(B.accent)}</span><span style={{ fontSize:12, fontWeight:600 }}>{sel.scheduling.date}</span></div>
                <div style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ color:B.accent, display:"flex" }}>{IC.clock}</span><span style={{ fontSize:12, fontWeight:600 }}>{sel.scheduling.time}</span></div>
                {sel.network && <div style={{ display:"flex", alignItems:"center", gap:4 }}><NetworkIcon name={sel.network} sz={14} active /><span style={{ fontSize:12, fontWeight:600, color:NETWORK_CFG[sel.network]?.c }}>{sel.network}</span></div>}
              </div>}
            </>}
          </>)}

          {/* ── 5. REVISÃO INTERNA (Gerente) ── */}
          {renderSection("review", <>
            {sel.stage === "review" ? <>
              <label className="sl" style={{ display:"block", marginBottom:4 }}>Observação (opcional)</label>
              <input value={sel.steps?.review?.note||""} onChange={e=>updateStep("review",{note:e.target.value})} placeholder="Feedback sobre o material..." className="tinput" style={{ marginBottom:10 }} />
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => { updateStep("review",{status:"approved",by:user?.name||"Matheus",date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}); setTimeout(()=>advanceStage(sel),100); }} style={{ flex:1, padding:"12px 0", borderRadius:14, background:B.green, color:"#fff", border:"none", fontFamily:"inherit", fontSize:13, fontWeight:700, cursor:"pointer" }}>✓ Aprovar</button>
                <button onClick={() => rejectToStage(sel,"design")} style={{ flex:1, padding:"12px 0", borderRadius:14, background:B.orange, color:"#fff", border:"none", fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer" }}>↩ Arte</button>
                <button onClick={() => rejectToStage(sel,"caption")} style={{ flex:1, padding:"12px 0", borderRadius:14, background:B.red, color:"#fff", border:"none", fontFamily:"inherit", fontSize:12, fontWeight:700, cursor:"pointer" }}>↩ Legenda</button>
              </div>
            </> : sel.steps?.review?.status && <>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
                <Tag color={sel.steps.review.status==="approved"?B.green:B.red}>{sel.steps.review.status==="approved"?"✓ Aprovado":"✗ Reprovado"}</Tag>
                <span style={{ fontSize:11, color:B.muted }}>{sel.steps.review.by} · {sel.steps.review.date}</span>
              </div>
              {sel.steps.review.note && <p style={{ fontSize:12, fontStyle:"italic", color:B.muted, padding:8, background:B.bgCard, borderRadius:8, border:`1px solid ${B.border}` }}>"{sel.steps.review.note}"</p>}
            </>}
          </>)}

          {/* ── 6. APROVAÇÃO CLIENTE ── */}
          {renderSection("client", <>
            {sel.stage === "client" ? <>
              <div style={{ textAlign:"center", padding:16 }}>
                <div style={{ width:44, height:44, borderRadius:22, background:`${B.green}12`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={B.green} strokeWidth="2" strokeLinecap="round"><path d="M22 2L11 13"/><path d="M22 2L15 22l-4-9-9-4z"/></svg>
                </div>
                <p style={{ fontSize:14, fontWeight:700, color:B.text }}>Enviado para o cliente</p>
                <p style={{ fontSize:12, color:B.muted, marginTop:4, lineHeight:1.5 }}>A demanda foi enviada para aprovação no app do cliente. Aguardando resposta.</p>
                <div style={{ display:"inline-flex", alignItems:"center", gap:6, marginTop:12, padding:"6px 14px", borderRadius:20, background:`${B.accent}08`, border:`1px solid ${B.accent}15` }}>
                  <div style={{ width:8, height:8, borderRadius:4, background:B.orange, animation:"skPulse 1.5s ease infinite" }} />
                  <span style={{ fontSize:11, fontWeight:600, color:B.orange }}>Aguardando aprovação</span>
                </div>
              </div>
            </> : sel.steps?.client?.status && sel.steps.client.status !== "pending" && <>
              <Tag color={sel.steps.client.status==="approved"?B.green:B.red}>{sel.steps.client.status==="approved"?"✓ Aprovado pelo cliente":"✗ Cliente pediu ajustes"}</Tag>
              {sel.steps.client.note && <p style={{ fontSize:12, fontStyle:"italic", color:B.muted, marginTop:6, padding:8, background:B.bgCard, borderRadius:8, border:`1px solid ${B.border}` }}>"{sel.steps.client.note}"</p>}
            </>}
          </>)}

          {/* ── 7. PUBLICADO ── */}
          {renderSection("published", <>
            {sel.stage === "published" && <div style={{ textAlign:"center", padding:12 }}>
              <div style={{ width:48, height:48, borderRadius:24, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 8px", color:B.accent }}>{IC.check}</div>
              <p style={{ fontSize:14, fontWeight:700, color:B.green }}>Post publicado!</p>
              {sel.scheduling?.date && <p style={{ fontSize:12, color:B.muted, marginTop:4 }}>{sel.scheduling.date} às {sel.scheduling.time} · {sel.network}</p>}
            </div>}
          </>)}
        </>}

        {/* Action buttons — only for non-review/client stages */}
        {!isCampaign && sel.stage !== "published" && sel.stage !== "review" && sel.stage !== "client" && <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <button onClick={() => advanceStage(sel)} className="pill full accent">
            Avançar → {STAGE_CFG[stages[stageIdx+1]]?.l || ""}
          </button>
        </div>}

        {/* Campaign action buttons */}
        {isCampaign && sel.stage !== "completed" && <div style={{ display:"flex", gap:8, marginTop:12 }}>
          <button onClick={() => advanceStage(sel)} className="pill full accent">
            Avançar → {STAGE_CFG[stages[stageIdx+1]]?.l || ""}
          </button>
        </div>}
        <div style={{ height:20 }} />
      </div>
    );
  }

  /* ── MAIN LIST ── */
  return (
    <div className="pg" style={{ paddingTop: TOP }}>
      {ToastEl}
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, paddingTop:8 }}>
        <h2 style={{ fontSize:18, fontWeight:800, flex:1 }}>Demandas</h2>
        <Tag color={B.orange}>{pendingCount} em andamento</Tag>
        <button onClick={() => setCreating(true)} style={{ width:36, height:36, borderRadius:12, background:B.accent, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{IC.plus}</button>
      </div>

      {/* Client selector */}
      <div style={{ marginBottom:10 }}>
        <button onClick={() => setShowClientPicker(!showClientPicker)} style={{
          width:"100%", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:12, border:`1.5px solid ${clientFilter !== "all" ? B.accent : B.border}`,
          background: clientFilter !== "all" ? `${B.accent}06` : B.bgCard, cursor:"pointer", fontFamily:"inherit", transition:"all .2s",
        }}>
          {clientFilter !== "all" ? <Av name={clientFilter} sz={28} fs={11} /> : <span style={{ width:28, height:28, borderRadius:14, background:`${B.muted}10`, display:"flex", alignItems:"center", justifyContent:"center", color:B.muted }}>{IC.clients(B.muted)}</span>}
          <div style={{ flex:1, textAlign:"left" }}>
            <p style={{ fontSize:13, fontWeight:600, color:B.text }}>{clientFilter !== "all" ? clientFilter : "Todos os clientes"}</p>
            {clientFilter !== "all" && <p style={{ fontSize:10, color:B.muted }}>{demands.filter(d=>d.client===clientFilter).length} demandas</p>}
          </div>
          {clientFilter !== "all" && <button onClick={e => { e.stopPropagation(); setClientFilter("all"); setShowClientPicker(false); }} style={{ background:"none", border:"none", cursor:"pointer", color:B.muted, display:"flex", padding:4 }}>{IC.x}</button>}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2" strokeLinecap="round" style={{ transform: showClientPicker ? "rotate(180deg)" : "none", transition:"transform .2s" }}><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        {showClientPicker && <Card style={{ marginTop:4, padding:6, maxHeight:200, overflowY:"auto" }}>
          <div onClick={() => { setClientFilter("all"); setShowClientPicker(false); }} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:10, cursor:"pointer", background: clientFilter==="all" ? `${B.accent}08` : "transparent" }}>
            <span style={{ width:28, height:28, borderRadius:14, background:`${B.accent}10`, display:"flex", alignItems:"center", justifyContent:"center", color:B.accent }}>{IC.clients(B.accent)}</span>
            <span style={{ fontSize:13, fontWeight:600, color:B.text }}>Todos os clientes</span>
            <span style={{ fontSize:10, color:B.muted, marginLeft:"auto" }}>{demands.length}</span>
          </div>
          {uniqueClients.map(c => (
            <div key={c} onClick={() => { setClientFilter(c); setShowClientPicker(false); }} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:10, cursor:"pointer", background: clientFilter===c ? `${B.accent}08` : "transparent" }}>
              <Av name={c} sz={28} fs={11} />
              <span style={{ fontSize:13, fontWeight:600, color:B.text }}>{c}</span>
              <span style={{ fontSize:10, color:B.muted, marginLeft:"auto" }}>{demands.filter(d=>d.client===c).length}</span>
            </div>
          ))}
        </Card>}
      </div>

      {/* Type tabs + Date filter row */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{ flex:1, display:"flex", gap:6, overflowX:"auto" }}>
          {[{k:"all",l:"Todos"},{k:"social",l:"Posts"},{k:"campaign",l:"Campanhas"},{k:"video",l:"Vídeo"}].map(f=>(
            <button key={f.k} onClick={()=>setFilter(f.k)} className={`htab${filter===f.k?" a":""}`} style={{ fontSize:11, whiteSpace:"nowrap" }}>{f.l}</button>
          ))}
        </div>
        <button onClick={() => setShowCalendar(v => !v)} style={{
          width:36, height:36, borderRadius:12, border:`1.5px solid ${dateFilter ? B.accent : B.border}`, background: dateFilter ? `${B.accent}08` : B.bgCard,
          cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", position:"relative", flexShrink:0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dateFilter ? B.accent : B.muted} strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {dateFilter && <div style={{ position:"absolute", top:-4, right:-4, width:16, height:16, borderRadius:8, background:B.red, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={e => { e.stopPropagation(); setDateFilter(""); setShowCalendar(false); }}>
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>}
        </button>
      </div>

      {/* Calendar dropdown */}
      {showCalendar && (() => {
        const today = new Date();
        const cm = calMonth ?? today.getMonth();
        const cy = calYear ?? today.getFullYear();
        const firstDay = new Date(cy, cm, 1).getDay();
        const daysInMonth = new Date(cy, cm + 1, 0).getDate();
        const monthNames = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        const pad = n => String(n).padStart(2, "0");
        const cells = [];
        for (let i = 0; i < firstDay; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);

        /* Check which days have demands */
        const daysWithDemands = new Set();
        demands.forEach(dm => {
          const [dd, mm] = (dm.createdAt||"").split("/");
          if (parseInt(mm) === cm + 1) daysWithDemands.add(parseInt(dd));
        });

        return (
          <Card style={{ marginBottom:10, padding:12 }}>
            {/* Month nav */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <button onClick={() => { if (cm === 0) { setCalMonth(11); setCalYear(cy - 1); } else { setCalMonth(cm - 1); setCalYear(cy); } }} style={{ width:32, height:32, borderRadius:10, border:`1px solid ${B.border}`, background:B.bgCard, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontSize:14, fontWeight:700, color:B.text }}>{monthNames[cm]} {cy}</span>
              <button onClick={() => { if (cm === 11) { setCalMonth(0); setCalYear(cy + 1); } else { setCalMonth(cm + 1); setCalYear(cy); } }} style={{ width:32, height:32, borderRadius:10, border:`1px solid ${B.border}`, background:B.bgCard, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            {/* Day headers */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2, marginBottom:4 }}>
              {["D","S","T","Q","Q","S","S"].map((d,i) => (
                <div key={i} style={{ textAlign:"center", fontSize:10, fontWeight:600, color:B.muted, padding:"4px 0" }}>{d}</div>
              ))}
            </div>
            {/* Day grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7, 1fr)", gap:2 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={`e${i}`} />;
                const dateStr = `${cy}-${pad(cm+1)}-${pad(day)}`;
                const isSelected = dateFilter === dateStr;
                const isToday = day === today.getDate() && cm === today.getMonth() && cy === today.getFullYear();
                const hasDemand = daysWithDemands.has(day);
                return (
                  <button key={i} onClick={() => { setDateFilter(isSelected ? "" : dateStr); if (!isSelected) setShowCalendar(false); }} style={{
                    width:"100%", aspectRatio:"1", borderRadius:10, border: isSelected ? `2px solid ${B.accent}` : isToday ? `1.5px solid ${B.accent}40` : "1.5px solid transparent",
                    background: isSelected ? B.accent : "transparent", color: isSelected ? B.dark : B.dark,
                    fontSize:12, fontWeight: isSelected || isToday ? 700 : 400, cursor:"pointer", fontFamily:"inherit",
                    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, position:"relative",
                  }}>
                    {day}
                    {hasDemand && !isSelected && <div style={{ width:4, height:4, borderRadius:2, background:B.accent }} />}
                  </button>
                );
              })}
            </div>
            {/* Quick actions */}
            <div style={{ display:"flex", gap:6, marginTop:10 }}>
              <button onClick={() => { setCalMonth(today.getMonth()); setCalYear(today.getFullYear()); setDateFilter(`${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`); setShowCalendar(false); }} style={{ flex:1, padding:"8px 0", borderRadius:10, border:`1px solid ${B.border}`, background:B.bgCard, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:B.text }}>Hoje</button>
              <button onClick={() => { setDateFilter(""); setShowCalendar(false); }} style={{ flex:1, padding:"8px 0", borderRadius:10, border:`1px solid ${B.border}`, background:B.bgCard, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit", color:B.muted }}>Limpar</button>
            </div>
          </Card>
        );
      })()}

      {/* Active filters summary */}
      {(clientFilter !== "all" || dateFilter) && <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        <span style={{ fontSize:10, color:B.muted }}>Filtros:</span>
        {clientFilter !== "all" && <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:8, background:`${B.accent}10`, fontSize:10, fontWeight:600, color:B.accent }}>
          {clientFilter} <button onClick={()=>setClientFilter("all")} style={{ background:"none", border:"none", cursor:"pointer", color:B.accent, display:"flex", padding:0 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </span>}
        {dateFilter && <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 8px", borderRadius:8, background:`${B.accent}10`, fontSize:10, fontWeight:600, color:B.accent }}>
          {dateFilter.split("-").reverse().join("/")} <button onClick={()=>setDateFilter("")} style={{ background:"none", border:"none", cursor:"pointer", color:B.accent, display:"flex", padding:0 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </span>}
        <span style={{ fontSize:10, color:B.muted }}>· {filtered.length} resultado{filtered.length!==1?"s":""}</span>
      </div>}

      {/* Empty state */}
      {filtered.length === 0 && <Card style={{ textAlign:"center", padding:32 }}>
        <div style={{ width:48, height:48, borderRadius:24, background:`${B.muted}10`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", color:B.muted }}>{IC.search(B.muted)}</div>
        <p style={{ fontSize:14, fontWeight:700, color:B.text }}>Nenhuma demanda encontrada</p>
        <p style={{ fontSize:12, color:B.muted, marginTop:4 }}>Tente ajustar os filtros ou criar uma nova demanda.</p>
      </Card>}
      {filtered.map((d,i) => {
        const isDone = ["published","completed"].includes(d.stage);
        const pColor = priorityColor(d.priority);
        const stages = getStages(d.type);
        const stageIdx = stages.indexOf(d.stage);
        const stageTotal = stages.length;
        const caption = d.steps?.caption?.text || "";
        const networks = d.network ? d.network.split(", ") : [];
        const isCarousel = d.format === "Carrossel";
        const slides = isCarousel ? parseInt(d.steps?.briefing?.text?.match(/(\d+)\s*slide/i)?.[1]) || 5 : 0;
        const schedDate = d.scheduling?.date;
        const schedTime = d.scheduling?.time;
        const hasBudget = !!d.traffic?.budget;
        /* Mock image colors per client */
        const clientColors = {"Casa Nova Imóveis":["#1a5276","#2e86c1"],"Bella Estética":["#6c3483","#af7ac5"],"TechSmart":["#1b4f72","#2980b9"],"Padaria Real":["#7e5109","#d4ac0d"],"Studio Fitness":["#1e8449","#2ecc71"]};
        const [cA,cB] = clientColors[d.client] || [B.dark, B.accent];

        return (
        <Card key={d.id} delay={i*0.03} onClick={() => {setSel(d);setEditMode(false);}} style={{ marginTop:i?10:0, cursor:"pointer", position:"relative", overflow:"hidden", padding:0 }}>
          {isDone && <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.55)", backdropFilter:"blur(2px)", WebkitBackdropFilter:"blur(2px)", zIndex:2, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 18px", borderRadius:20, background:B.green, color:"#fff" }}>
              {IC.check}<span style={{ fontSize:13, fontWeight:700 }}>Concluído</span>
            </div>
          </div>}

          {/* ── Post Preview Image / Carousel ── */}
          {d.type === "social" && (
            <div style={{ position:"relative", borderRadius:"16px 16px 0 0", overflow:"hidden" }}>
              <PostPreview format={d.format} client={d.client} slides={slides} compact uploadedFiles={[...(d.steps?.design?.files||[]), ...(d.steps?.production?.files||[]), ...(d.steps?.editing?.files||[])]}>
                {/* Format badge overlay */}
                <div style={{ position:"absolute", top:10, left:10, display:"flex", gap:4 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8, background:"rgba(0,0,0,0.55)", color:"#fff", backdropFilter:"blur(6px)" }}>{d.format}{isCarousel?` · ${slides}`:""}</span>
                </div>
              </PostPreview>
              {/* Priority badge overlay */}
              <span style={{ position:"absolute", top:10, right:10, fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8, background:`${pColor}dd`, color:"#fff" }}>{d.priority === "alta" ? "🔴 Alta" : d.priority === "média" ? "🟡 Média" : "🟢 Baixa"}</span>
              {/* Network icons overlay */}
              <div style={{ position:"absolute", bottom:10, left:10, display:"flex", gap:4 }}>
                {networks.map((n,ni) => (
                  <div key={ni} style={{ width:26, height:26, borderRadius:8, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(6px)" }}>
                    <NetworkIcon name={n.trim()} sz={14} active />
                  </div>
                ))}
              </div>
              {/* Ads badge overlay */}
              {hasBudget && <div style={{ position:"absolute", bottom:10, right:10, display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:8, background:"rgba(0,0,0,0.55)", backdropFilter:"blur(6px)" }}>
                <span style={{ fontSize:10, fontWeight:700, color:B.orange }}>ADS</span>
                <span style={{ fontSize:10, color:"#fff", fontWeight:600 }}>{d.traffic.budget}</span>
              </div>}
            </div>
          )}

          {/* ── Video preview with uploaded media ── */}
          {d.type === "video" && (() => {
            const vFiles = [...(d.steps?.design?.files||[]), ...(d.steps?.editing?.files||[]), ...(d.steps?.production?.files||[])];
            const firstImg = vFiles.find(f => f.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name||""));
            const firstVid = vFiles.find(f => f.url && /\.(mp4|mov|webm)$/i.test(f.name||""));
            if (!firstImg && !firstVid) return null;
            return (
              <div style={{ position:"relative", borderRadius:"16px 16px 0 0", overflow:"hidden", aspectRatio:"9/16", background:`linear-gradient(135deg, ${cA} 0%, ${cB} 100%)` }}>
                {firstImg ? <img src={firstImg.url} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} /> :
                 firstVid ? <video src={firstVid.url+"#t=0.1"} style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} preload="metadata" muted playsInline /> : null}
                <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.2)" }}>
                  <div style={{ width:48, height:48, borderRadius:"50%", background:"rgba(255,255,255,0.95)", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="#111" style={{ marginLeft:3 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                </div>
                <span style={{ position:"absolute", top:10, left:10, fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8, background:"rgba(0,0,0,0.55)", color:"#fff" }}>🎬 Vídeo</span>
                <span style={{ position:"absolute", top:10, right:10, fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8, background:`${pColor}dd`, color:"#fff" }}>{d.priority === "alta" ? "🔴 Alta" : d.priority === "média" ? "🟡 Média" : "🟢 Baixa"}</span>
              </div>
            );
          })()}

          {/* ── Card body ── */}
          <div style={{ padding:"12px 14px 14px" }}>
            {/* Campaign/Video type header (no preview image) */}
            {d.type !== "social" && !(d.type === "video" && (d.steps?.editing?.files?.some(f=>f.url) || d.steps?.production?.files?.some(f=>f.url))) && (
              <div style={{ display:"flex", alignItems:"flex-start", gap:6, marginBottom:8 }}>
                <div style={{ width:32, height:32, borderRadius:10, background:`${pColor}12`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0 }}>{d.type==="campaign"?"🎯":"🎬"}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <Tag color={d.type==="campaign"?B.red:B.blue}>{d.type==="campaign"?"Campanha":"Vídeo"}</Tag>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8, background:`${pColor}12`, color:pColor }}>{d.priority==="alta"?"🔴 Alta":d.priority==="média"?"🟡 Média":"🟢 Baixa"}</span>
              </div>
            )}

            {/* Title + client */}
            <p style={{ fontSize:15, fontWeight:800, color:B.text, marginBottom:2 }}>{d.title}</p>
            <p style={{ fontSize:11, color:B.muted }}>{d.client} · {d.createdAt}</p>

            {/* Caption preview */}
            {caption && <p style={{ fontSize:12, color:B.text, marginTop:8, lineHeight:1.5, opacity:0.75, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{caption}</p>}

            {/* Stage progress */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, padding:"8px 0", borderTop:`1px solid ${B.border}` }}>
              <div style={{ width:8, height:8, borderRadius:4, background:STAGE_CFG[d.stage].c, flexShrink:0 }} />
              <span style={{ fontSize:11, fontWeight:700, color:B.text }}>{STAGE_CFG[d.stage].l}</span>
              <div style={{ flex:1 }}><StageBar type={d.type} current={d.stage} compact /></div>
              <span style={{ fontSize:10, color:B.muted, fontWeight:600 }}>{stageIdx+1}/{stageTotal}</span>
            </div>

            {/* Schedule + meta row */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:6, flexWrap:"wrap" }}>
              {schedDate && <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, color:B.muted, fontWeight:600 }}>{IC.clock} {schedDate}{schedTime ? ` às ${schedTime}` : ""}</span>}
              {d.type === "social" && !hasBudget && <span style={{ fontSize:9, fontWeight:600, padding:"2px 8px", borderRadius:6, background:`${B.muted}08`, color:B.muted }}>Orgânico</span>}
              <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:4 }}>
                {(d.assignees||[]).slice(0,3).map((a,j)=>{ const m=AGENCY_TEAM.find(t=>t.name===a); return <div key={j} style={{ width:22, height:22, borderRadius:11, background:m?.photo?"transparent":`${B.accent}20`, display:"flex", alignItems:"center", justifyContent:"center", marginLeft:j?-6:0, border:`2px solid ${B.bgCard}`, overflow:"hidden", zIndex:3-j }}>{m?.photo?<img src={m.photo} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>:<span style={{ fontSize:8, fontWeight:800, color:B.accent }}>{a[0]}</span>}</div>;})}{(d.assignees||[]).length > 3 && <span style={{ fontSize:9, color:B.muted }}>+{(d.assignees||[]).length-3}</span>}
              </div>
            </div>
          </div>
        </Card>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ CHAT PAGE (WhatsApp-like) ═══════════════════════ */
function ChatPage({ user }) {
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [view, setView] = useState("list"); // list, chat
  const [selContact, setSelContact] = useState(null);
  const [msgs, setMsgs] = useState(CHAT_MSGS_INIT);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [showCalling, setShowCalling] = useState(null);
  const msgEndRef = useRef(null);
  const { showToast, ToastEl } = useToast();

  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, selContact]);

  const getContactMsgs = (contact) => {
    const key = contact?.id?.toString() || "";
    return msgs[key] || [];
  };

  const getLastMsg = (contact) => {
    const m = getContactMsgs(contact);
    return m.length > 0 ? m[m.length - 1] : null;
  };

  const allChats = [
    ...CHAT_GROUPS.map(g => ({ ...g, _lastMsg: getLastMsg(g) || { text: g.lastMsg, time: g.time } })),
    ...CHAT_CONTACTS.filter(c => {
      const m = getContactMsgs(c);
      return m.length > 0;
    }).map(c => ({ ...c, _lastMsg: getLastMsg(c) })),
  ];

  const filteredContacts = CHAT_CONTACTS.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );
  const teamContacts = filteredContacts.filter(c => c.type === "team");
  const clientContacts = filteredContacts.filter(c => c.type === "client");

  const sendMsg = () => {
    if (!input.trim() || !selContact) return;
    const key = selContact.id.toString();
    const newMsg = { id: Date.now(), from: "me", text: input.trim(), time: new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}), read: false };
    setMsgs(prev => ({ ...prev, [key]: [...(prev[key]||[]), newMsg] }));
    setInput("");
    // Simulate typing response
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      const responses = ["Entendido! 👍","Vou verificar e te retorno","Ok, anotado!","Perfeito, obrigado!","Combinado!"];
      const reply = { id: Date.now()+1, from: selContact.name, text: responses[Math.floor(Math.random()*responses.length)], time: new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}), read: false };
      setMsgs(prev => {
        const cur = prev[key] || [];
        const marked = cur.map(m => m.from === "me" ? { ...m, read: true } : m);
        return { ...prev, [key]: [...marked, reply] };
      });
    }, 1500 + Math.random() * 2000);
  };

  const sendFile = (type) => {
    if (!selContact) return;
    const key = selContact.id.toString();
    const fileNames = { foto:"📷 Foto enviada", video:"🎬 Vídeo enviado", doc:"📄 Documento enviado", audio:"🎵 Áudio enviado" };
    const newMsg = { id: Date.now(), from: "me", text: fileNames[type] || "Arquivo enviado", time: new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}), read: false, isFile: true, fileType: type };
    setMsgs(prev => ({ ...prev, [key]: [...(prev[key]||[]), newMsg] }));
    setShowAttach(false);
    showToast("Arquivo enviado!");
  };

  /* ── TERMS OF USE ── */
  if (!termsAccepted) return (
    <div className="pg" style={{ paddingTop: TOP, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"80vh" }}>
      <div style={{ width:70, height:70, borderRadius:20, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:20 }}>
        <span style={{ color:B.accent }}>{IC.shield}</span>
      </div>
      <h2 style={{ fontSize:20, fontWeight:800, textAlign:"center" }}>Termos de Uso do Chat</h2>
      <p style={{ fontSize:13, color:B.muted, textAlign:"center", marginTop:10, lineHeight:1.7 }}>Para utilizar o chat interno da UniqueHub, você precisa aceitar nossos termos de uso.</p>
      <Card style={{ marginTop:16, width:"100%" }}>
        <div style={{ maxHeight:200, overflowY:"auto", fontSize:12, lineHeight:1.7, color:B.muted }}>
          <p style={{ fontWeight:700, color:B.text, marginBottom:6 }}>Termos de Uso — Chat UniqueHub Agency</p>
          <p>1. <b>Confidencialidade:</b> Todas as conversas são confidenciais e de uso exclusivo profissional. É proibido compartilhar o conteúdo das conversas com terceiros não autorizados.</p>
          <p style={{ marginTop:6 }}>2. <b>Conduta profissional:</b> O chat deve ser utilizado exclusivamente para assuntos de trabalho. Conteúdo ofensivo, discriminatório ou impróprio resultará em suspensão do acesso.</p>
          <p style={{ marginTop:6 }}>3. <b>Arquivos e dados:</b> Arquivos compartilhados pelo chat são de propriedade da empresa e dos clientes. Não distribua sem autorização.</p>
          <p style={{ marginTop:6 }}>4. <b>Comunicação com clientes:</b> Ao conversar com clientes, mantenha o tom profissional e alinhado com a identidade da Unique Marketing 360.</p>
          <p style={{ marginTop:6 }}>5. <b>Armazenamento:</b> As mensagens são armazenadas para fins de auditoria e segurança pelo período determinado pela empresa.</p>
          <p style={{ marginTop:6 }}>6. <b>Privacidade:</b> Respeitamos sua privacidade. Os dados são tratados conforme a LGPD.</p>
        </div>
      </Card>
      <button onClick={() => setTermsAccepted(true)} className="pill full accent" style={{ marginTop:16 }}>Li e aceito os Termos de Uso {IC.arrowR()}</button>
      <p style={{ fontSize:10, color:B.muted, marginTop:10, textAlign:"center" }}>Ao aceitar, você concorda com todas as regras acima.</p>
    </div>
  );

  /* ── CALLING OVERLAY ── */
  const CallingOverlay = showCalling ? (
    <>
      <div className="overlay" style={{ zIndex:200 }} />
      <div style={{ position:"fixed", inset:0, zIndex:201, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40 }}>
        <Av name={selContact?.name} sz={80} fs={32} />
        <p style={{ fontSize:20, fontWeight:800, color:"#fff", marginTop:16 }}>{selContact?.name}</p>
        <p style={{ fontSize:14, color:"rgba(255,255,255,0.6)", marginTop:4 }}>{showCalling === "audio" ? "Chamada de voz..." : "Chamada de vídeo..."}</p>
        <div style={{ display:"flex", gap:20, marginTop:40 }}>
          <button onClick={() => setShowCalling(null)} style={{ width:60, height:60, borderRadius:30, background:B.red, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><path d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          </button>
        </div>
      </div>
    </>
  ) : null;

  /* ── CHAT CONVERSATION ── */
  if (view === "chat" && selContact) {
    const contactMsgs = getContactMsgs(selContact);
    const isOnline = selContact.status === "online" || selContact.type === "group";

    return (
      <div style={{ display:"flex", flexDirection:"column", height:"100%", background:B.bg }}>
        {ToastEl}{CallingOverlay}
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:`calc(${TOP} + 4px) 12px 10px`, background:B.bgCard, borderBottom:`1px solid ${B.border}`, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
          <button onClick={() => { setView("list"); setSelContact(null); }} className="ib" style={{ width:32, height:32 }}>{IC.back()}</button>
          <div style={{ position:"relative" }}>
            <Av name={selContact.name} sz={38} fs={14} />
            {isOnline && <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:5, background:B.green, border:"2px solid #fff" }} />}
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:14, fontWeight:700 }}>{selContact.name}</p>
            <p style={{ fontSize:10, color: isOnline ? B.green : B.muted }}>{typing ? "digitando..." : isOnline ? (selContact.type==="group" ? `${selContact.members?.length || 4} membros` : "Online") : "Offline"}</p>
          </div>
          <button onClick={() => setShowCalling("audio")} className="ib" style={{ width:34, height:34 }}>{IC.phone}</button>
          <button onClick={() => setShowCalling("video")} className="ib" style={{ width:34, height:34 }}>{IC.vid}</button>
        </div>
        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"12px 16px", display:"flex", flexDirection:"column", gap:4 }}>
          <div style={{ textAlign:"center", marginBottom:12 }}><span style={{ fontSize:10, color:B.muted, background:"rgba(0,0,0,0.04)", padding:"3px 10px", borderRadius:6 }}>Hoje</span></div>
          {contactMsgs.map(m => {
            const isMe = m.from === "me";
            return (
              <div key={m.id} style={{ display:"flex", justifyContent: isMe?"flex-end":"flex-start", marginBottom:2 }}>
                {!isMe && selContact.type === "group" && <Av name={m.from} sz={24} fs={9} />}
                <div style={{ maxWidth:"78%", padding:"8px 12px", borderRadius: isMe?"14px 4px 14px 14px":"4px 14px 14px 14px", background: isMe?B.accent:B.bgCard, color: isMe?B.textOnAccent:B.text, boxShadow:"0 1px 2px rgba(0,0,0,0.06)", marginLeft: !isMe && selContact.type==="group" ? 6 : 0 }}>
                  {!isMe && selContact.type === "group" && <p style={{ fontSize:10, fontWeight:700, color:B.blue, marginBottom:2 }}>{m.from}</p>}
                  {m.isFile ? (
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ display:"flex" }}>{m.fileType==="foto"?IC.img:m.fileType==="video"?IC.vid:m.fileType==="audio"?IC.play:IC.doc}</span>
                      <span style={{ fontSize:13 }}>{m.text}</span>
                    </div>
                  ) : <p style={{ fontSize:13, lineHeight:1.5, whiteSpace:"pre-line" }}>{m.text}</p>}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-end", gap:4, marginTop:3 }}>
                    <span style={{ fontSize:9, color: isMe?"rgba(0,0,0,0.4)":B.muted }}>{m.time}</span>
                    {isMe && <span style={{ display:"flex", alignItems:"center" }}>
                      {m.read ? IC.tickRead() : IC.tickDelivered()}
                    </span>}
                  </div>
                </div>
              </div>
            );
          })}
          {/* Typing indicator */}
          {typing && <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            {selContact.type !== "group" && <Av name={selContact.name} sz={24} fs={9} />}
            <div style={{ padding:"10px 16px", borderRadius:"4px 14px 14px 14px", background:B.bgCard, boxShadow:"0 1px 2px rgba(0,0,0,0.06)" }}>
              <div style={{ display:"flex", gap:4 }}>
                {[0,1,2].map(i=><div key={i} style={{ width:7, height:7, borderRadius:4, background:B.muted, animation:`skPulse 1.2s ease ${i*0.2}s infinite` }} />)}
              </div>
            </div>
          </div>}
          <div ref={msgEndRef} />
        </div>
        {/* Attachment dropdown */}
        {showAttach && <div style={{ padding:"8px 16px", background:B.bgCard, borderTop:`1px solid ${B.border}`, display:"flex", gap:8 }}>
          {[{k:"foto",l:"Foto",ic:IC.camera,c:B.blue},{k:"video",l:"Vídeo",ic:IC.vid,c:B.purple},{k:"doc",l:"Documento",ic:IC.doc,c:B.green},{k:"audio",l:"Áudio",ic:IC.play,c:B.orange}].map(f=>(
            <button key={f.k} onClick={()=>sendFile(f.k)} style={{ flex:1, padding:"10px 0", borderRadius:12, background:`${f.c}10`, border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, fontFamily:"inherit" }}>
              <span style={{ color:f.c, display:"flex" }}>{f.ic}</span>
              <span style={{ fontSize:10, fontWeight:600, color:f.c }}>{f.l}</span>
            </button>
          ))}
        </div>}
        {/* Input */}
        <div style={{ padding:"8px 12px 24px", display:"flex", gap:8, background:B.bgCard, borderTop:`1px solid ${B.border}` }}>
          <button onClick={() => setShowAttach(!showAttach)} className="ib" style={{ width:40, height:40, flexShrink:0, background: showAttach?`${B.accent}15`:B.bgCard }}>{IC.plus}</button>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMsg()} placeholder="Mensagem..." className="tinput" style={{ flex:1 }} />
          <button onClick={sendMsg} className="send-btn" style={{ opacity: input.trim()?1:0.4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#192126" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    );
  }

  /* ── CONTACT LIST / CONVERSATIONS ── */
  return (
    <div className="pg" style={{ paddingTop: TOP }}>
      {ToastEl}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, paddingTop:8 }}>
        <h2 style={{ fontSize:18, fontWeight:800, flex:1 }}>Chat</h2>
        <Tag color={B.accent}>{CHAT_GROUPS.reduce((a,g)=>a+g.unread,0)} novas</Tag>
      </div>
      {/* Search */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:B.muted, display:"flex" }}>{IC.search(B.muted)}</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar conversa..." className="tinput" style={{ paddingLeft:40 }} />
      </div>
      {/* Groups */}
      {!search && <>
        <p className="sl" style={{ marginBottom:6 }}>Grupos</p>
        {CHAT_GROUPS.map((g,i) => {
          const last = getLastMsg(g);
          const lastIsMe = last && last.from === "me";
          const displayMsg = last ? last.text : g.lastMsg;
          const displayTime = last ? last.time : g.time;
          return (
          <Card key={g.id} delay={i*0.03} onClick={() => { setSelContact(g); setView("chat"); }} style={{ marginTop: i?6:0, cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ position:"relative" }}>
                <div style={{ width:42, height:42, borderRadius:14, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ color:B.accent, display:"flex" }}>{IC.users}</span>
                </div>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight: g.unread>0?700:500 }}>{g.name}</p>
                <p style={{ fontSize:12, color:B.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:3 }}>
                  {lastIsMe && <span style={{ display:"inline-flex", flexShrink:0, alignItems:"center" }}>
                    {last.read ? IC.tickRead() : IC.tickDelivered()}
                  </span>}
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{displayMsg}</span>
                </p>
              </div>
              <div style={{ textAlign:"right", flexShrink:0 }}>
                <p style={{ fontSize:10, color: g.unread>0?B.accent:B.muted }}>{displayTime}</p>
                {g.unread > 0 && <div style={{ width:18, height:18, borderRadius:9, background:B.accent, color:B.text, fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", marginTop:4, marginLeft:"auto" }}>{g.unread}</div>}
              </div>
            </div>
          </Card>
          );
        })}
      </>}
      {/* Team */}
      <p className="sl" style={{ marginTop:14, marginBottom:6 }}>Equipe</p>
      {teamContacts.map((c,i) => {
        const last = getLastMsg(c);
        const lastIsMe = last && last.from === "me";
        return (
          <Card key={c.id} delay={(i+2)*0.03} onClick={() => { setSelContact(c); setView("chat"); }} style={{ marginTop: i?6:0, cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ position:"relative" }}>
                <Av src={c.photo} name={c.name} sz={42} fs={16} />
                <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:5, background: c.status==="online"?B.green:B.muted, border:"2px solid #fff" }} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:600 }}>{c.name}</p>
                <p style={{ fontSize:11, color:B.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:3 }}>
                  {lastIsMe && <span style={{ display:"inline-flex", flexShrink:0, alignItems:"center" }}>
                    {last.read ? IC.tickRead() : IC.tickDelivered()}
                  </span>}
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{last ? last.text : c.role}</span>
                </p>
              </div>
              {last && <p style={{ fontSize:10, color:B.muted }}>{last.time}</p>}
            </div>
          </Card>
        );
      })}
      {/* Clients */}
      <p className="sl" style={{ marginTop:14, marginBottom:6 }}>Clientes</p>
      {clientContacts.map((c,i) => {
        const last = getLastMsg(c);
        const lastIsMe = last && last.from === "me";
        return (
          <Card key={c.id} delay={(i+6)*0.03} onClick={() => { setSelContact(c); setView("chat"); }} style={{ marginTop: i?6:0, cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ position:"relative" }}>
                <Av name={c.name} sz={42} fs={16} />
                <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:5, background: c.status==="online"?B.green:B.muted, border:"2px solid #fff" }} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:14, fontWeight:600 }}>{c.name}</p>
                <p style={{ fontSize:11, color:B.muted, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:3 }}>
                  {lastIsMe && <span style={{ display:"inline-flex", flexShrink:0, alignItems:"center" }}>
                    {last.read ? IC.tickRead() : IC.tickDelivered()}
                  </span>}
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{last ? last.text : c.role}</span>
                </p>
              </div>
              <Tag color={B.accent}>Cliente</Tag>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ═══════════════════════ NOTIFICATIONS ═══════════════════════ */
function NotifsPage({ onBack }) {
  const notifs = [
    { id: 1, t: "Novo conteúdo pendente — Casa Nova", cat: "content", tm: "Agora", icon: IC.content(B.accent) },
    { id: 2, t: "Alice fez check-in às 08:30", cat: "team", tm: "30min", icon: IC.checkin(B.green) },
    { id: 3, t: "Cadastro pendente de aprovação: João Silva", cat: "admin", tm: "1h", icon: IC.shield },
    { id: 4, t: "Fatura de TechSmart recebida", cat: "financial", tm: "2h", icon: IC.dollar },
    { id: 5, t: "Victoria concluiu curso de Edição", cat: "academy", tm: "3h", icon: IC.academy(B.purple) },
    { id: 6, t: "Bella Estética aprovou 2 posts", cat: "content", tm: "5h", icon: IC.check },
    { id: 7, t: "Relatório de Janeiro disponível", cat: "report", tm: "1d", icon: IC.reports(B.blue) },
  ];
  const [readIds, setReadIds] = useState([]);
  const toggle = id => setReadIds(r => r.includes(id) ? r.filter(x => x !== id) : [...r, id]);

  return (
    <div className="pg">
      <Head title="Notificações" onBack={onBack} />
      {notifs.map((n, i) => (
        <Card key={n.id} delay={i * 0.03} onClick={() => toggle(n.id)} style={{ marginTop: i ? 6 : 0, opacity: readIds.includes(n.id) ? 0.5 : 1, cursor: "pointer", borderLeft: `3px solid ${readIds.includes(n.id) ? B.border : B.accent}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${B.accent}10`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: B.accent }}>{typeof n.icon === "function" ? n.icon : n.icon}</div>
            <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: readIds.includes(n.id) ? 500 : 600 }}>{n.t}</p><p style={{ fontSize: 10, color: B.muted }}>{n.tm}</p></div>
            {!readIds.includes(n.id) && <div style={{ width: 8, height: 8, borderRadius: 4, background: B.accent, flexShrink: 0 }} />}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════ SETTINGS PAGE ═══════════════════════ */
function SettingsPage({ onBack, user, setUser, onLogout, dark, setDark, themeColor, setThemeColor, onNavEdit }) {
  const [sub, setSub] = useState(null);
  const [twoFA, setTwoFA] = useState(false);
  const { showToast, ToastEl } = useToast();

  /* Profile editing */
  const [editProfile, setEditProfile] = useState(false);
  const [pName, setPName] = useState(user?.name || "");
  const [pNick, setPNick] = useState(user?.nick || "");
  const [pPhone, setPPhone] = useState(user?.phone || "");
  const [pSocial, setPSocial] = useState(user?.social || "");
  const [pBirth, setPBirth] = useState(user?.birth || "");
  const [pBlood, setPBlood] = useState(user?.blood || "");

  /* Security */
  const [changePw, setChangePw] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [sessions, setSessions] = useState(false);

  /* Notifications */
  const [notifChat, setNotifChat] = useState(true);
  const [notifChatPriv, setNotifChatPriv] = useState(true);
  const [notifChatMention, setNotifChatMention] = useState(true);
  const [notifTask, setNotifTask] = useState(true);
  const [notifTaskAssigned, setNotifTaskAssigned] = useState(true);
  const [notifTaskDeadline, setNotifTaskDeadline] = useState(true);
  const [notifTaskComplete, setNotifTaskComplete] = useState(true);
  const [notifClient, setNotifClient] = useState(true);
  const [notifClientApproval, setNotifClientApproval] = useState(true);
  const [notifClientFeedback, setNotifClientFeedback] = useState(true);
  const [notifClientNew, setNotifClientNew] = useState(true);
  const [notifFinancial, setNotifFinancial] = useState(true);
  const [notifFinPaid, setNotifFinPaid] = useState(true);
  const [notifFinOverdue, setNotifFinOverdue] = useState(true);
  const [notifCalendar, setNotifCalendar] = useState(true);
  const [notifCal15, setNotifCal15] = useState(true);
  const [notifCal60, setNotifCal60] = useState(false);
  const [notifCalDaily, setNotifCalDaily] = useState(true);
  const [notifTeam, setNotifTeam] = useState(true);
  const [notifTeamCheckin, setNotifTeamCheckin] = useState(false);
  const [notifTeamRegister, setNotifTeamRegister] = useState(true);
  const [notifEmail, setNotifEmail] = useState(false);
  const [notifEmailDigest, setNotifEmailDigest] = useState("daily");
  const [notifSound, setNotifSound] = useState(true);
  const [notifVibrate, setNotifVibrate] = useState(true);
  const [notifPreview, setNotifPreview] = useState(true);
  const [dndActive, setDndActive] = useState(false);
  const [dndStart, setDndStart] = useState("22:00");
  const [dndEnd, setDndEnd] = useState("07:00");

  const themes = [
    { k: "default", l: "Lime", c: "#BBF246" }, { k: "blue", l: "Azul", c: "#3B82F6" }, { k: "purple", l: "Roxo", c: "#8B5CF6" },
    { k: "pink", l: "Rosa", c: "#EC4899" }, { k: "orange", l: "Laranja", c: "#F59E0B" }, { k: "red", l: "Vermelho", c: "#EF4444" }, { k: "cyan", l: "Ciano", c: "#06B6D4" }
  ];

  const maskPhone = (v) => {
    const d = v.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    if (d.length <= 7) return "(" + d.slice(0,2) + ") " + d.slice(2);
    return "(" + d.slice(0,2) + ") " + d.slice(2,7) + "-" + d.slice(7);
  };

  const pwChecks = (p) => [
    { label: "Mínimo 8 caracteres", ok: p.length >= 8 },
    { label: "Letra maiúscula", ok: /[A-Z]/.test(p) },
    { label: "Letra minúscula", ok: /[a-z]/.test(p) },
    { label: "Número", ok: /[0-9]/.test(p) },
    { label: "Caractere especial", ok: /[!@#$%^&*(),.?":{}|<>]/.test(p) },
  ];
  const pwStrong = (p) => pwChecks(p).every(c => c.ok);

  const saveProfile = () => {
    setUser(prev => ({ ...prev, name: pName, nick: pNick, phone: pPhone, social: pSocial, birth: pBirth, blood: pBlood }));
    setEditProfile(false);
    showToast("Perfil atualizado ✓");
  };

  const savePw = () => {
    if (!pwStrong(newPw)) { showToast("Senha não atende os critérios"); return; }
    if (newPw !== confirmPw) { showToast("As senhas não conferem"); return; }
    setChangePw(false); setOldPw(""); setNewPw(""); setConfirmPw("");
    showToast("Senha alterada com sucesso ✓");
  };

  const EyeBtn = ({ show, toggle }) => (
    <button onClick={toggle} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:B.muted, display:"flex" }}>
      {show ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><line x1="1" y1="1" x2="23" y2="23"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
    </button>
  );

  /* ═══ PROFILE ═══ */
  if (sub === "profile") return (
    <div className="pg">
      {ToastEl}
      <Head title="Perfil" onBack={() => setSub(null)} right={
        !editProfile ? <button onClick={() => setEditProfile(true)} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 12px", borderRadius:8, background:`${B.accent}10`, border:`1.5px solid ${B.accent}25`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.accent }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Editar</button> : null
      } />
      <Card style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative" }}><Av src={user?.photo} name={user?.name} sz={72} fs={28} /><button style={{ position: "absolute", bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, background: B.accent, border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>{IC.camera}</button></div>
        <p style={{ fontSize: 18, fontWeight: 700, marginTop: 10 }}>{user?.name}</p>
        <p style={{ fontSize: 12, color: B.muted }}>{user?.role}</p>
        <Tag color={B.green} style={{ marginTop: 6 }}>Ativo</Tag>
      </Card>

      {editProfile ? <>
        <p className="sl" style={{ marginBottom: 6 }}>Dados pessoais</p>
        <Card style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 4 }}>Nome completo</label>
          <input value={pName} onChange={e => setPName(e.target.value)} className="tinput" />
        </Card>
        <Card style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 4 }}>Apelido</label>
          <input value={pNick} onChange={e => setPNick(e.target.value)} className="tinput" />
        </Card>
        <Card style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 4 }}>Data de nascimento</label>
          <input value={pBirth} onChange={e => setPBirth(e.target.value)} className="tinput" placeholder="DD/MM/AAAA" />
        </Card>

        <p className="sl" style={{ marginTop: 12, marginBottom: 6 }}>Contato</p>
        <Card style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 4 }}>Telefone / WhatsApp</label>
          <input value={pPhone} onChange={e => setPPhone(maskPhone(e.target.value))} className="tinput" inputMode="tel" />
        </Card>
        <Card style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 4 }}>Rede social</label>
          <input value={pSocial} onChange={e => setPSocial(e.target.value)} className="tinput" placeholder="@seuperfil" />
        </Card>

        <p className="sl" style={{ marginTop: 12, marginBottom: 6 }}>Tipo sanguíneo</p>
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["A+","A-","B+","B-","AB+","AB-","O+","O-","Não sei"].map(b => (
              <button key={b} onClick={() => setPBlood(b)} style={{ padding: "7px 12px", borderRadius: 10, border: `1.5px solid ${pBlood === b ? B.accent : B.border}`, background: pBlood === b ? `${B.accent}12` : B.bgCard, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: pBlood === b ? B.dark : B.muted }}>{b}</button>
            ))}
          </div>
        </Card>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setEditProfile(false)} className="pill outline" style={{ flex: 1 }}>Cancelar</button>
          <button onClick={saveProfile} className="pill accent" style={{ flex: 1 }}>Salvar</button>
        </div>
      </> : <>
        <p className="sl" style={{ marginBottom: 6 }}>Dados pessoais</p>
        {[
          { l: "Nome completo", v: user?.name, ic: IC.team(B.accent) },
          { l: "Apelido", v: user?.nick || "—", ic: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
          { l: "CPF", v: user?.cpf || "—", ic: IC.shield },
          { l: "Data de nascimento", v: user?.birth || "—", ic: IC.clock },
          { l: "Tipo sanguíneo", v: user?.blood || "—", ic: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2" strokeLinecap="round"><path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/></svg> },
        ].map((f, i) => (
          <Card key={i} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: B.accent, display: "flex" }}>{f.ic}</span>
              <div><p style={{ fontSize: 11, color: B.muted }}>{f.l}</p><p style={{ fontSize: 14, fontWeight: 600 }}>{f.v}</p></div>
            </div>
          </Card>
        ))}

        <p className="sl" style={{ marginTop: 12, marginBottom: 6 }}>Contato</p>
        {[
          { l: "E-mail corporativo", v: user?.email, ic: IC.mail },
          { l: "Telefone / WhatsApp", v: user?.phone || "—", ic: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> },
          { l: "Rede social", v: user?.social || "—", ic: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2" strokeLinecap="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg> },
        ].map((f, i) => (
          <Card key={i} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: B.accent, display: "flex" }}>{f.ic}</span>
              <div><p style={{ fontSize: 11, color: B.muted }}>{f.l}</p><p style={{ fontSize: 14, fontWeight: 600 }}>{f.v}</p></div>
            </div>
          </Card>
        ))}

        <p className="sl" style={{ marginTop: 12, marginBottom: 6 }}>Função</p>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: B.accent, display: "flex" }}>{IC.briefcase}</span>
            <div><p style={{ fontSize: 11, color: B.muted }}>Cargo</p><p style={{ fontSize: 14, fontWeight: 600 }}>{user?.role}</p></div>
          </div>
        </Card>
      </>}
    </div>
  );

  /* ═══ APPEARANCE ═══ */
  if (sub === "aparencia") return (
    <div className="pg">
      {ToastEl}
      <Head title="Aparência" onBack={() => setSub(null)} />
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: B.accent, display: "flex" }}>{dark ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{dark ? "Modo Claro" : "Modo Escuro"}</span>
          </div>
          <Toggle on={dark} onToggle={() => { setDark(!dark); showToast(dark ? "Modo claro ativado" : "Modo escuro ativado"); }} />
        </div>
      </Card>
      <Card style={{ marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ color: B.accent, display: "flex" }}>{IC.palette}</span>
          <p style={{ fontSize: 13, fontWeight: 600 }}>Cor do Tema</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {themes.map(t => (
            <button key={t.k} onClick={() => { setThemeColor(t.k); showToast(`Tema ${t.l} aplicado ✓`); }} style={{ width: 40, height: 40, borderRadius: 14, background: t.c, border: themeColor === t.k ? `3px solid ${B.text}` : "3px solid transparent", cursor: "pointer", position: "relative" }}>
              {themeColor === t.k && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 16 }}>{IC.check}</span>}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 11, color: B.muted, marginTop: 8 }}>Selecionado: {themes.find(t => t.k === themeColor)?.l || "Padrão"}</p>
      </Card>
    </div>
  );

  /* ═══ NOTIFICATIONS ═══ */
  if (sub === "notifs") {
    const NotifSection = ({ icon, color, title, desc, master, onMaster, children }) => (
      <div style={{ marginBottom: 14 }}>
        <Card style={{ borderLeft: `4px solid ${color}`, marginBottom: children && master ? 4 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}12`, display: "flex", alignItems: "center", justifyContent: "center", color }}>{icon}</div>
              <div><p style={{ fontSize: 14, fontWeight: 600 }}>{title}</p><p style={{ fontSize: 11, color: B.muted }}>{desc}</p></div>
            </div>
            <Toggle on={master} onToggle={() => { onMaster(); showToast(master ? `${title} desativado` : `${title} ativado ✓`); }} />
          </div>
        </Card>
        {master && children && <div style={{ marginLeft: 16, borderLeft: `2px solid ${B.border}`, paddingLeft: 12 }}>{children}</div>}
      </div>
    );

    const SubNotif = ({ label, on, toggle }) => (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${B.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        <Toggle on={on} onToggle={toggle} />
      </div>
    );

    return (
      <div className="pg">
        {ToastEl}
        <Head title="Notificações" onBack={() => setSub(null)} />

        {/* DND */}
        <Card style={{ marginBottom: 14, background: dndActive ? `${B.purple}08` : B.bgCard, border: dndActive ? `1.5px solid ${B.purple}30` : "none" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: dndActive ? 12 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${B.purple}12`, display: "flex", alignItems: "center", justifyContent: "center", color: B.purple }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
              </div>
              <div><p style={{ fontSize: 14, fontWeight: 700 }}>Não Perturbe</p><p style={{ fontSize: 11, color: B.muted }}>Silenciar todas as notificações</p></div>
            </div>
            <Toggle on={dndActive} onToggle={() => { setDndActive(!dndActive); showToast(dndActive ? "Não Perturbe desativado" : "Não Perturbe ativado 🌙"); }} />
          </div>
          {dndActive && (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: B.muted, display: "block", marginBottom: 4 }}>Início</label>
                <input type="time" value={dndStart} onChange={e => setDndStart(e.target.value)} className="tinput" style={{ padding: "8px 10px" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: B.muted, display: "block", marginBottom: 4 }}>Fim</label>
                <input type="time" value={dndEnd} onChange={e => setDndEnd(e.target.value)} className="tinput" style={{ padding: "8px 10px" }} />
              </div>
            </div>
          )}
        </Card>

        <p className="sl" style={{ marginBottom: 8 }}>Canais de Notificação</p>

        {/* Chat */}
        <NotifSection icon={IC.chat} color={B.blue} title="Chat & Mensagens" desc="Conversas e menções" master={notifChat} onMaster={() => setNotifChat(!notifChat)}>
          <SubNotif label="Mensagens privadas" on={notifChatPriv} toggle={() => setNotifChatPriv(!notifChatPriv)} />
          <SubNotif label="Menções (@você)" on={notifChatMention} toggle={() => setNotifChatMention(!notifChatMention)} />
        </NotifSection>

        {/* Tasks */}
        <NotifSection icon={IC.clipboard} color={B.orange} title="Tarefas & Demandas" desc="Atribuições e prazos" master={notifTask} onMaster={() => setNotifTask(!notifTask)}>
          <SubNotif label="Nova tarefa atribuída a mim" on={notifTaskAssigned} toggle={() => setNotifTaskAssigned(!notifTaskAssigned)} />
          <SubNotif label="Prazo se aproximando (24h)" on={notifTaskDeadline} toggle={() => setNotifTaskDeadline(!notifTaskDeadline)} />
          <SubNotif label="Tarefa concluída pela equipe" on={notifTaskComplete} toggle={() => setNotifTaskComplete(!notifTaskComplete)} />
        </NotifSection>

        {/* Clients */}
        <NotifSection icon={IC.clients} color={B.green} title="Clientes" desc="Aprovações e feedbacks" master={notifClient} onMaster={() => setNotifClient(!notifClient)}>
          <SubNotif label="Conteúdo aguardando aprovação" on={notifClientApproval} toggle={() => setNotifClientApproval(!notifClientApproval)} />
          <SubNotif label="Feedback recebido do cliente" on={notifClientFeedback} toggle={() => setNotifClientFeedback(!notifClientFeedback)} />
          <SubNotif label="Novo cliente cadastrado" on={notifClientNew} toggle={() => setNotifClientNew(!notifClientNew)} />
        </NotifSection>

        {/* Financial */}
        <NotifSection icon={IC.dollar} color={B.green} title="Financeiro" desc="Pagamentos e cobranças" master={notifFinancial} onMaster={() => setNotifFinancial(!notifFinancial)}>
          <SubNotif label="Pagamento recebido" on={notifFinPaid} toggle={() => setNotifFinPaid(!notifFinPaid)} />
          <SubNotif label="Fatura vencida / atrasada" on={notifFinOverdue} toggle={() => setNotifFinOverdue(!notifFinOverdue)} />
        </NotifSection>

        {/* Calendar */}
        <NotifSection icon={IC.clock} color={B.purple} title="Calendário & Agenda" desc="Eventos e lembretes" master={notifCalendar} onMaster={() => setNotifCalendar(!notifCalendar)}>
          <SubNotif label="Lembrete 15 min antes" on={notifCal15} toggle={() => setNotifCal15(!notifCal15)} />
          <SubNotif label="Lembrete 1 hora antes" on={notifCal60} toggle={() => setNotifCal60(!notifCal60)} />
          <SubNotif label="Resumo diário da agenda (8h)" on={notifCalDaily} toggle={() => setNotifCalDaily(!notifCalDaily)} />
        </NotifSection>

        {/* Team */}
        <NotifSection icon={IC.team(B.cyan)} color={B.cyan} title="Equipe" desc="Check-ins e cadastros" master={notifTeam} onMaster={() => setNotifTeam(!notifTeam)}>
          <SubNotif label="Check-in/Check-out da equipe" on={notifTeamCheckin} toggle={() => setNotifTeamCheckin(!notifTeamCheckin)} />
          <SubNotif label="Novo cadastro pendente" on={notifTeamRegister} toggle={() => setNotifTeamRegister(!notifTeamRegister)} />
        </NotifSection>

        <p className="sl" style={{ marginTop: 4, marginBottom: 8 }}>Preferências</p>

        {/* Sound & Vibrate */}
        <Card style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: B.accent, display: "flex" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M15.54 8.46a5 5 0 010 7.07"/></svg></span>
              <div><p style={{ fontSize: 14, fontWeight: 600 }}>Som</p><p style={{ fontSize: 11, color: B.muted }}>Alerta sonoro</p></div>
            </div>
            <Toggle on={notifSound} onToggle={() => { setNotifSound(!notifSound); showToast(notifSound ? "Som desativado" : "Som ativado ✓"); }} />
          </div>
        </Card>
        <Card style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: B.accent, display: "flex" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.11 2 2 0 014.11 2h3"/><line x1="1" y1="1" x2="23" y2="23"/></svg></span>
              <div><p style={{ fontSize: 14, fontWeight: 600 }}>Vibração</p><p style={{ fontSize: 11, color: B.muted }}>Vibrar ao receber</p></div>
            </div>
            <Toggle on={notifVibrate} onToggle={() => { setNotifVibrate(!notifVibrate); showToast(notifVibrate ? "Vibração desativada" : "Vibração ativada ✓"); }} />
          </div>
        </Card>
        <Card style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: B.accent, display: "flex" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
              <div><p style={{ fontSize: 14, fontWeight: 600 }}>Preview na notificação</p><p style={{ fontSize: 11, color: B.muted }}>Mostrar conteúdo no alerta</p></div>
            </div>
            <Toggle on={notifPreview} onToggle={() => { setNotifPreview(!notifPreview); showToast(notifPreview ? "Preview desativado" : "Preview ativado ✓"); }} />
          </div>
        </Card>

        {/* Email */}
        <p className="sl" style={{ marginTop: 14, marginBottom: 8 }}>E-mail</p>
        <Card style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: notifEmail ? 12 : 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: B.accent, display: "flex" }}>{IC.mail}</span>
              <div><p style={{ fontSize: 14, fontWeight: 600 }}>Notificações por e-mail</p><p style={{ fontSize: 11, color: B.muted }}>Receber resumos por e-mail</p></div>
            </div>
            <Toggle on={notifEmail} onToggle={() => { setNotifEmail(!notifEmail); showToast(notifEmail ? "E-mail desativado" : "E-mail ativado ✓"); }} />
          </div>
          {notifEmail && (
            <div>
              <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 6 }}>Frequência do resumo</label>
              <div style={{ display: "flex", gap: 6 }}>
                {[{k:"realtime",l:"Tempo real"},{k:"daily",l:"Diário"},{k:"weekly",l:"Semanal"}].map(opt => (
                  <button key={opt.k} onClick={() => { setNotifEmailDigest(opt.k); showToast(`Resumo ${opt.l.toLowerCase()} selecionado`); }} style={{ flex: 1, padding: "9px 6px", borderRadius: 10, border: `1.5px solid ${notifEmailDigest === opt.k ? B.accent : B.border}`, background: notifEmailDigest === opt.k ? `${B.accent}12` : "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: notifEmailDigest === opt.k ? B.accent : B.muted }}>{opt.l}</button>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    );
  }

  /* ═══ SECURITY ═══ */
  if (sub === "sec") {
    /* Change password sub-view */
    if (changePw) return (
      <div className="pg">
        {ToastEl}
        <Head title="Alterar Senha" onBack={() => { setChangePw(false); setOldPw(""); setNewPw(""); setConfirmPw(""); }} />
        <Card style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 4 }}>Senha atual</label>
          <div style={{ position: "relative" }}>
            <input type={showOldPw ? "text" : "password"} value={oldPw} onChange={e => setOldPw(e.target.value)} className="tinput" style={{ paddingRight: 40 }} />
            <EyeBtn show={showOldPw} toggle={() => setShowOldPw(!showOldPw)} />
          </div>
        </Card>
        <Card style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 4 }}>Nova senha</label>
          <div style={{ position: "relative" }}>
            <input type={showNewPw ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} className="tinput" style={{ paddingRight: 40 }} />
            <EyeBtn show={showNewPw} toggle={() => setShowNewPw(!showNewPw)} />
          </div>
          {newPw && <div style={{ marginTop: 8 }}>
            {pwChecks(newPw).map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                <span style={{ display: "flex", color: c.ok ? B.green : B.muted }}>{c.ok ? IC.check : IC.x}</span>
                <span style={{ fontSize: 10, color: c.ok ? B.green : B.muted }}>{c.label}</span>
              </div>
            ))}
          </div>}
        </Card>
        <Card style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: B.muted, display: "block", marginBottom: 4 }}>Confirmar nova senha</label>
          <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="tinput" />
          {confirmPw && <p style={{ fontSize: 10, marginTop: 4, color: newPw === confirmPw ? B.green : B.red, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "flex" }}>{newPw === confirmPw ? IC.check : IC.x}</span>{newPw === confirmPw ? "Senhas conferem" : "Senhas não conferem"}</p>}
        </Card>
        <button onClick={savePw} className="pill full accent" style={{ opacity: pwStrong(newPw) && newPw === confirmPw ? 1 : 0.4 }}>Salvar Nova Senha</button>
      </div>
    );

    /* Sessions sub-view */
    if (sessions) return (
      <div className="pg">
        {ToastEl}
        <Head title="Sessões Ativas" onBack={() => setSessions(false)} />
        {[
          { device: "iPhone 15 Pro", browser: "Safari", location: "Petrópolis, RJ", time: "Agora", current: true },
          { device: "MacBook Pro", browser: "Chrome", location: "Petrópolis, RJ", time: "Há 2 horas", current: false },
          { device: "Windows PC", browser: "Firefox", location: "Petrópolis, RJ", time: "Há 1 dia", current: false },
        ].map((s, i) => (
          <Card key={i} delay={i*0.04} style={{ marginBottom: 8, borderLeft: s.current ? `4px solid ${B.green}` : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${s.current ? B.green : B.muted}08`, display: "flex", alignItems: "center", justifyContent: "center", color: s.current ? B.green : B.muted }}>
                {IC.device}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <p style={{ fontSize: 14, fontWeight: 600 }}>{s.device}</p>
                  {s.current && <Tag color={B.green}>Atual</Tag>}
                </div>
                <p style={{ fontSize: 11, color: B.muted }}>{s.browser} · {s.location}</p>
                <p style={{ fontSize: 10, color: B.muted }}>{s.time}</p>
              </div>
              {!s.current && <button onClick={() => showToast("Sessão encerrada ✓")} style={{ padding: "6px 10px", borderRadius: 8, background: `${B.red}08`, border: `1px solid ${B.red}20`, cursor: "pointer", fontFamily: "inherit", fontSize: 10, fontWeight: 600, color: B.red }}>Encerrar</button>}
            </div>
          </Card>
        ))}
        <button onClick={() => showToast("Todas as outras sessões encerradas ✓")} className="pill full outline" style={{ marginTop: 8, color: B.red, borderColor: `${B.red}30` }}>Encerrar todas as outras sessões</button>
      </div>
    );

    /* Security main */
    return (
      <div className="pg">
        {ToastEl}
        <Head title="Segurança" onBack={() => setSub(null)} />
        <Card onClick={() => setChangePw(true)} style={{ cursor: "pointer", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: B.accent, display: "flex" }}>{IC.lock}</span>
            <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 600 }}>Alterar Senha</p><p style={{ fontSize: 11, color: B.muted }}>Última alteração: 30 dias atrás</p></div>
            {IC.chev()}
          </div>
        </Card>
        <Card style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: B.accent, display: "flex" }}>{IC.shield}</span>
              <div><p style={{ fontSize: 14, fontWeight: 600 }}>Autenticação 2 Fatores</p><p style={{ fontSize: 11, color: B.muted }}>{twoFA ? "Ativado" : "Desativado"}</p></div>
            </div>
            <Toggle on={twoFA} onToggle={() => { setTwoFA(!twoFA); showToast(twoFA ? "2FA desativado" : "2FA ativado ✓"); }} />
          </div>
        </Card>
        <Card onClick={() => setSessions(true)} style={{ cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: B.accent, display: "flex" }}>{IC.device}</span>
            <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 600 }}>Sessões Ativas</p><p style={{ fontSize: 11, color: B.muted }}>3 dispositivos conectados</p></div>
            {IC.chev()}
          </div>
        </Card>
      </div>
    );
  }

  /* ═══ ABOUT ═══ */
  if (sub === "about") return (
    <div className="pg">
      {ToastEl}
      <Head title="Sobre" onBack={() => setSub(null)} />
      <Card style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
        <Logo size={48} />
        <p style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>UniqueHub Agency</p>
        <p style={{ fontSize: 12, color: B.muted, marginTop: 4 }}>v1.0.0</p>
      </Card>
      <Card style={{ marginBottom: 8 }}>
        {[
          { l: "Desenvolvido por", v: "Unique Marketing 360" },
          { l: "Localização", v: "Petrópolis, RJ — Brasil" },
          { l: "Website", v: "www.uniquemkt.com.br" },
          { l: "Versão do sistema", v: "1.0.0 (build 2026.03)" },
          { l: "Última atualização", v: "01/03/2026" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: i ? `1px solid ${B.border}` : "none" }}>
            <span style={{ fontSize: 12, color: B.muted }}>{item.l}</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>{item.v}</span>
          </div>
        ))}
      </Card>
      <Card>
        <p style={{ fontSize: 11, color: B.muted, lineHeight: 1.6 }}>© 2025-2026 Unique Marketing 360. Todos os direitos reservados. Este software é propriedade exclusiva da Unique Marketing 360 e não pode ser reproduzido sem autorização prévia.</p>
      </Card>
    </div>
  );

  /* ═══ APPROVALS ═══ */
  if (sub === "approvals") return (
    <div className="pg">
      {ToastEl}
      <Head title="Aprovações de Cadastro" onBack={() => setSub(null)} />
      <Card style={{ background: `${B.orange}06`, border: `1px solid ${B.orange}20`, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: B.orange, display: "flex" }}>{IC.shield}</span>
          <p style={{ fontSize: 12, color: B.orange }}>Apenas CEO e Gerentes podem aprovar novos cadastros.</p>
        </div>
      </Card>
      {[{ name: "João Silva", email: "joao@uniquemkt.com.br", role: "Designer", date: "25/02" }, { name: "Maria Costa", email: "maria@uniquemkt.com.br", role: "Estagiária", date: "24/02" }].map((r, i) => (
        <Card key={i} delay={i * 0.04} style={{ marginTop: i ? 8 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <Av name={r.name} sz={40} fs={16} />
            <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</p><p style={{ fontSize: 11, color: B.muted }}>{r.email} · {r.role}</p><p style={{ fontSize: 10, color: B.muted }}>Solicitado em {r.date}</p></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => showToast(`${r.name} aprovado ✓`)} className="pill accent" style={{ flex: 1, padding: "10px 14px" }}>{IC.check} Aprovar</button>
            <button onClick={() => showToast(`${r.name} recusado`)} className="pill outline" style={{ flex: 1, padding: "10px 14px", color: B.red, borderColor: `${B.red}30` }}>{IC.x} Recusar</button>
          </div>
        </Card>
      ))}
    </div>
  );

  /* ═══ SETTINGS MAIN ═══ */
  return (
    <div className="pg">
      {ToastEl}
      <Head title="Configurações" onBack={onBack} />
      <Card style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Av src={user?.photo} name={user?.name} sz={48} fs={18} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 16, fontWeight: 700 }}>{user?.name}</p>
            <p style={{ fontSize: 12, color: B.muted }}>{user?.role || "Colaborador"}</p>
          </div>
          <Tag color={B.green}>Ativo</Tag>
        </div>
      </Card>
      {[
        { k: "profile", l: "Perfil", ic: IC.team(B.accent), desc: "Dados pessoais, contato, cargo" },
        { k: "approvals", l: "Aprovações", ic: IC.shield, desc: "Aprovar novos cadastros", badge: 2 },
        { k: "aparencia", l: "Aparência", ic: IC.palette, desc: "Tema e modo escuro" },
        { k: "notifs", l: "Notificações", ic: IC.bell, desc: "Chat, tarefas, e-mail, sons" },
        { k: "navmenu", l: "Personalizar Menu", ic: IC.more(B.accent), desc: "Escolha os itens do menu", act: () => onNavEdit && onNavEdit() },
        { k: "sec", l: "Segurança", ic: IC.lock, desc: "Senha, 2FA, sessões" },
        { k: "about", l: "Sobre", ic: IC.info, desc: "Versão e termos" },
      ].map((s, i) => (
        <Card key={s.k} delay={i * 0.04} onClick={() => s.act ? s.act() : setSub(s.k)} style={{ marginTop: 8, cursor: "pointer" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: `${B.accent}10`, display: "flex", alignItems: "center", justifyContent: "center", color: B.accent }}>{typeof s.ic === "function" ? s.ic : s.ic}</div>
            <div style={{ flex: 1 }}><p style={{ fontSize: 14, fontWeight: 600 }}>{s.l}</p><p style={{ fontSize: 11, color: B.muted }}>{s.desc}</p></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {s.badge && <div style={{ width: 20, height: 20, borderRadius: 10, background: B.red, color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{s.badge}</div>}
              {IC.chev()}
            </div>
          </div>
        </Card>
      ))}
      <button onClick={onLogout} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 14, width: "100%", background: `${B.red}08`, borderRadius: 14, border: `1px solid ${B.red}20`, cursor: "pointer", color: B.red, fontFamily: "inherit", marginTop: 20, fontSize: 14 }}>{IC.logout()} Sair da Conta</button>
      <p style={{ fontSize: 11, color: B.muted, textAlign: "center", marginTop: 12 }}>UniqueHub Agency v1.0</p>
    </div>
  );
}


/* ═══════════════════════ NAV SYSTEM ═══════════════════════ */
const ALL_TABS = [
  { k: "home", l: "Home", i: IC.home },
  { k: "content", l: "Conteúdo", i: IC.content },
  { k: "chat", l: "Chat", i: IC.chat },
  { k: "clients", l: "Clientes", i: IC.clients },
  { k: "team", l: "Equipe", i: IC.team },
  { k: "checkin", l: "Check-in", i: IC.checkin },
  { k: "academy", l: "Academy", i: IC.academy },
  { k: "financial", l: "Financeiro", i: IC.financial },
  { k: "calendar", l: "Calendário", i: IC.calendar },
  { k: "library", l: "Biblioteca", i: IC.library },
  { k: "reports", l: "Relatórios", i: IC.reports },
  { k: "news", l: "News", i: IC.news },
  { k: "ideas", l: "Ideias", i: IC.ideas },
  { k: "ai", l: "IA", i: IC.ai },
  { k: "gamify", l: "Ranking", i: IC.gamify },
  { k: "help", l: "Ajuda", i: IC.help },
  { k: "search", l: "Buscar", i: IC.search },
  { k: "settings", l: "Config", i: IC.settings },
];
const DEFAULT_NAV = ["home", "content", "chat", "clients"];
const moreItems = [
  { k: "checkin", l: "Check-in" }, { k: "academy", l: "Academy" }, { k: "team", l: "Equipe" },
  { k: "financial", l: "Financeiro" }, { k: "calendar", l: "Calendário" }, { k: "library", l: "Biblioteca" },
  { k: "reports", l: "Relatórios" }, { k: "news", l: "News" }, { k: "ideas", l: "Ideias" },
  { k: "ai", l: "Assistente IA" }, { k: "gamify", l: "Ranking" }, { k: "help", l: "Ajuda" }, { k: "search", l: "Buscar" }, { k: "settings", l: "Config" },
];

function MoreSheet({ onClose, goSub }) {
  return (
    <>
      <div onClick={onClose} className="overlay" />
      <div className="sheet">
        <div style={{ width: 32, height: 4, borderRadius: 2, background: B.border, margin: "0 auto 12px" }} />
        <p style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: B.text }}>Mais funcionalidades</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
          {moreItems.map(it => {
            const tab = ALL_TABS.find(t => t.k === it.k);
            return (
              <button key={it.k} onClick={() => { goSub(it.k); onClose(); }} className="grid-btn">
                <div style={{ width: 44, height: 44, borderRadius: 14, background: `${B.accent}10`, display: "flex", alignItems: "center", justifyContent: "center", color: B.accent, marginBottom: 2 }}>{tab?.i(B.accent)}</div>
                <span style={{ fontSize: 10, fontWeight: 600, color: B.text }}>{it.l}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function NavEditSheet({ picks, setPicks, onClose }) {
  const avail = ALL_TABS.filter(t => t.k !== "more");
  const toggle = k => { if (picks.includes(k)) { if (picks.length <= 3) return; setPicks(p => p.filter(x => x !== k)); } else { if (picks.length >= 5) return; setPicks(p => [...p, k]); } };
  const moveNav = (i, d) => { setPicks(prev => { const n = [...prev]; const j = i + d; if (j < 0 || j >= n.length) return prev; [n[i], n[j]] = [n[j], n[i]]; return n; }); };

  return (
    <>
      <div onClick={onClose} className="overlay" />
      <div className="sheet" style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ width: 32, height: 4, borderRadius: 2, background: B.border, margin: "0 auto 12px" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div><h3 style={{ fontSize: 16, fontWeight: 800 }}>Personalizar Menu</h3><p style={{ fontSize: 11, color: B.muted, marginTop: 2 }}>Escolha 3 a 5 itens</p></div>
          <button onClick={onClose} style={{ background: B.accent, color: B.textOnAccent, border: "none", borderRadius: 10, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Pronto</button>
        </div>
        <p style={{ fontSize: 11, fontWeight: 600, color: B.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Selecionados ({picks.length}/5)</p>
        {picks.map((k, i) => {
          const t = ALL_TABS.find(x => x.k === k);
          if (!t) return null;
          return (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: `${B.accent}08`, border: `1.5px solid ${B.accent}20`, marginTop: i ? 6 : 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: B.accent, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.i("#192126")}</div>
              <p style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{t.l}</p>
              <div style={{ display: "flex", gap: 3 }}>
                <button disabled={i === 0} onClick={() => moveNav(i, -1)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${B.border}`, background: i === 0 ? "transparent" : `${B.accent}08`, cursor: i === 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: i === 0 ? .3 : 1 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="3"><polyline points="18 15 12 9 6 15" /></svg></button>
                <button disabled={i === picks.length - 1} onClick={() => moveNav(i, 1)} style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${B.border}`, background: i === picks.length - 1 ? "transparent" : `${B.accent}08`, cursor: i === picks.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: i === picks.length - 1 ? .3 : 1 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={B.text} strokeWidth="3"><polyline points="6 9 12 15 18 9" /></svg></button>
                <button onClick={() => toggle(k)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(239,68,68,0.1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
              </div>
            </div>
          );
        })}
        <p style={{ fontSize: 11, fontWeight: 600, color: B.muted, textTransform: "uppercase", letterSpacing: 1, marginTop: 16, marginBottom: 8 }}>Disponíveis</p>
        {avail.filter(t => !picks.includes(t.k)).map((t, i) => (
          <div key={t.k} onClick={() => toggle(t.k)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: B.bgCard, border: `1.5px solid ${B.border}`, marginTop: i ? 6 : 0, cursor: picks.length >= 5 ? "default" : "pointer", opacity: picks.length >= 5 ? .4 : 1 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `${B.muted}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>{t.i(B.muted)}</div>
            <p style={{ fontSize: 13, fontWeight: 500, flex: 1, color: B.muted }}>{t.l}</p>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: `${B.accent}10`, display: "flex", alignItems: "center", justifyContent: "center" }}>{IC.plus}</div>
          </div>
        ))}
      </div>
    </>
  );
}

/* ═══════════════════════ PLACEHOLDER PAGES ═══════════════════════ */
/* ═══════════════════════ TEAM PAGE ═══════════════════════ */
function TeamPage({ onBack }) {
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({});
  const [members, setMembers] = useState(AGENCY_TEAM.map(m => ({
    ...m,
    email: `${m.name.toLowerCase()}@uniquemkt.com.br`,
    phone: m.name === "Matheus" ? "(24) 99999-0001" : m.name === "Alice" ? "(24) 99999-0002" : m.name === "Allan" ? "(24) 99999-0003" : "(24) 99999-0004",
    since: m.name === "Matheus" ? "01/2023" : m.name === "Alice" ? "06/2024" : m.name === "Allan" ? "03/2025" : "08/2025",
    skills: m.role === "CEO / Estrategista" ? ["Planejamento","Tráfego Pago","Design","Gestão"] : m.role === "Social Media" ? ["Copywriting","Planejamento","Instagram","TikTok"] : ["Filmagem","Edição","Motion Graphics","Fotografia"],
    tasks: { total: Math.floor(Math.random()*30+10), done: Math.floor(Math.random()*20+5), pending: Math.floor(Math.random()*8+1) },
  })));
  const { showToast, ToastEl } = useToast();

  const addMember = () => {
    if (!form.name?.trim()) return showToast("Informe o nome");
    const nm = { id: Date.now(), name: form.name.trim(), role: form.role || "Social Media", photo: null, status: "offline", email: form.email || "", phone: form.phone || "", since: new Date().toLocaleDateString("pt-BR",{month:"2-digit",year:"numeric"}), skills: [], tasks: { total:0, done:0, pending:0 } };
    setMembers(p => [...p, nm]);
    setAdding(false); setForm({});
    showToast("Membro adicionado! ✓");
  };

  if (adding) return (
    <div className="pg">
      {ToastEl}
      <Head title="Novo Membro" onBack={() => { setAdding(false); setForm({}); }} />
      <Card>
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Nome *</label>
        <input value={form.name||""} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Nome completo" className="tinput" style={{ marginBottom:12 }} />
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Cargo</label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:12 }}>
          {["Social Media","Designer","Audiovisual","Redator(a)","Gestor de Tráfego","Atendimento","Estagiário(a)"].map(r=>(
            <button key={r} onClick={()=>setForm(p=>({...p,role:r}))} style={{ padding:"6px 12px", borderRadius:8, border:`1.5px solid ${form.role===r?B.accent:B.border}`, background:form.role===r?`${B.accent}10`:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600 }}>{r}</button>
          ))}
        </div>
        <label className="sl" style={{ display:"block", marginBottom:4 }}>E-mail</label>
        <input value={form.email||""} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="email@uniquemkt.com.br" className="tinput" style={{ marginBottom:12 }} />
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Telefone</label>
        <input value={form.phone||""} onChange={e=>setForm(p=>({...p,phone:e.target.value}))} placeholder="(24) 99999-0000" className="tinput" />
      </Card>
      <button onClick={addMember} className="pill full accent" style={{ marginTop:16, padding:"14px 0" }}>Adicionar Membro</button>
    </div>
  );

  if (sel) {
    const m = sel;
    return (
      <div className="pg">
        {ToastEl}
        <Head title="" onBack={() => setSel(null)} />
        <Card style={{ textAlign:"center", marginBottom:12 }}>
          <div style={{ position:"relative", display:"inline-block" }}>
            <Av name={m.name} sz={72} fs={28} />
            <div style={{ position:"absolute", bottom:2, right:2, width:14, height:14, borderRadius:7, background:m.status==="online"?B.green:B.muted, border:"3px solid #fff" }} />
          </div>
          <h3 style={{ fontSize:18, fontWeight:800, marginTop:8 }}>{m.name}</h3>
          <p style={{ fontSize:13, color:B.accent, fontWeight:600 }}>{m.role}</p>
          <p style={{ fontSize:11, color:B.muted, marginTop:4 }}>{m.status === "online" ? "Online agora" : "Offline"}</p>
        </Card>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:12 }}>
          <Card style={{ textAlign:"center", padding:10 }}><p style={{ fontSize:18, fontWeight:900, color:B.blue }}>{m.tasks.total}</p><p style={{ fontSize:9, color:B.muted }}>Total</p></Card>
          <Card style={{ textAlign:"center", padding:10 }}><p style={{ fontSize:18, fontWeight:900, color:B.green }}>{m.tasks.done}</p><p style={{ fontSize:9, color:B.muted }}>Concluídas</p></Card>
          <Card style={{ textAlign:"center", padding:10 }}><p style={{ fontSize:18, fontWeight:900, color:B.orange }}>{m.tasks.pending}</p><p style={{ fontSize:9, color:B.muted }}>Pendentes</p></Card>
        </div>
        <p className="sl" style={{ marginBottom:6 }}>Informações</p>
        <Card>
          {[{l:"E-mail",v:m.email},{l:"Telefone",v:m.phone},{l:"Na equipe desde",v:m.since},{l:"Cargo",v:m.role}].map((item,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderTop:i?`1px solid ${B.border}`:"none" }}>
              <span style={{ fontSize:11, color:B.muted }}>{item.l}</span>
              <span style={{ fontSize:13, fontWeight:600 }}>{item.v||"—"}</span>
            </div>
          ))}
        </Card>
        {m.skills.length > 0 && <>
          <p className="sl" style={{ marginTop:14, marginBottom:6 }}>Habilidades</p>
          <Card>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {m.skills.map((s,i) => <Tag key={i} color={B.accent}>{s}</Tag>)}
            </div>
          </Card>
        </>}
      </div>
    );
  }

  return (
    <div className="pg">
      {ToastEl}
      <Head title="Equipe" onBack={onBack} right={
        <button onClick={() => setAdding(true)} style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 14px", borderRadius:10, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.text }}>{IC.plus} Novo</button>
      } />
      <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
          <div><p style={{ fontSize:22, fontWeight:900 }}>{members.length}</p><p style={{ fontSize:10, opacity:.7 }}>Membros</p></div>
          <div><p style={{ fontSize:22, fontWeight:900, color:B.green }}>{members.filter(m=>m.status==="online").length}</p><p style={{ fontSize:10, opacity:.7 }}>Online</p></div>
          <div><p style={{ fontSize:22, fontWeight:900, color:B.accent }}>{members.reduce((a,m)=>a+m.tasks.pending,0)}</p><p style={{ fontSize:10, opacity:.7 }}>Tarefas</p></div>
        </div>
      </Card>
      {members.map((m,i) => (
        <Card key={m.id} delay={i*0.03} onClick={() => setSel(m)} style={{ marginTop:i?6:0, cursor:"pointer" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ position:"relative" }}>
              <Av name={m.name} sz={44} fs={16} />
              <div style={{ position:"absolute", bottom:0, right:0, width:12, height:12, borderRadius:6, background:m.status==="online"?B.green:B.muted, border:"2px solid #fff" }} />
            </div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14, fontWeight:700 }}>{m.name}</p>
              <p style={{ fontSize:11, color:B.accent, fontWeight:500 }}>{m.role}</p>
            </div>
            <div style={{ textAlign:"right" }}>
              <p style={{ fontSize:12, fontWeight:700, color:B.blue }}>{m.tasks.pending} <span style={{ fontWeight:400, color:B.muted }}>pendentes</span></p>
              <p style={{ fontSize:10, color:B.muted }}>Desde {m.since}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════ CALENDAR PAGE ═══════════════════════ */
function CalendarPage({ onBack, clients: propClients }) {
  const CDATA = propClients || CLIENTS_DATA_INIT;
  const today = new Date();
  const [curMonth, setCurMonth] = useState(today.getMonth());
  const [curYear, setCurYear] = useState(today.getFullYear());
  const [selDay, setSelDay] = useState(today.getDate());
  const [viewEvent, setViewEvent] = useState(null);
  const [adding, setAdding] = useState(false);
  const [eventType, setEventType] = useState(null);
  const [form, setForm] = useState({});
  const { showToast, ToastEl } = useToast();

  const EVENT_TYPES = [
    { k:"meeting", l:"Reunião", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>, c:B.blue, desc:"Interna ou com cliente, online ou presencial" },
    { k:"recording", l:"Gravação", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>, c:B.orange, desc:"Vídeo, foto, produção audiovisual" },
    { k:"event", l:"Evento", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, c:B.purple, desc:"Workshop, feira, inauguração, live" },
    { k:"reminder", l:"Lembrete", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>, c:B.cyan, desc:"Prazo, entrega, tarefa, nota pessoal" },
    { k:"deadline", l:"Deadline", icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, c:B.red, desc:"Data limite de entrega" },
  ];

  const EQUIPMENTS = ["Câmera DSLR","Câmera Mirrorless","Tripé","Gimbal","Drone","Ring Light","Softbox","Microfone Lapela","Microfone Boom","Luz LED Portátil","Rebatedor","Fundo Chroma","Cartão de Memória Extra","Bateria Extra","Notebook p/ Review","HD Externo"];

  const EVENTS_MOCK = [
    { id:1, type:"meeting", title:"Reunião semanal — TechSmart", time:"09:00", color:B.blue, day:3, month:2, year:2026, createdBy:"Matheus", meetingMode:"online", meetingScope:"client", client:"TechSmart", participants:["Matheus","Alice"], location:"Google Meet", notes:"Alinhamento de pauta mensal" },
    { id:2, type:"deadline", title:"Entrega posts — Casa Nova", time:"12:00", color:B.red, day:3, month:2, year:2026, createdBy:"Alice", notes:"8 posts para feed + 5 stories" },
    { id:3, type:"recording", title:"Gravar vídeos — Studio Fitness", time:"14:00", color:B.orange, day:4, month:2, year:2026, createdBy:"Victoria", client:"Studio Fitness", participants:["Victoria","Matheus"], location:"Academia Studio Fitness, Petrópolis", equipment:["Câmera Mirrorless","Gimbal","Microfone Lapela","Luz LED Portátil","Bateria Extra"], notes:"3 reels de exercícios + 1 depoimento de aluno" },
    { id:4, type:"meeting", title:"Review mensal — Bella Estética", time:"10:00", color:B.blue, day:5, month:2, year:2026, createdBy:"Matheus", meetingMode:"presencial", meetingScope:"client", client:"Bella Estética", participants:["Matheus","Alice"], location:"Clínica Bella Estética, Av. Brasil 456", notes:"Apresentar relatório de performance de fevereiro" },
    { id:5, type:"deadline", title:"Publicar campanha — Pet Love", time:"16:00", color:B.red, day:5, month:2, year:2026, createdBy:"Alice", client:"Pet Love Shop", notes:"Campanha de março, 4 posts agendados" },
    { id:6, type:"recording", title:"Sessão de fotos — Padaria Real", time:"08:00", color:B.orange, day:6, month:2, year:2026, createdBy:"Victoria", client:"Padaria Real", participants:["Victoria"], location:"Padaria Real, Rua do Pão 10", equipment:["Câmera DSLR","Tripé","Softbox","Rebatedor","Cartão de Memória Extra"], notes:"Fotos de produtos novos para cardápio digital" },
    { id:7, type:"meeting", title:"Planejamento mensal", time:"09:00", color:B.blue, day:7, month:2, year:2026, createdBy:"Matheus", meetingMode:"presencial", meetingScope:"internal", participants:["Matheus","Alice","Allan","Victoria"], location:"Escritório Unique", notes:"Planejamento do mês de março, metas e KPIs" },
    { id:8, type:"reminder", title:"Enviar relatórios mensais", time:"18:00", color:B.cyan, day:10, month:2, year:2026, createdBy:"Matheus", notes:"Enviar relatórios para todos os clientes Premium" },
    { id:9, type:"meeting", title:"Onboarding — Clínica Saúde+", time:"11:00", color:B.blue, day:12, month:2, year:2026, createdBy:"Matheus", meetingMode:"online", meetingScope:"client", client:"Clínica Saúde+", participants:["Matheus","Alice"], location:"Zoom", notes:"Primeiro alinhamento — coletar briefing e acessos" },
    { id:10, type:"recording", title:"Gravar reels — TechSmart", time:"15:00", color:B.orange, day:14, month:2, year:2026, createdBy:"Victoria", client:"TechSmart", participants:["Victoria","Allan"], location:"Loja TechSmart, Rua Tech 789", equipment:["Câmera Mirrorless","Gimbal","Microfone Lapela","Ring Light","Notebook p/ Review","HD Externo"], notes:"5 reels de review de produtos, unboxing rápido" },
    { id:11, type:"event", title:"Workshop de Redes Sociais", time:"19:00", color:B.purple, day:17, month:2, year:2026, createdBy:"Matheus", participants:["Matheus","Alice","Allan"], location:"Espaço Coworking, Centro Petrópolis", notes:"Workshop aberto para clientes e prospects, 2h de duração" },
    { id:12, type:"meeting", title:"Reunião alinhamento equipe", time:"09:00", color:B.blue, day:20, month:2, year:2026, createdBy:"Matheus", meetingMode:"presencial", meetingScope:"internal", participants:["Matheus","Alice","Allan","Victoria"], location:"Escritório Unique", notes:"Revisão de processos e feedback" },
    { id:13, type:"deadline", title:"Publicar campanha março", time:"10:00", color:B.red, day:1, month:2, year:2026, createdBy:"Alice" },
  ];
  const [events, setEvents] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  useEffect(() => {
    if (!supabase || eventsLoaded) return;
    supaLoadEvents().then(rows => {
      if (rows) {
        if (rows.length > 0) {
          setEvents(rows.map(r => mergeSupaEvent(r)));
        } else {
          setEvents([]);
        }
      } else {
        setEvents(EVENTS_MOCK);
      }
      setEventsLoaded(true);
    });
  }, [eventsLoaded]);

  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const DAYS_W = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const daysInMonth = new Date(curYear, curMonth+1, 0).getDate();
  const firstDow = new Date(curYear, curMonth, 1).getDay();

  const dayEvents = events.filter(e => e.day === selDay && e.month === curMonth && e.year === curYear);
  const hasEvents = (d) => events.some(e => e.day === d && e.month === curMonth && e.year === curYear);
  const isToday = (d) => d === today.getDate() && curMonth === today.getMonth() && curYear === today.getFullYear();
  const prevMonth = () => { if (curMonth===0){setCurMonth(11);setCurYear(y=>y-1);}else setCurMonth(m=>m-1); setSelDay(1); };
  const nextMonth = () => { if (curMonth===11){setCurMonth(0);setCurYear(y=>y+1);}else setCurMonth(m=>m+1); setSelDay(1); };

  const toggleArr = (arr, val) => arr.includes(val) ? arr.filter(x=>x!==val) : [...arr, val];

  const saveEvent = async () => {
    if (!form.title?.trim()) return showToast("Informe o título do evento");
    const et = EVENT_TYPES.find(t=>t.k===eventType);
    const ne = {
      id: Date.now(), type: eventType, title: form.title.trim(), time: form.time || "09:00",
      color: et?.c || B.blue, day: selDay, month: curMonth, year: curYear,
      createdBy: "Matheus", notes: form.notes || "",
      ...(eventType === "meeting" && { meetingMode: form.meetingMode || "online", meetingScope: form.meetingScope || "internal", participants: form.participants || [], client: form.client || "", location: form.location || "" }),
      ...(eventType === "recording" && { client: form.client || "", participants: form.participants || [], location: form.location || "", equipment: form.equipment || [] }),
      ...(eventType === "event" && { participants: form.participants || [], location: form.location || "" }),
      ...(eventType === "reminder" && {}),
      ...(eventType === "deadline" && { client: form.client || "" }),
    };
    const saved = await supaCreateEvent(ne);
    if (saved) { ne.id = saved.id; ne.supaId = saved.id; }
    setEvents(p=>[...p, ne]);
    setAdding(false); setEventType(null); setForm({});
    showToast("Adicionado ao calendário! ✓");
  };

  const deleteEvent = (id) => {
    const ev = events.find(e => e.id === id);
    if (ev?.supaId) supaDeleteEvent(ev.supaId);
    setEvents(p=>p.filter(e=>e.id!==id)); setViewEvent(null); showToast("Evento removido");
  };

  const etCfg = (type) => EVENT_TYPES.find(t=>t.k===type) || EVENT_TYPES[0];

  /* ── VIEW EVENT DETAIL ── */
  if (viewEvent) {
    const ev = viewEvent;
    const et = etCfg(ev.type);
    return (
      <div className="pg">
        {ToastEl}
        <Head title="" onBack={() => setViewEvent(null)} right={
          <button onClick={() => deleteEvent(ev.id)} style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 12px", borderRadius:10, background:`${B.red}08`, border:`1.5px solid ${B.red}20`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.red }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Excluir
          </button>
        } />
        <Card style={{ marginBottom:12, borderLeft:`4px solid ${et.c}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <div style={{ width:44, height:44, borderRadius:14, background:`${et.c}12`, display:"flex", alignItems:"center", justifyContent:"center", color:et.c }}>{et.icon}</div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:16, fontWeight:800 }}>{ev.title}</p>
              <p style={{ fontSize:12, color:B.muted }}>{et.l} · {ev.day} de {MONTHS[ev.month]} de {ev.year}</p>
            </div>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            <Tag color={et.c}>{et.l}</Tag>
            <Tag color={B.dark}>{ev.time}</Tag>
            {ev.meetingMode && <Tag color={ev.meetingMode==="online"?B.blue:B.green}>{ev.meetingMode==="online"?"Online":"Presencial"}</Tag>}
            {ev.meetingScope && <Tag color={ev.meetingScope==="internal"?B.purple:B.orange}>{ev.meetingScope==="internal"?"Interna":"Com cliente"}</Tag>}
          </div>
        </Card>

        {/* Details */}
        <Card>
          {[
            { l:"Criado por", v:ev.createdBy, show:true },
            { l:"Horário", v:ev.time, show:true },
            { l:"Local", v:ev.location, show:!!ev.location },
            { l:"Cliente", v:ev.client, show:!!ev.client },
            { l:"Modo", v:ev.meetingMode==="online"?"Online (remoto)":"Presencial", show:!!ev.meetingMode },
            { l:"Escopo", v:ev.meetingScope==="internal"?"Reunião interna (equipe)":"Reunião com cliente", show:!!ev.meetingScope },
          ].filter(x=>x.show).map((item,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderTop:i?`1px solid ${B.border}`:"none" }}>
              <span style={{ fontSize:11, color:B.muted }}>{item.l}</span>
              <span style={{ fontSize:13, fontWeight:600, textAlign:"right", maxWidth:"60%" }}>{item.v||"—"}</span>
            </div>
          ))}
        </Card>

        {/* Participants */}
        {ev.participants && ev.participants.length > 0 && <>
          <p className="sl" style={{ marginTop:14, marginBottom:6 }}>Participantes ({ev.participants.length})</p>
          <Card>
            {ev.participants.map((name,i) => {
              const m = AGENCY_TEAM.find(t=>t.name===name);
              return (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderTop:i?`1px solid ${B.border}`:"none" }}>
                  <Av name={name} sz={32} fs={12} />
                  <div><p style={{ fontSize:13, fontWeight:600 }}>{name}</p><p style={{ fontSize:10, color:B.muted }}>{m?.role||"Equipe"}</p></div>
                </div>
              );
            })}
          </Card>
        </>}

        {/* Equipment */}
        {ev.equipment && ev.equipment.length > 0 && <>
          <p className="sl" style={{ marginTop:14, marginBottom:6 }}>Equipamentos ({ev.equipment.length})</p>
          <Card>
            {ev.equipment.map((eq,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderTop:i?`1px solid ${B.border}`:"none" }}>
                <div style={{ width:24, height:24, borderRadius:8, background:`${B.orange}10`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={B.orange} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <span style={{ fontSize:12, fontWeight:500 }}>{eq}</span>
              </div>
            ))}
          </Card>
        </>}

        {/* Notes */}
        {ev.notes && <>
          <p className="sl" style={{ marginTop:14, marginBottom:6 }}>Observações</p>
          <Card><p style={{ fontSize:13, lineHeight:1.6 }}>{ev.notes}</p></Card>
        </>}
      </div>
    );
  }

  /* ── ADD EVENT: PICK TYPE ── */
  if (adding && !eventType) return (
    <div className="pg">
      {ToastEl}
      <Head title="Novo no Calendário" onBack={() => { setAdding(false); setForm({}); }} />
      <Card style={{ marginBottom:12, background:`${B.accent}06`, border:`1px solid ${B.accent}15` }}>
        <p style={{ fontSize:13, fontWeight:700 }}>{selDay} de {MONTHS[curMonth]} de {curYear}</p>
        <p style={{ fontSize:11, color:B.muted }}>Escolha o tipo de evento</p>
      </Card>
      {EVENT_TYPES.map((et, i) => (
        <Card key={et.k} delay={i*0.03} onClick={() => setEventType(et.k)} style={{ marginTop:i?8:0, cursor:"pointer", borderLeft:`4px solid ${et.c}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:44, height:44, borderRadius:14, background:`${et.c}12`, display:"flex", alignItems:"center", justifyContent:"center", color:et.c }}>{et.icon}</div>
            <div style={{ flex:1 }}><p style={{ fontSize:14, fontWeight:700 }}>{et.l}</p><p style={{ fontSize:11, color:B.muted }}>{et.desc}</p></div>
            {IC.chev()}
          </div>
        </Card>
      ))}
    </div>
  );

  /* ── ADD EVENT: FORM ── */
  if (adding && eventType) {
    const et = etCfg(eventType);
    return (
      <div className="pg">
        {ToastEl}
        <Head title={`Nova ${et.l}`} onBack={() => { setEventType(null); setForm({}); }} />
        <Card style={{ marginBottom:12, background:`${et.c}06`, border:`1px solid ${et.c}15` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ color:et.c }}>{et.icon}</div>
            <div><p style={{ fontSize:13, fontWeight:700, color:et.c }}>{et.l}</p><p style={{ fontSize:11, color:B.muted }}>{selDay} de {MONTHS[curMonth]} de {curYear}</p></div>
          </div>
        </Card>

        {/* Title */}
        <Card style={{ marginBottom:8 }}>
          <label className="sl" style={{ display:"block", marginBottom:4 }}>Título *</label>
          <input value={form.title||""} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder={eventType==="meeting"?"Ex: Reunião mensal com TechSmart":eventType==="recording"?"Ex: Gravar reels no Studio Fitness":eventType==="event"?"Ex: Workshop de Redes Sociais":"Ex: Enviar relatórios mensais"} className="tinput" />
        </Card>

        {/* Time */}
        <Card style={{ marginBottom:8 }}>
          <label className="sl" style={{ display:"block", marginBottom:4 }}>Horário</label>
          <input type="time" value={form.time||"09:00"} onChange={e=>setForm(p=>({...p,time:e.target.value}))} className="tinput" />
        </Card>

        {/* Meeting-specific */}
        {eventType === "meeting" && <>
          <Card style={{ marginBottom:8 }}>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Modalidade</label>
            <div style={{ display:"flex", gap:6 }}>
              {[{k:"online",l:"Online",ic:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>},{k:"presencial",l:"Presencial",ic:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>}].map(m=>(
                <button key={m.k} onClick={()=>setForm(p=>({...p,meetingMode:m.k}))} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"12px 0", borderRadius:10, border:`1.5px solid ${(form.meetingMode||"online")===m.k?B.blue:B.border}`, background:(form.meetingMode||"online")===m.k?`${B.blue}08`:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:(form.meetingMode||"online")===m.k?B.blue:B.muted }}>{m.ic} {m.l}</button>
              ))}
            </div>
          </Card>
          <Card style={{ marginBottom:8 }}>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Tipo da reunião</label>
            <div style={{ display:"flex", gap:6 }}>
              {[{k:"internal",l:"Interna (equipe)",c:B.purple},{k:"client",l:"Com cliente",c:B.orange}].map(s=>(
                <button key={s.k} onClick={()=>setForm(p=>({...p,meetingScope:s.k}))} style={{ flex:1, padding:"12px 0", borderRadius:10, border:`1.5px solid ${(form.meetingScope||"internal")===s.k?s.c:B.border}`, background:(form.meetingScope||"internal")===s.k?`${s.c}08`:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, color:(form.meetingScope||"internal")===s.k?s.c:B.muted }}>{s.l}</button>
              ))}
            </div>
          </Card>
        </>}

        {/* Client picker (meeting with client, recording, deadline) */}
        {((eventType==="meeting" && (form.meetingScope||"internal")==="client") || eventType==="recording" || eventType==="deadline") && (
          <Card style={{ marginBottom:8 }}>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Cliente</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {CDATA.map(c=>(
                <button key={c.id} onClick={()=>setForm(p=>({...p,client:c.name}))} style={{ padding:"6px 12px", borderRadius:8, border:`1.5px solid ${form.client===c.name?B.accent:B.border}`, background:form.client===c.name?`${B.accent}10`:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600 }}>{c.name}</button>
              ))}
            </div>
          </Card>
        )}

        {/* Participants (meeting, recording, event) */}
        {(eventType==="meeting" || eventType==="recording" || eventType==="event") && (
          <Card style={{ marginBottom:8 }}>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Participantes da equipe</label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {AGENCY_TEAM.map(m=>{
                const selected = (form.participants||[]).includes(m.name);
                return (
                  <button key={m.id} onClick={()=>setForm(p=>({...p,participants:toggleArr(p.participants||[],m.name)}))} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:10, border:`1.5px solid ${selected?B.accent:B.border}`, background:selected?`${B.accent}10`:B.bgCard, cursor:"pointer", fontFamily:"inherit" }}>
                    <Av name={m.name} sz={20} fs={8} />
                    <span style={{ fontSize:11, fontWeight:600 }}>{m.name}</span>
                    {selected && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* Location */}
        {(eventType==="meeting" || eventType==="recording" || eventType==="event") && (
          <Card style={{ marginBottom:8 }}>
            <label className="sl" style={{ display:"block", marginBottom:4 }}>Local</label>
            <input value={form.location||""} onChange={e=>setForm(p=>({...p,location:e.target.value}))} placeholder={eventType==="meeting"?(form.meetingMode||"online")==="online"?"Ex: Google Meet, Zoom":"Ex: Escritório Unique, Rua...":"Ex: Endereço do cliente, estúdio..."} className="tinput" />
          </Card>
        )}

        {/* Equipment (recording only) */}
        {eventType === "recording" && (
          <Card style={{ marginBottom:8 }}>
            <label className="sl" style={{ display:"block", marginBottom:6 }}>Equipamentos</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:4 }}>
              {EQUIPMENTS.map(eq => {
                const selected = (form.equipment||[]).includes(eq);
                return (
                  <button key={eq} onClick={()=>setForm(p=>({...p,equipment:toggleArr(p.equipment||[],eq)}))} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 10px", borderRadius:8, border:`1.5px solid ${selected?B.orange:B.border}`, background:selected?`${B.orange}08`:B.bgCard, cursor:"pointer", fontFamily:"inherit", textAlign:"left" }}>
                    {selected ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.orange} strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> : <div style={{ width:14, height:14, borderRadius:4, border:`1.5px solid ${B.border}` }}/>}
                    <span style={{ fontSize:10, fontWeight:selected?600:400, color:selected?B.dark:B.muted }}>{eq}</span>
                  </button>
                );
              })}
            </div>
            {(form.equipment||[]).length > 0 && <p style={{ fontSize:10, color:B.orange, fontWeight:600, marginTop:6 }}>{(form.equipment||[]).length} equipamento{(form.equipment||[]).length>1?"s":""} selecionado{(form.equipment||[]).length>1?"s":""}</p>}
          </Card>
        )}

        {/* Notes */}
        <Card style={{ marginBottom:8 }}>
          <label className="sl" style={{ display:"block", marginBottom:4 }}>Observações</label>
          <textarea value={form.notes||""} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} placeholder="Detalhes adicionais..." className="tinput" style={{ minHeight:60, resize:"vertical" }} />
        </Card>

        {/* Creator info */}
        <Card style={{ marginBottom:8, background:`${B.muted}04` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <Av name="Matheus" sz={28} fs={10} />
            <div><p style={{ fontSize:11, color:B.muted }}>Criado por</p><p style={{ fontSize:12, fontWeight:600 }}>Matheus</p></div>
          </div>
        </Card>

        <button onClick={saveEvent} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, width:"100%", padding:"14px 0", borderRadius:14, background:et.c, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:700, color:"#fff", marginTop:4 }}>
          {et.icon} Salvar {et.l}
        </button>
      </div>
    );
  }

  /* ── MAIN CALENDAR VIEW ── */
  return (
    <div className="pg">
      {ToastEl}
      <Head title="Calendário" onBack={onBack} />
      <Card style={{ marginBottom:10 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <button onClick={prevMonth} className="ib" style={{ width:32, height:32 }}>{IC.back()}</button>
          <p style={{ fontSize:15, fontWeight:800 }}>{MONTHS[curMonth]} {curYear}</p>
          <button onClick={nextMonth} className="ib" style={{ width:32, height:32 }}>{IC.chev()}</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, textAlign:"center", marginBottom:4 }}>
          {DAYS_W.map(d=><span key={d} style={{ fontSize:10, fontWeight:600, color:B.muted }}>{d}</span>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2 }}>
          {Array.from({length:firstDow}).map((_,i)=><div key={`e${i}`}/>)}
          {Array.from({length:daysInMonth}).map((_,i) => {
            const d=i+1; const selected=d===selDay; const tdy=isToday(d); const has=hasEvents(d);
            const dayEvCount = events.filter(e=>e.day===d&&e.month===curMonth&&e.year===curYear).length;
            return (
              <button key={d} onClick={()=>setSelDay(d)} style={{ width:"100%", aspectRatio:"1", borderRadius:12, border:tdy&&!selected?`2px solid ${B.accent}`:"2px solid transparent", background:selected?B.accent:"transparent", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:selected||tdy?800:400, color:selected?B.dark:tdy?B.accent:B.dark, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, position:"relative" }}>
                {d}
                {has && <div style={{ display:"flex", gap:2, position:"absolute", bottom:2 }}>
                  {dayEvCount <= 3 ? Array.from({length:dayEvCount}).map((_,j)=><div key={j} style={{ width:4, height:4, borderRadius:2, background:selected?B.dark:B.accent }}/>) : <div style={{ width:4, height:4, borderRadius:2, background:selected?B.dark:B.accent }}/>}
                </div>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Events */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <p className="sl">{selDay} de {MONTHS[curMonth]} — {dayEvents.length} evento{dayEvents.length!==1?"s":""}</p>
        <button onClick={()=>setAdding(true)} style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 14px", borderRadius:10, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.text }}>{IC.plus} Novo</button>
      </div>
      {dayEvents.length === 0 ? (
        <Card style={{ textAlign:"center", padding:24 }}>
          <p style={{ fontSize:12, color:B.muted }}>Nenhum evento neste dia</p>
          <button onClick={()=>setAdding(true)} style={{ marginTop:8, padding:"8px 16px", borderRadius:8, background:`${B.accent}10`, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.accent }}>+ Adicionar evento</button>
        </Card>
      ) : dayEvents.sort((a,b)=>a.time.localeCompare(b.time)).map((ev,i) => {
        const et = etCfg(ev.type);
        return (
          <Card key={ev.id} delay={i*0.03} onClick={()=>setViewEvent(ev)} style={{ marginTop:i?6:0, borderLeft:`4px solid ${et.c}`, cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:`${et.c}12`, display:"flex", alignItems:"center", justifyContent:"center", color:et.c }}>{et.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.title}</p>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
                  <span style={{ fontSize:10, color:B.muted }}>{ev.time}</span>
                  <span style={{ fontSize:10, color:et.c, fontWeight:600 }}>{et.l}</span>
                  {ev.participants && ev.participants.length > 0 && <span style={{ fontSize:10, color:B.muted }}> · {ev.participants.length} pessoa{ev.participants.length>1?"s":""}</span>}
                </div>
              </div>
              {ev.participants && ev.participants.length > 0 && (
                <div style={{ display:"flex" }}>
                  {ev.participants.slice(0,3).map((name,j) => <div key={j} style={{ marginLeft:j?-8:0, zIndex:3-j }}><Av name={name} sz={24} fs={9} /></div>)}
                </div>
              )}
            </div>
            {ev.createdBy && <p style={{ fontSize:9, color:B.muted, marginTop:6 }}>Criado por {ev.createdBy}{ev.location ? ` · ${ev.location}` : ""}</p>}
          </Card>
        );
      })}
    </div>
  );
}

function LibraryPage({ onBack, clients: propClients }) {
  const CDATA = propClients || CLIENTS_DATA_INIT;
  const [filterClient, setFilterClient] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [viewFile, setViewFile] = useState(null);
  const { showToast, ToastEl } = useToast();

  const LIB_CATS = [
    { key:"brand", label:"Manual de Marca", icon:"📕", c:B.red },
    { key:"feed", label:"Posts Feed", icon:"📱", c:B.blue },
    { key:"stories", label:"Stories", icon:"📲", c:B.pink },
    { key:"reels", label:"Capas de Reels", icon:"🎬", c:B.purple },
    { key:"videos", label:"Vídeos", icon:"🎥", c:B.orange },
    { key:"digital", label:"Artes Digitais", icon:"🖥️", c:B.cyan },
    { key:"print", label:"Material Impresso", icon:"🖨️", c:B.green },
    { key:"docs", label:"Documentos", icon:"📄", c:B.muted },
    { key:"ref", label:"Referências", icon:"💡", c:B.yellow },
    { key:"other", label:"Outros", icon:"📁", c:B.muted },
  ];
  const catMap = { "Manual de Marca":"brand","Posts Feed":"feed","Stories":"stories","Capas de Reels":"reels","Vídeos":"videos","Artes Digitais":"digital","Material Impresso":"print","Documentos":"docs","Referências":"ref" };
  const getFileCat = (f) => catMap[f.category] || "other";

  const fileIcon = (name) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return { ic: IC.img, c: B.pink };
    if (["mp4","mov","avi","mkv"].includes(ext)) return { ic: IC.vid, c: B.orange };
    if (["pdf"].includes(ext)) return { ic: IC.doc, c: B.red };
    if (["psd","ai","fig","xd"].includes(ext)) return { ic: IC.palette, c: B.purple };
    if (["doc","docx","txt"].includes(ext)) return { ic: IC.doc, c: B.blue };
    return { ic: IC.doc, c: B.muted };
  };

  // Gather all files from all clients
  const allFiles = CDATA.flatMap(c => (c.files||[]).map(f => ({ ...f, clientName: c.name, clientId: c.id })));

  const filtered = allFiles.filter(f => {
    if (filterClient !== "all" && f.clientName !== filterClient) return false;
    if (filterCat !== "all" && getFileCat(f) !== filterCat) return false;
    if (search.trim()) {
      const s = search.toLowerCase();
      if (!f.name.toLowerCase().includes(s) && !f.clientName.toLowerCase().includes(s) && !(f.category||"").toLowerCase().includes(s)) return false;
    }
    return true;
  });

  // Stats
  const totalFiles = allFiles.length;
  const clientsWithFiles = [...new Set(allFiles.map(f => f.clientName))].length;
  const catCounts = {};
  allFiles.forEach(f => { const k = getFileCat(f); catCounts[k] = (catCounts[k]||0)+1; });
  const topCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0];

  // Group by category or client
  const grouped = {};
  filtered.forEach(f => {
    const key = filterClient !== "all" ? (f.category || "Outros") : f.clientName;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(f);
  });

  /* ── FILE DETAIL VIEW ── */
  if (viewFile) {
    const f = viewFile;
    const fi = fileIcon(f.name);
    const cat = LIB_CATS.find(c => c.key === getFileCat(f));
    return (
      <div className="pg">
        {ToastEl}
        <Head title="" onBack={() => setViewFile(null)} />
        <Card style={{ textAlign:"center", marginBottom:12 }}>
          <div style={{ width:64, height:64, borderRadius:20, background:`${fi.c}12`, display:"flex", alignItems:"center", justifyContent:"center", color:fi.c, margin:"0 auto 12px", transform:"scale(1.5)" }}>{fi.ic}</div>
          <h3 style={{ fontSize:15, fontWeight:800, marginTop:16, wordBreak:"break-all" }}>{f.name}</h3>
          <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:8 }}>
            <Tag color={fi.c}>{f.name.split(".").pop()?.toUpperCase()}</Tag>
            <Tag color={cat?.c || B.muted}>{cat?.icon} {cat?.label || "Outros"}</Tag>
          </div>
        </Card>
        <Card>
          {[
            { l:"Cliente", v:f.clientName },
            { l:"Categoria", v:f.category || "Outros" },
            { l:"Tamanho", v:f.size },
            { l:"Data", v:f.date },
            { l:"Extensão", v:f.name.split(".").pop()?.toUpperCase() },
          ].map((item,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"9px 0", borderTop:i?`1px solid ${B.border}`:"none" }}>
              <span style={{ fontSize:11, color:B.muted }}>{item.l}</span>
              <span style={{ fontSize:13, fontWeight:600 }}>{item.v}</span>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  /* ── MAIN LIBRARY VIEW ── */
  return (
    <div className="pg">
      {ToastEl}
      <Head title="Biblioteca" onBack={onBack} />

      {/* Stats */}
      <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
          <div><p style={{ fontSize:22, fontWeight:900 }}>{totalFiles}</p><p style={{ fontSize:10, opacity:.7 }}>Arquivos</p></div>
          <div><p style={{ fontSize:22, fontWeight:900, color:B.accent }}>{clientsWithFiles}</p><p style={{ fontSize:10, opacity:.7 }}>Clientes</p></div>
          <div><p style={{ fontSize:22, fontWeight:900, color:B.orange }}>{LIB_CATS.filter(c=>catCounts[c.key]).length}</p><p style={{ fontSize:10, opacity:.7 }}>Categorias</p></div>
        </div>
      </Card>

      {/* Search */}
      <div style={{ position:"relative", marginBottom:10 }}>
        <div style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:B.muted, display:"flex" }}>{IC.search(B.muted)}</div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar arquivo, cliente, categoria..." className="tinput" style={{ paddingLeft:40 }} />
      </div>

      {/* Client filter */}
      <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:6, overflowX:"auto", paddingBottom:4 }}>
        <button onClick={()=>setFilterClient("all")} className={`htab${filterClient==="all"?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>Todos os clientes</button>
        {CDATA.filter(c=>(c.files||[]).length>0).map(c => (
          <button key={c.id} onClick={()=>setFilterClient(c.name)} className={`htab${filterClient===c.name?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>{c.name} ({(c.files||[]).length})</button>
        ))}
      </div>

      {/* Category filter */}
      <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
        <button onClick={()=>setFilterCat("all")} className={`htab${filterCat==="all"?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>Todas categorias</button>
        {LIB_CATS.map(cat => {
          const count = allFiles.filter(f=>getFileCat(f)===cat.key).length;
          if (count === 0) return null;
          return <button key={cat.key} onClick={()=>setFilterCat(cat.key)} className={`htab${filterCat===cat.key?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>{cat.icon} {cat.label} ({count})</button>;
        })}
      </div>

      {/* Results count */}
      <p style={{ fontSize:11, color:B.muted, marginBottom:8 }}>{filtered.length} arquivo{filtered.length!==1?"s":""} encontrado{filtered.length!==1?"s":""}</p>

      {/* Grouped file list */}
      {filtered.length === 0 ? (
        <Card style={{ textAlign:"center", padding:24 }}>
          <p style={{ fontSize:14, fontWeight:700 }}>Nenhum arquivo encontrado</p>
          <p style={{ fontSize:12, color:B.muted, marginTop:4 }}>Tente ajustar os filtros ou busca.</p>
        </Card>
      ) : Object.entries(grouped).map(([groupName, groupFiles]) => (
        <div key={groupName}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:10, marginBottom:6 }}>
            <p className="sl">{filterClient !== "all" ? (LIB_CATS.find(c=>c.label===groupName)?.icon||"📁")+" " : ""}{groupName}</p>
            <span style={{ fontSize:10, color:B.muted }}>{groupFiles.length}</span>
          </div>
          {groupFiles.map(f => {
            const fi = fileIcon(f.name);
            const cat = LIB_CATS.find(c=>c.key===getFileCat(f));
            return (
              <Card key={`${f.clientId}-${f.id}`} onClick={() => setViewFile(f)} style={{ marginTop:4, cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:`${fi.c}10`, display:"flex", alignItems:"center", justifyContent:"center", color:fi.c, flexShrink:0 }}>{fi.ic}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</p>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
                      <span style={{ fontSize:10, color:B.muted }}>{f.size} · {f.date}</span>
                      {filterClient === "all" && <Tag color={cat?.c||B.muted} style={{ fontSize:8, padding:"1px 6px" }}>{cat?.icon}</Tag>}
                    </div>
                  </div>
                  {filterClient === "all" && <span style={{ fontSize:9, color:B.muted, maxWidth:60, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.clientName}</span>}
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ReportsPage({ onBack, clients: propClients }) {
  const CDATA = propClients || CLIENTS_DATA_INIT;
  const [period, setPeriod] = useState("fev");
  const [tab, setTab] = useState("overview");
  const [selClient, setSelClient] = useState(null);

  const PERIODS = [
    { k:"fev", l:"Fevereiro 2026" },
    { k:"jan", l:"Janeiro 2026" },
    { k:"dez", l:"Dezembro 2025" },
    { k:"nov", l:"Novembro 2025" },
  ];

  // Simulated monthly data per client
  const CLIENT_METRICS = CDATA.map(c => {
    const parseFollowers = (s) => { if (!s) return 0; const n = parseFloat(s); return s.includes("k") ? n*1000 : n; };
    const igF = parseFollowers(c.socials?.instagram?.followers);
    const fbF = parseFollowers(c.socials?.facebook?.followers);
    const ttF = parseFollowers(c.socials?.tiktok?.followers);
    const totalFollowers = igF + fbF + ttF;
    const monthly = parseBRL(c.monthly);
    const filesCount = (c.files||[]).length;
    const growth = Math.floor(Math.random()*15+3);
    const reach = Math.floor(totalFollowers * (1.5 + Math.random()*3));
    const engagement = (2 + Math.random()*4).toFixed(1);
    const leads = Math.floor(Math.random()*30+5);
    const posts = Math.floor(Math.random()*15+5);
    const stories = Math.floor(Math.random()*20+8);
    const reels = Math.floor(Math.random()*8+2);
    return { ...c, igF, fbF, ttF, totalFollowers, monthlyValue: monthly, filesCount, growth, reach, engagement, leads, posts, stories, reels };
  });

  const totalRevenue = CLIENT_METRICS.reduce((a,c) => a + c.monthlyValue, 0);
  const totalReach = CLIENT_METRICS.reduce((a,c) => a + c.reach, 0);
  const avgEngagement = (CLIENT_METRICS.reduce((a,c) => a + parseFloat(c.engagement), 0) / CLIENT_METRICS.length).toFixed(1);
  const totalPosts = CLIENT_METRICS.reduce((a,c) => a + c.posts, 0);
  const totalStories = CLIENT_METRICS.reduce((a,c) => a + c.stories, 0);
  const totalReels = CLIENT_METRICS.reduce((a,c) => a + c.reels, 0);
  const totalLeads = CLIENT_METRICS.reduce((a,c) => a + c.leads, 0);
  const avgScore = Math.round(CLIENT_METRICS.reduce((a,c) => a + c.score, 0) / CLIENT_METRICS.length);
  const activeClients = CLIENT_METRICS.filter(c => c.status === "ativo").length;

  // Revenue chart data (last 6 months)
  const revenueChart = [
    { m:"Set", v:12200 }, { m:"Out", v:13500 }, { m:"Nov", v:14800 },
    { m:"Dez", v:15200 }, { m:"Jan", v:17000 }, { m:"Fev", v:totalRevenue },
  ];
  const maxRev = Math.max(...revenueChart.map(r=>r.v));

  // Content production chart
  const contentChart = [
    { m:"Set", posts:42, stories:65, reels:18 },
    { m:"Out", posts:48, stories:72, reels:22 },
    { m:"Nov", posts:55, stories:80, reels:25 },
    { m:"Dez", posts:38, stories:55, reels:15 },
    { m:"Jan", posts:60, stories:88, reels:30 },
    { m:"Fev", posts:totalPosts, stories:totalStories, reels:totalReels },
  ];
  const maxContent = Math.max(...contentChart.map(c=>c.posts+c.stories+c.reels));

  // Team productivity
  const teamData = AGENCY_TEAM.map(m => ({
    ...m,
    tasksCompleted: Math.floor(Math.random()*25+10),
    tasksTotal: Math.floor(Math.random()*30+15),
    hoursLogged: Math.floor(Math.random()*120+40),
    rating: (3.5+Math.random()*1.5).toFixed(1),
  }));

  const Bar = ({ value, max, color, h }) => (
    <div style={{ width:"100%", height:h||8, borderRadius:4, background:`${color}15`, overflow:"hidden" }}>
      <div style={{ width:`${Math.min((value/max)*100,100)}%`, height:"100%", borderRadius:4, background:color, transition:"width 0.5s ease" }} />
    </div>
  );

  const formatNum = (n) => n >= 1000 ? (n/1000).toFixed(1)+"k" : n.toString();
  const formatMoney = (n) => "R$ "+n.toLocaleString("pt-BR");

  /* ── CLIENT DETAIL REPORT ── */
  if (selClient) {
    const c = selClient;
    return (
      <div className="pg">
        <Head title="" onBack={() => setSelClient(null)} />
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <Av name={c.name} sz={44} fs={16} />
            <div><h3 style={{ fontSize:16, fontWeight:800 }}>{c.name}</h3><p style={{ fontSize:11, color:B.accent }}>{c.plan} · {c.segment}</p></div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6 }}>
            <div style={{ padding:10, borderRadius:10, background:`${B.blue}08`, textAlign:"center" }}><p style={{ fontSize:18, fontWeight:900, color:B.blue }}>{formatNum(c.reach)}</p><p style={{ fontSize:9, color:B.muted }}>Alcance</p></div>
            <div style={{ padding:10, borderRadius:10, background:`${B.green}08`, textAlign:"center" }}><p style={{ fontSize:18, fontWeight:900, color:B.green }}>{c.engagement}%</p><p style={{ fontSize:9, color:B.muted }}>Engajamento</p></div>
            <div style={{ padding:10, borderRadius:10, background:`${B.orange}08`, textAlign:"center" }}><p style={{ fontSize:18, fontWeight:900, color:B.orange }}>{c.leads}</p><p style={{ fontSize:9, color:B.muted }}>Leads</p></div>
            <div style={{ padding:10, borderRadius:10, background:`${B.purple}08`, textAlign:"center" }}><p style={{ fontSize:18, fontWeight:900, color:B.purple }}>+{c.growth}%</p><p style={{ fontSize:9, color:B.muted }}>Crescimento</p></div>
          </div>
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Produção de conteúdo</p>
        <Card style={{ marginBottom:12 }}>
          {[
            { l:"Posts para Feed", v:c.posts, c:B.blue, max:20 },
            { l:"Stories", v:c.stories, c:B.pink, max:30 },
            { l:"Reels / Vídeos", v:c.reels, c:B.orange, max:10 },
          ].map((item,i) => (
            <div key={i} style={{ marginTop:i?10:0 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <span style={{ fontSize:11, fontWeight:600 }}>{item.l}</span>
                <span style={{ fontSize:11, fontWeight:700, color:item.c }}>{item.v}</span>
              </div>
              <Bar value={item.v} max={item.max} color={item.c} />
            </div>
          ))}
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Redes sociais</p>
        <Card style={{ marginBottom:12 }}>
          {[
            { l:"Instagram", v:formatNum(c.igF), connected:c.socials?.instagram?.connected, c:"#E1306C" },
            { l:"Facebook", v:formatNum(c.fbF), connected:c.socials?.facebook?.connected, c:"#1877F2" },
            { l:"TikTok", v:formatNum(c.ttF), connected:c.socials?.tiktok?.connected, c:"#010101" },
          ].map((item,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderTop:i?`1px solid ${B.border}`:"none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:8, height:8, borderRadius:4, background:item.connected?item.c:B.border }} />
                <span style={{ fontSize:12, fontWeight:500 }}>{item.l}</span>
              </div>
              <span style={{ fontSize:12, fontWeight:700 }}>{item.connected ? `${item.v} seguidores` : "Não conectado"}</span>
            </div>
          ))}
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Informações do contrato</p>
        <Card>
          {[
            { l:"Valor mensal", v:c.monthly },
            { l:"Plano", v:c.plan },
            { l:"Score de satisfação", v:`${c.score}/100` },
            { l:"Arquivos na biblioteca", v:c.filesCount.toString() },
            { l:"Cliente desde", v:c.since },
          ].map((item,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderTop:i?`1px solid ${B.border}`:"none" }}>
              <span style={{ fontSize:11, color:B.muted }}>{item.l}</span>
              <span style={{ fontSize:13, fontWeight:600 }}>{item.v}</span>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  /* ── MAIN REPORTS ── */
  const TABS = [
    { k:"overview", l:"Geral" },
    { k:"clients", l:"Clientes" },
    { k:"content", l:"Conteúdo" },
    { k:"financial", l:"Financeiro" },
    { k:"team", l:"Equipe" },
  ];

  return (
    <div className="pg">
      <Head title="Relatórios" onBack={onBack} />

      {/* Period selector */}
      <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:8, overflowX:"auto", paddingBottom:4 }}>
        {PERIODS.map(p => (
          <button key={p.k} onClick={()=>setPeriod(p.k)} className={`htab${period===p.k?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>{p.l}</button>
        ))}
      </div>

      {/* Tab selector */}
      <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
        {TABS.map(t => (
          <button key={t.k} onClick={()=>setTab(t.k)} className={`htab${tab===t.k?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>{t.l}</button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "overview" && <>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6, marginBottom:12 }}>
          <Card style={{ textAlign:"center", padding:10 }}>
            <p style={{ fontSize:20, fontWeight:900, color:B.green }}>{formatMoney(totalRevenue)}</p>
            <p style={{ fontSize:9, color:B.muted }}>Receita mensal</p>
          </Card>
          <Card style={{ textAlign:"center", padding:10 }}>
            <p style={{ fontSize:20, fontWeight:900, color:B.blue }}>{activeClients}</p>
            <p style={{ fontSize:9, color:B.muted }}>Clientes ativos</p>
          </Card>
          <Card style={{ textAlign:"center", padding:10 }}>
            <p style={{ fontSize:20, fontWeight:900, color:B.orange }}>{formatNum(totalReach)}</p>
            <p style={{ fontSize:9, color:B.muted }}>Alcance total</p>
          </Card>
          <Card style={{ textAlign:"center", padding:10 }}>
            <p style={{ fontSize:20, fontWeight:900, color:B.purple }}>{avgEngagement}%</p>
            <p style={{ fontSize:9, color:B.muted }}>Engajamento médio</p>
          </Card>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:12 }}>
          <Card style={{ textAlign:"center", padding:8 }}>
            <p style={{ fontSize:16, fontWeight:900, color:B.blue }}>{totalPosts}</p>
            <p style={{ fontSize:8, color:B.muted }}>Posts</p>
          </Card>
          <Card style={{ textAlign:"center", padding:8 }}>
            <p style={{ fontSize:16, fontWeight:900, color:B.pink }}>{totalStories}</p>
            <p style={{ fontSize:8, color:B.muted }}>Stories</p>
          </Card>
          <Card style={{ textAlign:"center", padding:8 }}>
            <p style={{ fontSize:16, fontWeight:900, color:B.orange }}>{totalReels}</p>
            <p style={{ fontSize:8, color:B.muted }}>Reels</p>
          </Card>
        </div>

        {/* Revenue trend mini chart */}
        <p className="sl" style={{ marginBottom:6 }}>Evolução da receita (6 meses)</p>
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
            {revenueChart.map((r,i) => (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <span style={{ fontSize:8, fontWeight:600, color:B.green }}>{formatMoney(r.v)}</span>
                <div style={{ width:"100%", borderRadius:4, background:i===revenueChart.length-1?B.green:`${B.green}30`, height:`${(r.v/maxRev)*60}px`, minHeight:4 }} />
                <span style={{ fontSize:8, color:B.muted }}>{r.m}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Score */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:6 }}>
          <Card style={{ textAlign:"center", padding:10 }}>
            <p style={{ fontSize:20, fontWeight:900, color:avgScore>=70?B.green:avgScore>=50?B.orange:B.red }}>{avgScore}</p>
            <p style={{ fontSize:9, color:B.muted }}>Score médio</p>
          </Card>
          <Card style={{ textAlign:"center", padding:10 }}>
            <p style={{ fontSize:20, fontWeight:900, color:B.cyan }}>{totalLeads}</p>
            <p style={{ fontSize:9, color:B.muted }}>Leads gerados</p>
          </Card>
        </div>
      </>}

      {/* ── CLIENTS TAB ── */}
      {tab === "clients" && <>
        <p className="sl" style={{ marginBottom:6 }}>Performance por cliente</p>
        {CLIENT_METRICS.sort((a,b)=>b.score-a.score).map((c,i) => (
          <Card key={c.id} delay={i*0.03} onClick={()=>setSelClient(c)} style={{ marginTop:i?6:0, cursor:"pointer" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <Av name={c.name} sz={36} fs={13} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <p style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</p>
                  <Tag color={c.score>=80?B.green:c.score>=60?B.orange:B.red}>{c.score}/100</Tag>
                </div>
                <p style={{ fontSize:10, color:B.muted }}>{c.plan} · {c.monthly}</p>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:4, textAlign:"center" }}>
              <div><p style={{ fontSize:12, fontWeight:800, color:B.blue }}>{formatNum(c.reach)}</p><p style={{ fontSize:8, color:B.muted }}>Alcance</p></div>
              <div><p style={{ fontSize:12, fontWeight:800, color:B.green }}>{c.engagement}%</p><p style={{ fontSize:8, color:B.muted }}>Engaj.</p></div>
              <div><p style={{ fontSize:12, fontWeight:800, color:B.orange }}>{c.leads}</p><p style={{ fontSize:8, color:B.muted }}>Leads</p></div>
              <div><p style={{ fontSize:12, fontWeight:800, color:B.purple }}>+{c.growth}%</p><p style={{ fontSize:8, color:B.muted }}>Cresc.</p></div>
            </div>
          </Card>
        ))}
      </>}

      {/* ── CONTENT TAB ── */}
      {tab === "content" && <>
        <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:12 }}>
          <p style={{ fontSize:11, fontWeight:600, opacity:.7, marginBottom:6 }}>Produção total do mês</p>
          <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
            <div><p style={{ fontSize:22, fontWeight:900 }}>{totalPosts+totalStories+totalReels}</p><p style={{ fontSize:9, opacity:.6 }}>Peças</p></div>
            <div><p style={{ fontSize:22, fontWeight:900, color:B.accent }}>{totalPosts}</p><p style={{ fontSize:9, opacity:.6 }}>Posts</p></div>
            <div><p style={{ fontSize:22, fontWeight:900, color:B.pink }}>{totalStories}</p><p style={{ fontSize:9, opacity:.6 }}>Stories</p></div>
            <div><p style={{ fontSize:22, fontWeight:900, color:B.orange }}>{totalReels}</p><p style={{ fontSize:9, opacity:.6 }}>Reels</p></div>
          </div>
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Evolução mensal de conteúdo</p>
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:100 }}>
            {contentChart.map((c,i) => {
              const total = c.posts+c.stories+c.reels;
              return (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <span style={{ fontSize:8, fontWeight:700 }}>{total}</span>
                  <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:1, height:`${(total/maxContent)*70}px` }}>
                    <div style={{ flex:c.posts, borderRadius:"4px 4px 0 0", background:B.blue }} />
                    <div style={{ flex:c.stories, background:B.pink }} />
                    <div style={{ flex:c.reels, borderRadius:"0 0 4px 4px", background:B.orange }} />
                  </div>
                  <span style={{ fontSize:8, color:B.muted }}>{c.m}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display:"flex", justifyContent:"center", gap:12, marginTop:8 }}>
            {[{l:"Posts",c:B.blue},{l:"Stories",c:B.pink},{l:"Reels",c:B.orange}].map(leg=>(
              <div key={leg.l} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:8, height:8, borderRadius:2, background:leg.c }} />
                <span style={{ fontSize:9, color:B.muted }}>{leg.l}</span>
              </div>
            ))}
          </div>
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Produção por cliente</p>
        {CLIENT_METRICS.sort((a,b)=>(b.posts+b.stories+b.reels)-(a.posts+a.stories+a.reels)).map((c,i) => {
          const total = c.posts+c.stories+c.reels;
          const max = CLIENT_METRICS.reduce((a,x)=>Math.max(a,x.posts+x.stories+x.reels),1);
          return (
            <Card key={c.id} style={{ marginTop:i?6:0 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Av name={c.name} sz={28} fs={10} />
                  <span style={{ fontSize:12, fontWeight:600 }}>{c.name}</span>
                </div>
                <span style={{ fontSize:12, fontWeight:800 }}>{total} peças</span>
              </div>
              <div style={{ display:"flex", height:10, borderRadius:5, overflow:"hidden", background:`${B.border}` }}>
                <div style={{ width:`${(c.posts/total)*100}%`, background:B.blue }} />
                <div style={{ width:`${(c.stories/total)*100}%`, background:B.pink }} />
                <div style={{ width:`${(c.reels/total)*100}%`, background:B.orange }} />
              </div>
              <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
                <span style={{ fontSize:9, color:B.blue }}>{c.posts} posts</span>
                <span style={{ fontSize:9, color:B.pink }}>{c.stories} stories</span>
                <span style={{ fontSize:9, color:B.orange }}>{c.reels} reels</span>
              </div>
            </Card>
          );
        })}
      </>}

      {/* ── FINANCIAL TAB ── */}
      {tab === "financial" && <>
        <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:12 }}>
          <p style={{ fontSize:11, fontWeight:600, opacity:.7, marginBottom:4 }}>Receita recorrente mensal (MRR)</p>
          <p style={{ fontSize:28, fontWeight:900 }}>{formatMoney(totalRevenue)}</p>
          <p style={{ fontSize:11, color:B.accent, fontWeight:600 }}>+12.5% vs mês anterior</p>
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Evolução de receita</p>
        <Card style={{ marginBottom:12 }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:90 }}>
            {revenueChart.map((r,i) => (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <span style={{ fontSize:7, fontWeight:700, color:B.green }}>{(r.v/1000).toFixed(1)}k</span>
                <div style={{ width:"100%", borderRadius:4, background:i===revenueChart.length-1?B.green:`${B.green}40`, height:`${(r.v/maxRev)*65}px`, minHeight:4 }} />
                <span style={{ fontSize:8, color:B.muted }}>{r.m}</span>
              </div>
            ))}
          </div>
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Receita por plano</p>
        <Card style={{ marginBottom:12 }}>
          {[
            { l:"Partner", clients:CLIENT_METRICS.filter(c=>c.plan==="Partner"), c:B.accent },
            { l:"Growth 360", clients:CLIENT_METRICS.filter(c=>c.plan==="Growth 360"), c:B.blue },
            { l:"Traction", clients:CLIENT_METRICS.filter(c=>c.plan==="Traction"), c:B.muted },
          ].map((plan,i) => {
            const rev = plan.clients.reduce((a,c)=>a+c.monthlyValue,0);
            return (
              <div key={i} style={{ marginTop:i?10:0 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:11, fontWeight:600 }}>{plan.l} ({plan.clients.length} clientes)</span>
                  <span style={{ fontSize:11, fontWeight:700, color:plan.c }}>{formatMoney(rev)}</span>
                </div>
                <Bar value={rev} max={totalRevenue} color={plan.c} />
              </div>
            );
          })}
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Detalhamento por cliente</p>
        {CLIENT_METRICS.sort((a,b)=>b.monthlyValue-a.monthlyValue).map((c,i) => (
          <Card key={c.id} style={{ marginTop:i?6:0 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <Av name={c.name} sz={28} fs={10} />
                <div>
                  <p style={{ fontSize:12, fontWeight:600 }}>{c.name}</p>
                  <p style={{ fontSize:9, color:B.muted }}>{c.plan} · {c.status === "ativo" ? "Ativo" : c.status === "trial" ? "Trial" : c.status}</p>
                </div>
              </div>
              <p style={{ fontSize:14, fontWeight:800, color:B.green }}>{c.monthly}</p>
            </div>
          </Card>
        ))}
      </>}

      {/* ── TEAM TAB ── */}
      {tab === "team" && <>
        <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:12 }}>
          <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
            <div><p style={{ fontSize:22, fontWeight:900 }}>{teamData.length}</p><p style={{ fontSize:9, opacity:.6 }}>Membros</p></div>
            <div><p style={{ fontSize:22, fontWeight:900, color:B.accent }}>{teamData.reduce((a,m)=>a+m.tasksCompleted,0)}</p><p style={{ fontSize:9, opacity:.6 }}>Tarefas feitas</p></div>
            <div><p style={{ fontSize:22, fontWeight:900, color:B.blue }}>{teamData.reduce((a,m)=>a+m.hoursLogged,0)}h</p><p style={{ fontSize:9, opacity:.6 }}>Horas no mês</p></div>
          </div>
        </Card>

        <p className="sl" style={{ marginBottom:6 }}>Desempenho individual</p>
        {teamData.map((m,i) => (
          <Card key={m.id} delay={i*0.03} style={{ marginTop:i?8:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <Av name={m.name} sz={40} fs={15} />
              <div style={{ flex:1 }}>
                <p style={{ fontSize:14, fontWeight:700 }}>{m.name}</p>
                <p style={{ fontSize:10, color:B.accent }}>{m.role}</p>
              </div>
              <Tag color={parseFloat(m.rating)>=4.5?B.green:parseFloat(m.rating)>=3.5?B.blue:B.orange}>{m.rating} ★</Tag>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, textAlign:"center", marginBottom:10 }}>
              <div style={{ padding:6, borderRadius:8, background:`${B.green}08` }}><p style={{ fontSize:14, fontWeight:800, color:B.green }}>{m.tasksCompleted}</p><p style={{ fontSize:8, color:B.muted }}>Concluídas</p></div>
              <div style={{ padding:6, borderRadius:8, background:`${B.orange}08` }}><p style={{ fontSize:14, fontWeight:800, color:B.orange }}>{m.tasksTotal - m.tasksCompleted}</p><p style={{ fontSize:8, color:B.muted }}>Pendentes</p></div>
              <div style={{ padding:6, borderRadius:8, background:`${B.blue}08` }}><p style={{ fontSize:14, fontWeight:800, color:B.blue }}>{m.hoursLogged}h</p><p style={{ fontSize:8, color:B.muted }}>Horas</p></div>
            </div>
            <div>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                <span style={{ fontSize:10, color:B.muted }}>Produtividade</span>
                <span style={{ fontSize:10, fontWeight:700 }}>{Math.round((m.tasksCompleted/m.tasksTotal)*100)}%</span>
              </div>
              <Bar value={m.tasksCompleted} max={m.tasksTotal} color={B.accent} />
            </div>
          </Card>
        ))}
      </>}
    </div>
  );
}

function NewsPage({ onBack }) {
  const [tab, setTab] = useState("all");
  const [selArticle, setSelArticle] = useState(null);
  const { showToast, ToastEl } = useToast();

  const CATS = [
    { k:"all", l:"Tudo" },
    { k:"trends", l:"Tendências" },
    { k:"updates", l:"Atualizações" },
    { k:"tips", l:"Dicas" },
    { k:"cases", l:"Cases" },
    { k:"tools", l:"Ferramentas" },
  ];

  const [articles] = useState([
    { id:1, cat:"trends", title:"Instagram testa novo formato de carrossel com até 20 slides", summary:"A Meta anunciou testes para expandir o limite de slides em carrosséis do Instagram, permitindo até 20 imagens por publicação. O recurso já está disponível para alguns criadores.", date:"01/03/2026", readTime:"3 min", source:"Social Media Today", pinned:true,
      body:"O Instagram está testando uma expansão significativa no formato de carrossel, dobrando o limite atual de 10 para 20 slides por publicação. A mudança visa incentivar conteúdos mais aprofundados e educativos na plataforma.\n\nSegundo a Meta, criadores que utilizam carrosséis maiores terão prioridade no algoritmo de distribuição, já que posts educativos e informativos geram mais salvamentos e compartilhamentos.\n\nO que isso significa para a Unique Marketing 360:\n• Oportunidade de criar conteúdos mais completos para clientes\n• Séries educativas podem ser consolidadas em um único post\n• Maior espaço para storytelling visual\n• Possível aumento no engajamento de posts educativos",
      tags:["Instagram","Carrossel","Meta"] },
    { id:2, cat:"updates", title:"Google Meu Negócio agora permite posts com links diretos para WhatsApp", summary:"Empresas podem adicionar botões de WhatsApp diretamente nos posts do Google Meu Negócio, facilitando a conversão de buscas locais em contatos.", date:"28/02/2026", readTime:"2 min", source:"Google Blog",
      body:"O Google Business Profile atualizou sua funcionalidade de posts para permitir a integração direta com WhatsApp Business. Agora, ao criar um post no perfil empresarial, é possível adicionar um botão de CTA que abre uma conversa no WhatsApp.\n\nBenefícios para nossos clientes:\n• Casa Nova Imóveis: leads de busca local direto no WhatsApp\n• Padaria Real: pedidos via Google Maps\n• Bella Estética: agendamentos facilitados\n• Pet Love Shop: consultas sobre produtos",
      tags:["Google","WhatsApp","SEO Local"] },
    { id:3, cat:"tips", title:"5 métricas de vaidade que sua agência deve parar de reportar", summary:"Likes e seguidores já não são suficientes. Descubra as métricas que realmente importam para demonstrar ROI aos clientes.", date:"27/02/2026", readTime:"5 min", source:"Neil Patel Blog",
      body:"No cenário atual do marketing digital, focar apenas em métricas de vaidade pode prejudicar a relação com clientes. Aqui estão as 5 métricas que devemos substituir:\n\n1. Curtidas → Substituir por Taxa de Salvamento\nSalvamentos indicam conteúdo de valor real que o usuário quer revisitar.\n\n2. Seguidores totais → Substituir por Taxa de crescimento qualificado\nCrescimento por si só não significa nada se não for do público-alvo correto.\n\n3. Impressões → Substituir por Alcance único\nImpressões inflam números. Alcance único mostra quantas pessoas diferentes viram o conteúdo.\n\n4. Cliques no link → Substituir por Taxa de conversão\nUm clique sem ação posterior não gera resultado. Foque na conversão.\n\n5. Frequência de posts → Substituir por Engajamento por post\nPostar mais nem sempre é melhor. A qualidade supera a quantidade.",
      tags:["Métricas","ROI","Relatórios"] },
    { id:4, cat:"cases", title:"Como uma padaria triplicou vendas online com Reels de 15 segundos", summary:"Case de sucesso mostra como conteúdo curto e autêntico transformou o Instagram de uma padaria artesanal em máquina de vendas.", date:"25/02/2026", readTime:"4 min", source:"Resultados Digitais",
      body:"Uma padaria artesanal de São Paulo conseguiu triplicar suas vendas online em apenas 3 meses usando uma estratégia simples de Reels.\n\nA estratégia:\n• Reels diários de 15 segundos mostrando o processo de produção\n• Horário de publicação: 7h (café da manhã) e 16h (lanche)\n• Sem edição profissional, apenas celular e iluminação natural\n• CTA simples: 'Peça pelo link na bio'\n\nResultados em 3 meses:\n• Seguidores: 800 → 12.000\n• Pedidos online: 15/semana → 50/semana\n• Ticket médio: R$ 35 → R$ 52\n• ROI: 340%\n\nInsight para Padaria Real: modelo 100% replicável com a Victoria fazendo vídeos curtos do forno e produção artesanal.",
      tags:["Reels","Case","Vendas"] },
    { id:5, cat:"tools", title:"Canva lança gerador de vídeos com IA integrado", summary:"A nova ferramenta Magic Studio do Canva permite criar vídeos profissionais a partir de texto, com templates editáveis e música automática.", date:"24/02/2026", readTime:"3 min", source:"TechCrunch",
      body:"O Canva acaba de lançar o Magic Video, uma ferramenta de IA que transforma texto em vídeos prontos para publicação. A ferramenta inclui templates para diferentes plataformas (Instagram Reels, TikTok, YouTube Shorts).\n\nComo podemos usar:\n• Criar previews rápidas para aprovação de clientes\n• Gerar variações de vídeos para testes A/B\n• Produzir conteúdo complementar quando a Victoria estiver em gravação\n• Acelerar produção de stories animados\n\nLimitações:\n• Vídeos gerados ainda parecem 'genéricos'\n• Melhor para conteúdo informativo do que emocional\n• Não substitui produção audiovisual profissional",
      tags:["IA","Canva","Vídeo","Ferramentas"] },
    { id:6, cat:"trends", title:"TikTok Shop chega oficialmente ao Brasil em março", summary:"A funcionalidade de e-commerce integrado do TikTok será lançada no Brasil, permitindo compras sem sair do app.", date:"22/02/2026", readTime:"4 min", source:"Meio & Mensagem",
      body:"O TikTok Shop será oficialmente lançado no Brasil em março de 2026, permitindo que marcas vendam produtos diretamente pela plataforma.\n\nImpacto para nossos clientes:\n• TechSmart (45k seguidores TikTok): pode vender gadgets direto pelo app\n• Pet Love Shop (18k seguidores): produtos pet com checkout integrado\n• Studio Fitness: possibilidade de vender planos e acessórios\n\nAções recomendadas:\n• Configurar TikTok Shop para clientes com perfil ativo\n• Criar conteúdo otimizado para conversão (demonstrações, reviews)\n• Treinar equipe no formato de live shopping\n• Preparar catálogo de produtos dos clientes",
      tags:["TikTok","E-commerce","Brasil"] },
    { id:7, cat:"updates", title:"Meta Ads Manager agora exibe CPA por criativo", summary:"Atualização permite ver o custo por aquisição detalhado de cada criativo individual dentro de um conjunto de anúncios.", date:"20/02/2026", readTime:"2 min", source:"Meta for Business",
      body:"A Meta atualizou o Ads Manager para mostrar métricas de CPA (Custo por Aquisição) individualmente para cada criativo dentro de um conjunto de anúncios. Antes, era necessário criar conjuntos separados para isolar a performance.\n\nBenefício direto:\n• Otimização mais rápida de campanhas\n• Identificar criativos que convertem melhor\n• Reduzir desperdício de verba publicitária\n• Relatórios mais transparentes para clientes\n\nAção imediata: revisar campanhas ativas de todos os clientes e pausar criativos com CPA acima da média.",
      tags:["Meta Ads","Tráfego Pago","CPA"] },
    { id:8, cat:"tips", title:"Copywriting: o framework PAS que converte 3x mais em anúncios", summary:"Problema-Agitação-Solução: o framework simples que transforma textos de anúncios medianos em máquinas de conversão.", date:"18/02/2026", readTime:"3 min", source:"Copyblogger",
      body:"O framework PAS (Problema-Agitação-Solução) é uma das técnicas mais eficazes para copywriting de anúncios:\n\nP - Problema: Identifique a dor do público\n'Cansado de postar todo dia e não ver resultado?'\n\nA - Agitação: Amplifique o problema\n'Enquanto seus concorrentes crescem, você continua perdendo tempo com posts que ninguém vê.'\n\nS - Solução: Apresente a solução\n'A Unique Marketing 360 cria estratégias que transformam seguidores em clientes reais.'\n\nDicas para aplicação:\n• Mantenha cada etapa em 1-2 frases\n• Use linguagem do dia a dia do público-alvo\n• Teste variações do 'A' (agitação) para encontrar o tom ideal\n• Sempre termine com CTA claro",
      tags:["Copywriting","Anúncios","Framework"] },
  ]);

  const [saved, setSaved] = useState([]);
  const toggleSave = (id) => {
    setSaved(p => p.includes(id) ? p.filter(x=>x!==id) : [...p, id]);
    showToast(saved.includes(id) ? "Removido dos salvos" : "Salvo para ler depois ✓");
  };

  const filtered = tab === "all" ? articles : tab === "saved" ? articles.filter(a=>saved.includes(a.id)) : articles.filter(a=>a.cat===tab);

  const catColor = (cat) => ({ trends:B.purple, updates:B.blue, tips:B.orange, cases:B.green, tools:B.cyan }[cat] || B.muted);
  const catLabel = (cat) => ({ trends:"Tendência", updates:"Atualização", tips:"Dica", cases:"Case", tools:"Ferramenta" }[cat] || cat);

  /* ── ARTICLE DETAIL ── */
  if (selArticle) {
    const a = selArticle;
    return (
      <div className="pg">
        {ToastEl}
        <Head title="" onBack={() => setSelArticle(null)} right={
          <button onClick={() => toggleSave(a.id)} className="ib" style={{ color:saved.includes(a.id)?B.accent:B.muted }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill={saved.includes(a.id)?B.accent:"none"} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
          </button>
        } />
        <Card style={{ marginBottom:12, borderLeft:`4px solid ${catColor(a.cat)}` }}>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <Tag color={catColor(a.cat)}>{catLabel(a.cat)}</Tag>
            <Tag color={B.muted}>{a.readTime}</Tag>
            {a.pinned && <Tag color={B.red}>Destaque</Tag>}
          </div>
          <h3 style={{ fontSize:17, fontWeight:800, lineHeight:1.3, marginBottom:6 }}>{a.title}</h3>
          <p style={{ fontSize:11, color:B.muted }}>{a.source} · {a.date}</p>
        </Card>
        <Card style={{ marginBottom:12 }}>
          {a.body.split("\n\n").map((p,i) => (
            <p key={i} style={{ fontSize:13, lineHeight:1.7, marginTop:i?12:0, color:p.startsWith("•") || p.startsWith("1.") ? B.dark : B.text, fontWeight:p.length<50 && !p.startsWith("•") && !p.startsWith("'")? 700 : 400 }}>{p}</p>
          ))}
        </Card>
        {a.tags && a.tags.length > 0 && (
          <Card>
            <p className="sl" style={{ marginBottom:6 }}>Tags</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {a.tags.map((t,i) => <Tag key={i} color={catColor(a.cat)}>#{t}</Tag>)}
            </div>
          </Card>
        )}
      </div>
    );
  }

  /* ── MAIN NEWS LIST ── */
  return (
    <div className="pg">
      {ToastEl}
      <Head title="News" onBack={onBack} />
      <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
        {[...CATS, { k:"saved", l:`Salvos (${saved.length})` }].map(c => (
          <button key={c.k} onClick={()=>setTab(c.k)} className={`htab${tab===c.k?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>{c.l}</button>
        ))}
      </div>

      {/* Pinned article */}
      {tab === "all" && articles.filter(a=>a.pinned).map(a => (
        <Card key={a.id} onClick={()=>setSelArticle(a)} style={{ marginBottom:12, cursor:"pointer", background:`${B.accent}06`, border:`1.5px solid ${B.accent}20` }}>
          <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={B.red} stroke={B.red} strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <span style={{ fontSize:10, fontWeight:700, color:B.red }}>DESTAQUE</span>
          </div>
          <h3 style={{ fontSize:15, fontWeight:800, lineHeight:1.3, marginBottom:4 }}>{a.title}</h3>
          <p style={{ fontSize:11, color:B.muted, lineHeight:1.5 }}>{a.summary}</p>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8 }}>
            <Tag color={catColor(a.cat)}>{catLabel(a.cat)}</Tag>
            <span style={{ fontSize:10, color:B.muted }}>{a.readTime} · {a.source}</span>
          </div>
        </Card>
      ))}

      {filtered.length === 0 ? (
        <Card style={{ textAlign:"center", padding:24 }}>
          <p style={{ fontSize:13, fontWeight:600 }}>{tab === "saved" ? "Nenhum artigo salvo" : "Nenhum artigo nesta categoria"}</p>
          <p style={{ fontSize:11, color:B.muted, marginTop:4 }}>{tab === "saved" ? "Salve artigos para ler depois." : "Volte em breve para novidades."}</p>
        </Card>
      ) : filtered.filter(a=> tab!=="all" || !a.pinned).map((a,i) => (
        <Card key={a.id} delay={i*0.03} onClick={()=>setSelArticle(a)} style={{ marginTop:i?6:0, cursor:"pointer" }}>
          <div style={{ display:"flex", gap:10 }}>
            <div style={{ width:6, borderRadius:3, background:catColor(a.cat), flexShrink:0 }} />
            <div style={{ flex:1, minWidth:0 }}>
              <h4 style={{ fontSize:13, fontWeight:700, lineHeight:1.3, marginBottom:4 }}>{a.title}</h4>
              <p style={{ fontSize:11, color:B.muted, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{a.summary}</p>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <Tag color={catColor(a.cat)}>{catLabel(a.cat)}</Tag>
                  <span style={{ fontSize:9, color:B.muted }}>{a.readTime}</span>
                </div>
                <span style={{ fontSize:9, color:B.muted }}>{a.date}</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function IdeasPage({ onBack }) {
  const IDEAS_MOCK = [
    { id:1, title:"Série 'Antes & Depois' para todos os clientes", desc:"Criar uma série padronizada de posts mostrando resultados reais dos serviços de cada cliente. Funciona bem para Bella Estética (procedimentos), Casa Nova (reformas), Studio Fitness (transformações).", author:"Matheus", date:"28/02/2026", votes:8, status:"approved", client:"Todos", tags:["Conteúdo","Série","Resultados"], comments:[
      { by:"Alice", text:"Já tenho templates prontos, posso adaptar para cada cliente!", date:"28/02" },
      { by:"Victoria", text:"Para Studio Fitness tenho material filmado que serve perfeitamente.", date:"01/03" },
    ] },
    { id:2, title:"Live Shopping mensal para TechSmart no TikTok", desc:"Com a chegada do TikTok Shop ao Brasil, propor ao Lucas (TechSmart) uma live mensal de review + venda direta. Formato: 1h com 5 produtos, descontos exclusivos para quem assiste ao vivo.", author:"Alice", date:"27/02/2026", votes:6, status:"review", client:"TechSmart", tags:["TikTok","Live","E-commerce"], comments:[
      { by:"Matheus", text:"Excelente timing com o lançamento do TikTok Shop! Vamos apresentar na próxima reunião.", date:"27/02" },
    ] },
    { id:3, title:"Programa de indicação com QR Code para Padaria Real", desc:"Criar cartões físicos com QR Code que direcionam para o WhatsApp. Cada cliente ganha desconto ao indicar amigos. Rastrear via links UTM para medir conversão.", author:"Matheus", date:"25/02/2026", votes:4, status:"pending", client:"Padaria Real", tags:["Offline","QR Code","Indicação"], comments:[] },
    { id:4, title:"Reels educativos semanais: 'Mitos da Estética'", desc:"Série de Reels curtos (15-30s) desmistificando procedimentos estéticos populares. A Dra. Fernanda fala direto para câmera com linguagem simples. Formato: 'Verdade ou Mito' com transição.", author:"Victoria", date:"24/02/2026", votes:7, status:"approved", client:"Bella Estética", tags:["Reels","Educativo","Saúde"], comments:[
      { by:"Alice", text:"Já alinhei com a Dra. Fernanda, ela topou gravar toda sexta-feira!", date:"25/02" },
      { by:"Allan", text:"Posso criar as legendas com hashtags otimizadas para alcance.", date:"25/02" },
    ] },
    { id:5, title:"Parceria entre clientes: Casa Nova + Bella Estética", desc:"Cross-marketing: quem compra imóvel pela Casa Nova ganha voucher na Bella Estética, e vice-versa. Público-alvo similar (classe A/B de Petrópolis). Post colaborativo nas duas contas.", author:"Matheus", date:"22/02/2026", votes:5, status:"review", client:"Casa Nova Imóveis", tags:["Parceria","Cross-marketing","Collab"], comments:[
      { by:"Alice", text:"Ideia incrível! Posso criar o carrossel collab.", date:"23/02" },
    ] },
    { id:6, title:"Desafio 30 dias no Instagram do Studio Fitness", desc:"Criar um desafio de 30 dias de exercícios com posts diários de Stories + 1 Reel semanal com demonstração. Participantes postam nos próprios Stories marcando o @studiofitness. Prêmio: 1 mês grátis.", author:"Allan", date:"20/02/2026", votes:9, status:"approved", client:"Studio Fitness", tags:["Desafio","Engajamento","UGC"], comments:[
      { by:"Victoria", text:"Já filmei 10 exercícios diferentes na última gravação!", date:"21/02" },
      { by:"Matheus", text:"Aprovado! Vamos lançar dia 1 de março. Alice, prepara os posts do countdown.", date:"22/02" },
      { by:"Alice", text:"Feito! Countdown de 5 dias antes do lançamento + template para participantes repostar.", date:"22/02" },
    ] },
    { id:7, title:"Newsletter mensal para leads de todos os clientes", desc:"Criar uma newsletter automatizada via e-mail para a base de leads captados. Conteúdo personalizado por segmento de cliente. Usar ferramenta gratuita (Mailchimp free tier).", author:"Matheus", date:"18/02/2026", votes:3, status:"pending", client:"Todos", tags:["Email","Newsletter","Automação"], comments:[] },
    { id:8, title:"Google Ads para Pet Love Shop — campanhas locais", desc:"O Pet Love tem boa avaliação no Google (4.8★). Proposta: campanhas de Google Ads locais focadas em 'pet shop Petrópolis', 'banho e tosa perto de mim'. Budget sugerido: R$ 500/mês.", author:"Matheus", date:"15/02/2026", votes:4, status:"review", client:"Pet Love Shop", tags:["Google Ads","SEO Local","Tráfego Pago"], comments:[
      { by:"Alice", text:"A Ana Paula mencionou interesse em tráfego pago na última reunião.", date:"16/02" },
    ] },
  ];
  const [ideas, setIdeas] = useState([]);
  const [ideasLoaded, setIdeasLoaded] = useState(false);

  useEffect(() => {
    if (!supabase || ideasLoaded) return;
    supaLoadIdeas().then(rows => {
      if (rows) {
        if (rows.length > 0) {
          setIdeas(rows.map(r => ({
            id: r.id, supaId: r.id, title: r.title, desc: r.description || "",
            author: r.author || "Matheus", date: new Date(r.created_at).toLocaleDateString("pt-BR"),
            votes: r.votes || 0, status: r.status || "pending",
            client: r.client_name || "Todos", tags: r.tags || [], comments: [],
          })));
        } else {
          setIdeas([]);
        }
      } else {
        setIdeas(IDEAS_MOCK);
      }
      setIdeasLoaded(true);
    });
  }, [ideasLoaded]);

  const [filter, setFilter] = useState("all");
  const [selIdea, setSelIdea] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({});
  const [newComment, setNewComment] = useState("");
  const { showToast, ToastEl } = useToast();

  const statusCfg = { approved:{ l:"Aprovada", c:B.green }, review:{ l:"Em análise", c:B.orange }, pending:{ l:"Pendente", c:B.muted }, rejected:{ l:"Rejeitada", c:B.red } };

  const vote = (id) => {
    setIdeas(p => p.map(i => i.id===id ? {...i, votes:i.votes+1} : i));
    const idea = ideas.find(i => i.id === id);
    if (idea?.supaId) supaUpdateIdea(idea.supaId, { votes: (idea.votes || 0) + 1 });
  };

  const addComment = (id) => {
    if (!newComment.trim()) return;
    setIdeas(p => p.map(i => i.id===id ? {...i, comments:[...i.comments, { by:"Matheus", text:newComment.trim(), date:new Date().toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}) }]} : i));
    setNewComment("");
    showToast("Comentário adicionado ✓");
  };

  const addIdea = async () => {
    if (!form.title?.trim()) return showToast("Informe o título da ideia");
    const ni = { id:Date.now(), title:form.title.trim(), desc:form.desc||"", author:"Matheus", date:new Date().toLocaleDateString("pt-BR"), votes:0, status:"pending", client:form.client||"Todos", tags:form.tags?.split(",").map(t=>t.trim()).filter(Boolean)||[], comments:[] };
    const saved = await supaCreateIdea(ni);
    if (saved) { ni.id = saved.id; ni.supaId = saved.id; }
    setIdeas(p=>[ni,...p]);
    setAdding(false); setForm({});
    showToast("Ideia adicionada! ✓");
  };

  const filtered = filter === "all" ? ideas : ideas.filter(i=>i.status===filter);

  /* ── ADD IDEA ── */
  if (adding) return (
    <div className="pg">
      {ToastEl}
      <Head title="Nova Ideia" onBack={()=>{setAdding(false);setForm({});}} />
      <Card style={{ marginBottom:8 }}>
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Título da ideia *</label>
        <input value={form.title||""} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Ex: Série de Reels educativos..." className="tinput" />
      </Card>
      <Card style={{ marginBottom:8 }}>
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Descrição</label>
        <textarea value={form.desc||""} onChange={e=>setForm(p=>({...p,desc:e.target.value}))} placeholder="Descreva a ideia em detalhes: objetivo, como executar, recursos necessários..." className="tinput" style={{ minHeight:80, resize:"vertical" }} />
      </Card>
      <Card style={{ marginBottom:8 }}>
        <label className="sl" style={{ display:"block", marginBottom:6 }}>Cliente relacionado</label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          <button onClick={()=>setForm(p=>({...p,client:"Todos"}))} style={{ padding:"6px 12px", borderRadius:8, border:`1.5px solid ${(form.client||"Todos")==="Todos"?B.accent:B.border}`, background:(form.client||"Todos")==="Todos"?`${B.accent}10`:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600 }}>Todos</button>
          {CLIENTS_DATA_INIT.map(c=>(
            <button key={c.id} onClick={()=>setForm(p=>({...p,client:c.name}))} style={{ padding:"6px 12px", borderRadius:8, border:`1.5px solid ${form.client===c.name?B.accent:B.border}`, background:form.client===c.name?`${B.accent}10`:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600 }}>{c.name}</button>
          ))}
        </div>
      </Card>
      <Card style={{ marginBottom:8 }}>
        <label className="sl" style={{ display:"block", marginBottom:4 }}>Tags (separar por vírgula)</label>
        <input value={form.tags||""} onChange={e=>setForm(p=>({...p,tags:e.target.value}))} placeholder="Ex: Reels, Instagram, Conteúdo" className="tinput" />
      </Card>
      <button onClick={addIdea} className="pill full accent" style={{ marginTop:8, padding:"14px 0" }}>Publicar Ideia</button>
    </div>
  );

  /* ── IDEA DETAIL ── */
  if (selIdea) {
    const idea = ideas.find(i=>i.id===selIdea);
    if (!idea) { setSelIdea(null); return null; }
    const st = statusCfg[idea.status]||statusCfg.pending;
    return (
      <div className="pg">
        {ToastEl}
        <Head title="" onBack={()=>setSelIdea(null)} />
        <Card style={{ marginBottom:12, borderLeft:`4px solid ${st.c}` }}>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <Tag color={st.c}>{st.l}</Tag>
            <Tag color={B.muted}>{idea.client}</Tag>
          </div>
          <h3 style={{ fontSize:16, fontWeight:800, lineHeight:1.3, marginBottom:6 }}>{idea.title}</h3>
          <p style={{ fontSize:12, lineHeight:1.6, color:B.text }}>{idea.desc}</p>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <Av name={idea.author} sz={24} fs={9} />
              <span style={{ fontSize:11, color:B.muted }}>{idea.author} · {idea.date}</span>
            </div>
            <button onClick={()=>vote(idea.id)} style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 12px", borderRadius:8, background:`${B.accent}10`, border:`1.5px solid ${B.accent}25`, cursor:"pointer", fontFamily:"inherit" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2" strokeLinecap="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"/><path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/></svg>
              <span style={{ fontSize:12, fontWeight:700, color:B.accent }}>{idea.votes}</span>
            </button>
          </div>
        </Card>

        {idea.tags.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:12 }}>
            {idea.tags.map((t,i)=><Tag key={i} color={B.accent}>#{t}</Tag>)}
          </div>
        )}

        {/* Comments */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <p className="sl">Comentários ({idea.comments.length})</p>
        </div>
        {idea.comments.length === 0 ? (
          <Card style={{ textAlign:"center", padding:16, marginBottom:8 }}>
            <p style={{ fontSize:12, color:B.muted }}>Nenhum comentário ainda. Seja o primeiro!</p>
          </Card>
        ) : idea.comments.map((c,i) => (
          <Card key={i} style={{ marginBottom:6, padding:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <Av name={c.by} sz={24} fs={9} />
              <span style={{ fontSize:12, fontWeight:600 }}>{c.by}</span>
              <span style={{ fontSize:9, color:B.muted }}>{c.date}</span>
            </div>
            <p style={{ fontSize:12, lineHeight:1.5, paddingLeft:32 }}>{c.text}</p>
          </Card>
        ))}

        {/* Add comment */}
        <div style={{ display:"flex", gap:6, marginTop:4 }}>
          <input value={newComment} onChange={e=>setNewComment(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addComment(idea.id)} placeholder="Escreva um comentário..." className="tinput" style={{ flex:1 }} />
          <button onClick={()=>addComment(idea.id)} style={{ width:40, height:40, borderRadius:12, background:B.accent, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#192126" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    );
  }

  /* ── MAIN IDEAS LIST ── */
  return (
    <div className="pg">
      {ToastEl}
      <Head title="Ideias" onBack={onBack} right={
        <button onClick={()=>setAdding(true)} style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 14px", borderRadius:10, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:700, color:B.text }}>{IC.plus} Nova</button>
      } />

      {/* Stats */}
      <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:12 }}>
        <div style={{ display:"flex", justifyContent:"space-around", textAlign:"center" }}>
          <div><p style={{ fontSize:22, fontWeight:900 }}>{ideas.length}</p><p style={{ fontSize:9, opacity:.6 }}>Total</p></div>
          <div><p style={{ fontSize:22, fontWeight:900, color:B.green }}>{ideas.filter(i=>i.status==="approved").length}</p><p style={{ fontSize:9, opacity:.6 }}>Aprovadas</p></div>
          <div><p style={{ fontSize:22, fontWeight:900, color:B.orange }}>{ideas.filter(i=>i.status==="review").length}</p><p style={{ fontSize:9, opacity:.6 }}>Em análise</p></div>
          <div><p style={{ fontSize:22, fontWeight:900, color:B.muted }}>{ideas.filter(i=>i.status==="pending").length}</p><p style={{ fontSize:9, opacity:.6 }}>Pendentes</p></div>
        </div>
      </Card>

      <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
        {[{k:"all",l:"Todas"},{k:"approved",l:"Aprovadas"},{k:"review",l:"Em análise"},{k:"pending",l:"Pendentes"}].map(f=>(
          <button key={f.k} onClick={()=>setFilter(f.k)} className={`htab${filter===f.k?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>{f.l}</button>
        ))}
      </div>

      {filtered.sort((a,b)=>b.votes-a.votes).map((idea,i) => {
        const st = statusCfg[idea.status]||statusCfg.pending;
        return (
          <Card key={idea.id} delay={i*0.03} onClick={()=>setSelIdea(idea.id)} style={{ marginTop:i?8:0, cursor:"pointer" }}>
            <div style={{ display:"flex", gap:10 }}>
              {/* Vote column */}
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, paddingTop:2 }} onClick={e=>{e.stopPropagation();vote(idea.id);}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={B.accent} strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                <span style={{ fontSize:14, fontWeight:900, color:B.accent }}>{idea.votes}</span>
              </div>
              {/* Content */}
              <div style={{ flex:1, minWidth:0 }}>
                <h4 style={{ fontSize:13, fontWeight:700, lineHeight:1.3, marginBottom:4 }}>{idea.title}</h4>
                <p style={{ fontSize:11, color:B.muted, lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{idea.desc}</p>
                <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap:4, marginTop:6 }}>
                  <Tag color={st.c}>{st.l}</Tag>
                  <Tag color={B.muted}>{idea.client}</Tag>
                  <span style={{ fontSize:9, color:B.muted }}>· {idea.author} · {idea.comments.length} comentário{idea.comments.length!==1?"s":""}</span>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function GamifyPage({ onBack, user }) {
  const [tab, setTab] = useState("ranking");
  const [selBadge, setSelBadge] = useState(null);
  const [selReward, setSelReward] = useState(null);
  const { showToast, ToastEl } = useToast();

  /* ── LEVELS ── */
  const LEVELS = [
    { level:1, title:"Estagiário", min:0, max:500 },
    { level:2, title:"Júnior", min:500, max:1200 },
    { level:3, title:"Pleno", min:1200, max:2500 },
    { level:4, title:"Sênior", min:2500, max:4500 },
    { level:5, title:"Especialista", min:4500, max:7000 },
    { level:6, title:"Líder", min:7000, max:10000 },
    { level:7, title:"Master", min:10000, max:15000 },
    { level:8, title:"Lenda", min:15000, max:99999 },
  ];

  const getLevel = xp => LEVELS.find(l => xp >= l.min && xp < l.max) || LEVELS[LEVELS.length-1];

  /* ── TEAM DATA ── */
  const teamData = [
    { id:1, name:"Matheus", role:"CEO / Estrategista", photo:TEAM_PHOTOS.matheus, xp:4820, streak:12, tasksMonth:38, postsMonth:24, onTimeRate:96, badges:["firstPost","streak7","speed","client10","mentor","allStar","creative50","revenue"] },
    { id:2, name:"Alice", role:"Social Media", photo:null, xp:3650, streak:8, tasksMonth:42, postsMonth:31, onTimeRate:92, badges:["firstPost","streak7","speed","creative50","volume100"] },
    { id:3, name:"Allan", role:"Social Media", photo:null, xp:2180, streak:3, tasksMonth:28, postsMonth:19, onTimeRate:85, badges:["firstPost","streak7","creative50"] },
    { id:4, name:"Victoria", role:"Audiovisual", photo:null, xp:3100, streak:6, tasksMonth:22, postsMonth:15, onTimeRate:94, badges:["firstPost","streak7","speed","videoMaster","client10"] },
  ];

  const sorted = [...teamData].sort((a,b) => b.xp - a.xp);
  const me = teamData.find(t => t.name === (user?.nick || user?.name)) || teamData[0];
  const myLevel = getLevel(me.xp);
  const xpProgress = ((me.xp - myLevel.min) / (myLevel.max - myLevel.min)) * 100;
  const myRank = sorted.findIndex(t => t.id === me.id) + 1;

  /* ── BADGES ── */
  const ALL_BADGES = [
    { id:"firstPost", emoji:"🚀", name:"Primeiro Post", desc:"Publicou seu primeiro conteúdo", xpReward:50, rarity:"Comum" },
    { id:"streak7", emoji:"🔥", name:"Em Chamas", desc:"7 dias consecutivos de check-in", xpReward:100, rarity:"Comum" },
    { id:"streak30", emoji:"💎", name:"Inabalável", desc:"30 dias consecutivos de check-in", xpReward:500, rarity:"Épico" },
    { id:"speed", emoji:"⚡", name:"Relâmpago", desc:"Completou 5 tarefas no mesmo dia", xpReward:150, rarity:"Raro" },
    { id:"client10", emoji:"🤝", name:"Relacionista", desc:"Gerenciou 10+ clientes ativos", xpReward:200, rarity:"Raro" },
    { id:"creative50", emoji:"🎨", name:"Criativo", desc:"Criou 50+ conteúdos diferentes", xpReward:300, rarity:"Raro" },
    { id:"volume100", emoji:"📦", name:"Máquina", desc:"Completou 100+ tarefas no total", xpReward:400, rarity:"Épico" },
    { id:"mentor", emoji:"🧠", name:"Mentor", desc:"Ajudou 3 colegas em suas tarefas", xpReward:250, rarity:"Raro" },
    { id:"allStar", emoji:"⭐", name:"All Star", desc:"Nota máxima em satisfação do cliente", xpReward:350, rarity:"Épico" },
    { id:"videoMaster", emoji:"🎬", name:"Cineasta", desc:"Produziu 20+ vídeos/reels", xpReward:300, rarity:"Raro" },
    { id:"revenue", emoji:"💰", name:"Gerador", desc:"Contribuiu para R$50k+ em receita", xpReward:500, rarity:"Lendário" },
    { id:"perfect", emoji:"🏆", name:"Perfeição", desc:"100% de entregas no prazo por 30 dias", xpReward:600, rarity:"Lendário" },
  ];

  const rarityColor = r => ({ "Comum":B.muted, "Raro":B.blue, "Épico":B.purple, "Lendário":"#F59E0B" }[r] || B.muted);

  /* ── CHALLENGES ── */
  const CHALLENGES = [
    { id:1, title:"Maratona de Posts", desc:"Publique 10 posts esta semana", icon:"📱", reward:200, progress:7, total:10, deadline:"Sex, 07/03", type:"Semanal", color:B.blue },
    { id:2, title:"Check-in Perfeito", desc:"Faça check-in todos os dias do mês", icon:"📍", reward:350, progress:18, total:22, deadline:"31/03", type:"Mensal", color:B.green },
    { id:3, title:"Feedback Mestre", desc:"Receba 5 aprovações de cliente sem revisão", icon:"✅", reward:300, progress:3, total:5, deadline:"31/03", type:"Mensal", color:B.purple },
    { id:4, title:"Velocity Sprint", desc:"Complete 8 tarefas em 2 dias", icon:"🏃", reward:250, progress:5, total:8, deadline:"Ter, 04/03", type:"Flash", color:B.orange },
    { id:5, title:"Rei do Reels", desc:"Produza 5 Reels/Shorts esta semana", icon:"🎬", reward:200, progress:2, total:5, deadline:"Sex, 07/03", type:"Semanal", color:B.red },
  ];

  /* ── REWARDS SHOP ── */
  const REWARDS = [
    { id:1, name:"Day Off Extra", desc:"Um dia de folga adicional no mês", cost:3000, icon:"🏖️", cat:"Benefício", stock:2 },
    { id:2, name:"Almoço com o CEO", desc:"Almoço especial para trocar ideias", cost:1500, icon:"🍽️", cat:"Experiência", stock:4 },
    { id:3, name:"Gift Card R$100", desc:"Cartão presente para usar onde quiser", cost:2000, icon:"🎁", cat:"Prêmio", stock:5 },
    { id:4, name:"Home Office Flexível", desc:"1 semana de home office livre", cost:2500, icon:"🏠", cat:"Benefício", stock:3 },
    { id:5, name:"Curso Online", desc:"Curso à escolha pago pela agência", cost:4000, icon:"📚", cat:"Desenvolvimento", stock:3 },
    { id:6, name:"Bônus R$250", desc:"Bônus direto no salário", cost:5000, icon:"💵", cat:"Prêmio", stock:2 },
    { id:7, name:"Cadeira Ergonômica", desc:"Upgrade para cadeira premium", cost:6000, icon:"🪑", cat:"Escritório", stock:1 },
    { id:8, name:"Horário Flexível", desc:"1 mês de horário flexível", cost:3500, icon:"⏰", cat:"Benefício", stock:2 },
  ];

  /* ── XP HISTORY ── */
  const XP_HISTORY = [
    { action:"Tarefa concluída no prazo", xp:"+25", time:"Hoje, 14:30", icon:"✅" },
    { action:"Post publicado — Instagram", xp:"+30", time:"Hoje, 11:20", icon:"📱" },
    { action:"Check-in no horário", xp:"+15", time:"Hoje, 08:02", icon:"📍" },
    { action:"Conquista: Relâmpago", xp:"+150", time:"Ontem, 17:45", icon:"⚡" },
    { action:"Feedback positivo do cliente", xp:"+50", time:"Ontem, 15:10", icon:"⭐" },
    { action:"Desafio completado: Sprint", xp:"+250", time:"28/02", icon:"🏆" },
    { action:"Post Reels — TikTok", xp:"+35", time:"28/02", icon:"🎬" },
    { action:"Bônus: Streak 12 dias", xp:"+120", time:"27/02", icon:"🔥" },
  ];

  /* ── Badge detail modal ── */
  if (selBadge) {
    const b = ALL_BADGES.find(x => x.id === selBadge);
    const earned = me.badges.includes(selBadge);
    return (
      <div className="pg">
        {ToastEl}
        <Head title="Conquista" onBack={() => setSelBadge(null)} />
        <div style={{ textAlign:"center", padding:"20px 0" }}>
          <div style={{ width:80, height:80, borderRadius:24, background:earned?`${rarityColor(b.rarity)}12`:`${B.muted}08`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", border:`3px solid ${earned?rarityColor(b.rarity):B.border}`, fontSize:36 }}>{b.emoji}</div>
          <h3 style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>{b.name}</h3>
          <Tag color={rarityColor(b.rarity)}>{b.rarity}</Tag>
          <p style={{ fontSize:13, color:B.muted, marginTop:12, lineHeight:1.6 }}>{b.desc}</p>
          <Card style={{ marginTop:16, display:"flex", justifyContent:"space-around" }}>
            <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800, color:B.accent }}>+{b.xpReward}</p><p style={{ fontSize:10, color:B.muted }}>XP Recompensa</p></div>
            <div style={{ width:1, background:B.border }} />
            <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800, color:earned?B.green:B.muted }}>{earned?"✓":"✗"}</p><p style={{ fontSize:10, color:B.muted }}>{earned?"Conquistado":"Bloqueado"}</p></div>
          </Card>
          {!earned && <p style={{ fontSize:11, color:B.muted, marginTop:12, fontStyle:"italic" }}>Continue trabalhando para desbloquear esta conquista!</p>}
        </div>
      </div>
    );
  }

  /* ── Reward detail modal ── */
  if (selReward) {
    const r = REWARDS.find(x => x.id === selReward);
    const canAfford = me.xp >= r.cost;
    return (
      <div className="pg">
        {ToastEl}
        <Head title="Recompensa" onBack={() => setSelReward(null)} />
        <div style={{ textAlign:"center", padding:"20px 0" }}>
          <div style={{ fontSize:56, marginBottom:12 }}>{r.icon}</div>
          <h3 style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>{r.name}</h3>
          <Tag color={B.accent}>{r.cat}</Tag>
          <p style={{ fontSize:13, color:B.muted, marginTop:12, lineHeight:1.6 }}>{r.desc}</p>
          <Card style={{ marginTop:16, display:"flex", justifyContent:"space-around" }}>
            <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800, color:B.orange }}>{r.cost.toLocaleString()}</p><p style={{ fontSize:10, color:B.muted }}>XP necessário</p></div>
            <div style={{ width:1, background:B.border }} />
            <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800, color:B.accent }}>{me.xp.toLocaleString()}</p><p style={{ fontSize:10, color:B.muted }}>Seu XP atual</p></div>
            <div style={{ width:1, background:B.border }} />
            <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800, color:r.stock>0?B.green:B.red }}>{r.stock}</p><p style={{ fontSize:10, color:B.muted }}>Estoque</p></div>
          </Card>
          <button onClick={() => { if(canAfford && r.stock>0){ showToast(`${r.name} resgatado! 🎉`); setSelReward(null); } else if(!canAfford) { showToast("XP insuficiente"); } else { showToast("Sem estoque"); } }} className="pill full accent" style={{ marginTop:20, opacity:(canAfford&&r.stock>0)?1:0.4 }}>
            {canAfford && r.stock>0 ? `Resgatar por ${r.cost.toLocaleString()} XP` : !canAfford ? `Faltam ${(r.cost - me.xp).toLocaleString()} XP` : "Sem estoque"}
          </button>
        </div>
      </div>
    );
  }

  /* ── TABS ── */
  const TABS_LIST = [
    { k:"ranking", l:"Ranking" },
    { k:"challenges", l:"Desafios" },
    { k:"badges", l:"Conquistas" },
    { k:"rewards", l:"Loja" },
    { k:"history", l:"Histórico" },
  ];

  return (
    <div className="pg">
      {ToastEl}
      <Head title="Gamificação" onBack={onBack} />

      {/* My Stats Card */}
      <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:14, padding:20 }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ position:"relative" }}>
            <Av src={me.photo} name={me.name} sz={56} fs={20} />
            <div style={{ position:"absolute", bottom:-4, right:-4, width:24, height:24, borderRadius:12, background:B.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900, color:"#192126", border:"2px solid #192126" }}>{myLevel.level}</div>
          </div>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:16, fontWeight:800 }}>{me.name}</p>
            <p style={{ fontSize:11, opacity:.6 }}>{myLevel.title} · #{myRank} no ranking</p>
            <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, height:6, borderRadius:3, background:"rgba(255,255,255,0.15)" }}>
                <div style={{ width:`${xpProgress}%`, height:"100%", borderRadius:3, background:B.accent, transition:"width .5s" }} />
              </div>
              <span style={{ fontSize:10, opacity:.7 }}>{me.xp.toLocaleString()}/{myLevel.max.toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", justifyContent:"space-around", marginTop:16, paddingTop:14, borderTop:"1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800, color:B.accent }}>{me.streak}</p><p style={{ fontSize:9, opacity:.5 }}>Dias seguidos</p></div>
          <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800 }}>{me.tasksMonth}</p><p style={{ fontSize:9, opacity:.5 }}>Tarefas/mês</p></div>
          <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800 }}>{me.postsMonth}</p><p style={{ fontSize:9, opacity:.5 }}>Posts/mês</p></div>
          <div style={{ textAlign:"center" }}><p style={{ fontSize:18, fontWeight:800, color:me.onTimeRate>=90?B.green:B.orange }}>{me.onTimeRate}%</p><p style={{ fontSize:9, opacity:.5 }}>No prazo</p></div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="htabs" style={{ marginBottom:14 }}>
        {TABS_LIST.map(t => <button key={t.k} onClick={() => setTab(t.k)} className={`htab${tab===t.k?" a":""}`} style={{ fontSize:11 }}>{t.l}</button>)}
      </div>

      {/* ═══ RANKING TAB ═══ */}
      {tab === "ranking" && <>
        {sorted.map((m, i) => {
          const lv = getLevel(m.xp);
          const isMe = m.id === me.id;
          const medalColor = i===0?"#FFD700":i===1?"#C0C0C0":i===2?"#CD7F32":null;
          return (
            <Card key={m.id} delay={i*0.04} style={{ marginBottom:8, border:isMe?`2px solid ${B.accent}`:"none" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:30, textAlign:"center", flexShrink:0 }}>
                  {medalColor ? <span style={{ fontSize:20 }}>{i===0?"🥇":i===1?"🥈":"🥉"}</span> : <span style={{ fontSize:16, fontWeight:800, color:B.muted }}>{i+1}</span>}
                </div>
                <div style={{ position:"relative" }}>
                  <Av src={m.photo} name={m.name} sz={42} fs={16} />
                  <div style={{ position:"absolute", bottom:-2, right:-2, width:18, height:18, borderRadius:9, background:B.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:900, color:"#192126", border:`1.5px solid ${B.bgCard}` }}>{lv.level}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <p style={{ fontSize:14, fontWeight:700 }}>{m.name}</p>
                    {isMe && <Tag color={B.accent}>Você</Tag>}
                  </div>
                  <p style={{ fontSize:11, color:B.muted }}>{lv.title} · {m.role}</p>
                  <div style={{ marginTop:4, display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ flex:1, height:4, borderRadius:2, background:`${B.muted}15`, maxWidth:120 }}>
                      <div style={{ width:`${((m.xp - lv.min)/(lv.max - lv.min))*100}%`, height:"100%", borderRadius:2, background:B.accent }} />
                    </div>
                    <span style={{ fontSize:10, color:B.muted }}>{m.xp.toLocaleString()} XP</span>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <p style={{ fontSize:10, color:B.muted }}>🔥 {m.streak}d</p>
                  <p style={{ fontSize:10, color:B.muted, marginTop:2 }}>{m.badges.length} 🏅</p>
                </div>
              </div>
            </Card>
          );
        })}
        <Card style={{ marginTop:8, background:`${B.accent}06`, border:`1.5px solid ${B.accent}20` }}>
          <p className="sl" style={{ marginBottom:6 }}>Como ganhar XP</p>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            {[
              { a:"Check-in no horário", xp:"+15" },
              { a:"Tarefa concluída no prazo", xp:"+25" },
              { a:"Post publicado", xp:"+30" },
              { a:"Feedback positivo do cliente", xp:"+50" },
              { a:"Desafio completado", xp:"+100~350" },
              { a:"Conquista desbloqueada", xp:"+50~600" },
            ].map((r,i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0" }}>
                <span style={{ fontSize:12 }}>{r.a}</span>
                <span style={{ fontSize:12, fontWeight:700, color:B.accent }}>{r.xp}</span>
              </div>
            ))}
          </div>
        </Card>
      </>}

      {/* ═══ CHALLENGES TAB ═══ */}
      {tab === "challenges" && <>
        {CHALLENGES.map((ch, i) => {
          const pct = Math.round((ch.progress/ch.total)*100);
          const done = pct >= 100;
          return (
            <Card key={ch.id} delay={i*0.04} style={{ marginBottom:10, borderLeft:`4px solid ${done?B.green:ch.color}`, opacity:done?.7:1 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                <span style={{ fontSize:28, marginTop:2 }}>{ch.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                    <p style={{ fontSize:14, fontWeight:700, textDecoration:done?"line-through":"none" }}>{ch.title}</p>
                    <Tag color={ch.color}>{ch.type}</Tag>
                  </div>
                  <p style={{ fontSize:11, color:B.muted, marginBottom:8 }}>{ch.desc}</p>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ flex:1, height:8, borderRadius:4, background:`${B.muted}10` }}>
                      <div style={{ width:`${Math.min(pct,100)}%`, height:"100%", borderRadius:4, background:done?B.green:ch.color, transition:"width .5s" }} />
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:done?B.green:B.text }}>{ch.progress}/{ch.total}</span>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", marginTop:6 }}>
                    <span style={{ fontSize:10, color:B.muted }}>Prazo: {ch.deadline}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:B.accent }}>+{ch.reward} XP</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </>}

      {/* ═══ BADGES TAB ═══ */}
      {tab === "badges" && <>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <Card style={{ flex:1, textAlign:"center", padding:12 }}><p style={{ fontSize:20, fontWeight:800, color:B.accent }}>{me.badges.length}</p><p style={{ fontSize:10, color:B.muted }}>Conquistadas</p></Card>
          <Card style={{ flex:1, textAlign:"center", padding:12 }}><p style={{ fontSize:20, fontWeight:800 }}>{ALL_BADGES.length}</p><p style={{ fontSize:10, color:B.muted }}>Total</p></Card>
          <Card style={{ flex:1, textAlign:"center", padding:12 }}><p style={{ fontSize:20, fontWeight:800, color:B.purple }}>{ALL_BADGES.filter(b=>b.rarity==="Épico"||b.rarity==="Lendário").filter(b=>me.badges.includes(b.id)).length}</p><p style={{ fontSize:10, color:B.muted }}>Raras+</p></Card>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8 }}>
          {ALL_BADGES.map((b, i) => {
            const earned = me.badges.includes(b.id);
            return (
              <Card key={b.id} delay={i*0.03} onClick={() => setSelBadge(b.id)} style={{ cursor:"pointer", textAlign:"center", padding:14, opacity:earned?1:0.4, border:earned?`1.5px solid ${rarityColor(b.rarity)}30`:"none" }}>
                <span style={{ fontSize:28, display:"block", marginBottom:6, filter:earned?"none":"grayscale(1)" }}>{b.emoji}</span>
                <p style={{ fontSize:10, fontWeight:700, lineHeight:1.3 }}>{b.name}</p>
                <div style={{ marginTop:4 }}><Tag color={rarityColor(b.rarity)}>{b.rarity}</Tag></div>
              </Card>
            );
          })}
        </div>
      </>}

      {/* ═══ REWARDS SHOP TAB ═══ */}
      {tab === "rewards" && <>
        <Card style={{ background:`${B.accent}08`, border:`1.5px solid ${B.accent}25`, marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <p style={{ fontSize:11, color:B.muted }}>Seu saldo</p>
            <p style={{ fontSize:22, fontWeight:900, color:B.accent }}>{me.xp.toLocaleString()} <span style={{ fontSize:12, fontWeight:600 }}>XP</span></p>
          </div>
          <div style={{ width:44, height:44, borderRadius:14, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center" }}>{IC.gamify(B.accent)}</div>
        </Card>
        {REWARDS.map((r, i) => {
          const canAfford = me.xp >= r.cost;
          return (
            <Card key={r.id} delay={i*0.04} onClick={() => setSelReward(r.id)} style={{ marginBottom:8, cursor:"pointer", opacity:r.stock>0?1:0.5 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ fontSize:32 }}>{r.icon}</span>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:14, fontWeight:700 }}>{r.name}</p>
                  <p style={{ fontSize:11, color:B.muted }}>{r.desc}</p>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
                    <Tag color={B.accent}>{r.cat}</Tag>
                    <span style={{ fontSize:10, color:B.muted }}>{r.stock} disponível</span>
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <p style={{ fontSize:14, fontWeight:800, color:canAfford?B.accent:B.muted }}>{r.cost.toLocaleString()}</p>
                  <p style={{ fontSize:9, color:B.muted }}>XP</p>
                </div>
              </div>
            </Card>
          );
        })}
      </>}

      {/* ═══ HISTORY TAB ═══ */}
      {tab === "history" && <>
        <Card style={{ marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div><p style={{ fontSize:11, color:B.muted }}>XP total acumulado</p><p style={{ fontSize:22, fontWeight:900 }}>{me.xp.toLocaleString()}</p></div>
          <div><p style={{ fontSize:11, color:B.muted, textAlign:"right" }}>Este mês</p><p style={{ fontSize:22, fontWeight:900, color:B.green, textAlign:"right" }}>+820</p></div>
        </Card>
        {XP_HISTORY.map((h, i) => (
          <Card key={i} delay={i*0.03} style={{ marginBottom:6, padding:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:20 }}>{h.icon}</span>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:600 }}>{h.action}</p>
                <p style={{ fontSize:10, color:B.muted }}>{h.time}</p>
              </div>
              <p style={{ fontSize:14, fontWeight:800, color:B.green }}>{h.xp}</p>
            </div>
          </Card>
        ))}
      </>}
    </div>
  );
}

function AIPage({ onBack, user }) {
  const [conversations, setConversations] = useState([
    { id:"demo1", title:"Legenda para lançamento imobiliário", messages:[
      {role:"user",content:"Crie uma legenda criativa para um post de Instagram sobre lançamento de um condomínio de luxo em Petrópolis"},
      {role:"assistant",content:"🏔️ Viver com vista para a Serra é um privilégio. Viver com vista para o futuro, é uma escolha.\n\nApresentamos o novo [Nome do Condomínio] — onde o luxo encontra a natureza no coração de Petrópolis.\n\n✨ Apartamentos de 120m² a 240m²\n🌿 Área verde preservada\n🏊 Lazer completo com piscina aquecida\n🔐 Segurança 24h\n\nAgende sua visita e descubra o endereço que vai redefinir seu conceito de morar bem.\n\n📍 Link na bio\n\n#Petrópolis #ImóveisLuxo #CondomínioLuxo #AltoPadrão #MorarBem #LançamentoImobiliário #SerraFluminense #VidaComEstilo"},
    ], updatedAt:"01/03/2026 14:32", pinned:true },
    { id:"demo2", title:"Estratégia para clínica estética", messages:[
      {role:"user",content:"Sugira uma estratégia de marketing digital para uma clínica de estética focada em procedimentos faciais"},
      {role:"assistant",content:"Estratégia de Marketing Digital — Clínica de Estética Facial\n\n1. CONTEÚDO EDUCATIVO (3x/semana)\nAntes e depois (com autorização), vídeos curtos explicando procedimentos, mitos vs verdades, dicas de skincare.\n\n2. REELS/TIKTOK (4x/semana)\nProcedimentos em time-lapse, dia a dia da clínica, depoimentos, trends adaptadas.\n\n3. STORIES DIÁRIOS\nBastidores, enquetes sobre procedimentos, caixinha de perguntas, provas sociais.\n\n4. TRÁFEGO PAGO\nCampanha de reconhecimento com vídeos educativos (R$30/dia), retargeting para quem engajou (R$20/dia), campanha de conversão para agendamento (R$50/dia).\n\n5. GOOGLE ADS\nPalavras-chave: harmonização facial Petrópolis, botox, preenchimento labial + extensões de local.\n\n6. PARCERIAS\nInfluenciadoras locais para permuta, colabs com dermatologistas, eventos de skincare.\n\nMeta: 40 agendamentos/mês em 90 dias."},
    ], updatedAt:"28/02/2026 10:15", pinned:false },
    { id:"demo3", title:"Hashtags para fitness", messages:[
      {role:"user",content:"Sugira 30 hashtags relevantes para um post sobre academia e vida saudável"},
      {role:"assistant",content:"Aqui estão 30 hashtags organizadas por categoria:\n\n🏋️ FITNESS\n#Fitness #Treino #Academia #Gym #Workout #FitnessMotivation #GymLife #TreinoDoDay #FocoNoTreino #VidaFit\n\n🥗 SAÚDE\n#VidaSaudável #Saúde #BemEstar #Wellness #HealthyLifestyle #QualidadeDeVida #SaúdeEBemEstar #EstiloDeVida #MenteECorpo #EquilíbrioDeVida\n\n💪 MOTIVAÇÃO\n#Motivação #Disciplina #Foco #NãoDesista #SuperaçãoDiária #MindsetPositivo #Determinação #MetaFitness #TransformaçãoCorporal #AntesEDepois"},
    ], updatedAt:"27/02/2026 16:48", pinned:false },
  ]);
  const [activeChat, setActiveChat] = useState(null);
  const [view, setView] = useState("history"); // "history" | "chat"
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [selPreset, setSelPreset] = useState(null);
  const scrollRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const { showToast, ToastEl } = useToast();

  const PRESETS = [
    { emoji: "✍️", label: "Criar legenda", prompt: "Crie uma legenda criativa para um post de Instagram sobre " },
    { emoji: "📊", label: "Estratégia", prompt: "Sugira uma estratégia de marketing digital para " },
    { emoji: "📝", label: "Roteiro Reels", prompt: "Escreva um roteiro para um Reels de 30 segundos sobre " },
    { emoji: "💡", label: "Ideias de conteúdo", prompt: "Me dê 10 ideias de conteúdo para uma empresa de " },
    { emoji: "📧", label: "E-mail marketing", prompt: "Escreva um e-mail marketing para promover " },
    { emoji: "🎯", label: "Copy persuasiva", prompt: "Crie uma copy persuasiva para anúncio de " },
    { emoji: "#️⃣", label: "Hashtags", prompt: "Sugira 30 hashtags relevantes para um post sobre " },
    { emoji: "📅", label: "Calendário editorial", prompt: "Monte um calendário editorial de 1 mês para uma empresa de " },
  ];

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const startNewChat = () => {
    const newId = "chat_" + Date.now();
    setActiveChat(newId);
    setMessages([]);
    setView("chat");
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 200);
  };

  const openChat = (conv) => {
    setActiveChat(conv.id);
    setMessages([...conv.messages]);
    setView("chat");
  };

  const saveToHistory = (chatId, msgs) => {
    if (msgs.length === 0) return;
    const title = msgs[0]?.content?.substring(0, 60) + (msgs[0]?.content?.length > 60 ? "..." : "");
    const now = new Date();
    const ts = now.toLocaleDateString("pt-BR", {day:"2-digit",month:"2-digit",year:"numeric"}) + " " + now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    setConversations(prev => {
      const exists = prev.find(c => c.id === chatId);
      if (exists) {
        return prev.map(c => c.id === chatId ? { ...c, messages: msgs, title, updatedAt: ts } : c);
      }
      return [{ id: chatId, title, messages: msgs, updatedAt: ts, pinned: false }, ...prev];
    });
  };

  const deleteChat = (id) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    showToast("Conversa excluída ✓");
  };

  const togglePin = (id) => {
    setConversations(prev => prev.map(c => c.id === id ? { ...c, pinned: !c.pinned } : c));
  };

  const sendMessage = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text.trim() };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setSelPreset(null);
    setLoading(true);

    let chatId = activeChat;
    if (!chatId) { chatId = "chat_" + Date.now(); setActiveChat(chatId); }
    setView("chat");

    try {
      const apiMessages = newMsgs.map(m => ({ role: m.role, content: m.content }));
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `Você é o Assistente IA da UniqueHub Agency, uma agência de marketing 360 em Petrópolis/RJ. Você ajuda a equipe com criação de conteúdo, estratégias de marketing, copywriting, legendas para redes sociais, roteiros, ideias criativas e planejamento. Responda sempre em português do Brasil, de forma prática e direta. O usuário atual é ${user?.name || "um colaborador"} (${user?.role || "equipe"}). Seja criativo, use emojis quando apropriado, e formate bem suas respostas.`,
          messages: apiMessages,
        })
      });
      const data = await response.json();
      const aiText = data.content?.map(i => i.text || "").filter(Boolean).join("\n") || "Desculpe, não consegui gerar uma resposta.";
      const finalMsgs = [...newMsgs, { role: "assistant", content: aiText }];
      setMessages(finalMsgs);
      saveToHistory(chatId, finalMsgs);
    } catch (err) {
      const finalMsgs = [...newMsgs, { role: "assistant", content: "⚠️ Erro ao conectar com a IA. Verifique sua conexão e tente novamente." }];
      setMessages(finalMsgs);
      saveToHistory(chatId, finalMsgs);
    }
    setLoading(false);
  };

  const goBackToHistory = () => {
    if (messages.length > 0 && activeChat) saveToHistory(activeChat, messages);
    setView("history");
    setActiveChat(null);
    setMessages([]);
  };

  /* ═══ HISTORY VIEW ═══ */
  if (view === "history") {
    const pinned = conversations.filter(c => c.pinned);
    const recent = conversations.filter(c => !c.pinned);
    const q = searchQ.toLowerCase().trim();
    const filtered = q ? conversations.filter(c => c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q))) : null;
    const showList = filtered || null;

    return (
      <div className="pg">
        {ToastEl}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", color:B.text }}>{IC.back()}</button>
            <h2 style={{ fontSize:18, fontWeight:800 }}>Assistente IA</h2>
          </div>
          <button onClick={startNewChat} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:12, background:B.accent, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:700, color:"#192126" }}>
            {IC.plus} Nova
          </button>
        </div>

        {/* Search */}
        <div style={{ position:"relative", marginBottom:14 }}>
          <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:B.muted, display:"flex" }}>{IC.search(B.muted)}</span>
          <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Buscar conversas..." className="tinput" style={{ paddingLeft:42 }} />
          {searchQ && <button onClick={() => setSearchQ("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:B.muted, display:"flex" }}>{IC.x}</button>}
        </div>

        {/* Search results */}
        {showList && <>
          <p className="sl" style={{ marginBottom:8 }}>Resultados ({showList.length})</p>
          {showList.length === 0 && <Card style={{ textAlign:"center", padding:20 }}><p style={{ fontSize:13, color:B.muted }}>Nenhuma conversa encontrada</p></Card>}
          {showList.map((c, i) => (
            <Card key={c.id} delay={i*0.03} onClick={() => openChat(c)} style={{ marginBottom:8, cursor:"pointer" }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:12, background:`${B.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:B.accent }}>{IC.ai(B.accent)}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.title}</p>
                  <p style={{ fontSize:11, color:B.muted, marginTop:2 }}>{c.messages.length} mensagens · {c.updatedAt}</p>
                </div>
              </div>
            </Card>
          ))}
        </>}

        {/* Normal view */}
        {!showList && <>
          {/* Empty state */}
          {conversations.length === 0 && (
            <div style={{ textAlign:"center", padding:"40px 20px" }}>
              <div style={{ width:64, height:64, borderRadius:20, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
                <span style={{ color:B.accent, transform:"scale(1.5)", display:"flex" }}>{IC.ai(B.accent)}</span>
              </div>
              <h3 style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Nenhuma conversa ainda</h3>
              <p style={{ fontSize:13, color:B.muted, lineHeight:1.6, marginBottom:20 }}>Comece uma nova conversa com o assistente de IA!</p>
              <button onClick={startNewChat} className="pill accent">Iniciar conversa</button>
            </div>
          )}

          {/* Pinned */}
          {pinned.length > 0 && <>
            <p className="sl" style={{ marginBottom:8 }}>Fixadas</p>
            {pinned.map((c, i) => (
              <Card key={c.id} delay={i*0.03} style={{ marginBottom:8, border:`1.5px solid ${B.accent}20` }}>
                <div onClick={() => openChat(c)} style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }}>
                  <div style={{ width:36, height:36, borderRadius:12, background:`${B.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:B.accent }}>{IC.ai(B.accent)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      <span style={{ fontSize:12, color:B.accent }}>📌</span>
                      <p style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{c.title}</p>
                    </div>
                    <p style={{ fontSize:11, color:B.muted, marginTop:2 }}>{c.messages.length} mensagens · {c.updatedAt}</p>
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, marginTop:8, paddingTop:8, borderTop:`1px solid ${B.border}` }}>
                  <button onClick={() => openChat(c)} style={{ flex:1, padding:"6px 0", borderRadius:8, border:`1px solid ${B.border}`, background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.text }}>Continuar</button>
                  <button onClick={(e) => { e.stopPropagation(); togglePin(c.id); }} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${B.border}`, background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.muted }}>Desafixar</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }} style={{ padding:"6px 12px", borderRadius:8, border:"none", background:`${B.red}10`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.red }}>Excluir</button>
                </div>
              </Card>
            ))}
          </>}

          {/* Recent */}
          {recent.length > 0 && <>
            <p className="sl" style={{ marginBottom:8, marginTop:pinned.length?8:0 }}>Recentes</p>
            {recent.map((c, i) => (
              <Card key={c.id} delay={i*0.03} style={{ marginBottom:8 }}>
                <div onClick={() => openChat(c)} style={{ display:"flex", alignItems:"flex-start", gap:10, cursor:"pointer" }}>
                  <div style={{ width:36, height:36, borderRadius:12, background:`${B.accent}12`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:B.accent }}>{IC.ai(B.accent)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontSize:13, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.title}</p>
                    <p style={{ fontSize:11, color:B.muted, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.messages[c.messages.length-1]?.content?.substring(0,80)}...</p>
                    <p style={{ fontSize:10, color:B.muted, marginTop:4 }}>{c.messages.length} mensagens · {c.updatedAt}</p>
                  </div>
                </div>
                <div style={{ display:"flex", gap:6, marginTop:8, paddingTop:8, borderTop:`1px solid ${B.border}` }}>
                  <button onClick={() => openChat(c)} style={{ flex:1, padding:"6px 0", borderRadius:8, border:`1px solid ${B.border}`, background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.text }}>Continuar</button>
                  <button onClick={(e) => { e.stopPropagation(); togglePin(c.id); }} style={{ padding:"6px 12px", borderRadius:8, border:`1px solid ${B.border}`, background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.muted }}>Fixar</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteChat(c.id); }} style={{ padding:"6px 12px", borderRadius:8, border:"none", background:`${B.red}10`, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.red }}>Excluir</button>
                </div>
              </Card>
            ))}
          </>}

          {/* Quick starts */}
          {conversations.length > 0 && <>
            <p className="sl" style={{ marginTop:12, marginBottom:8 }}>Atalhos rápidos</p>
            <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4 }} className="hscroll">
              {PRESETS.map((p, i) => (
                <button key={i} onClick={() => { startNewChat(); setTimeout(() => setInput(p.prompt), 100); }} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:12, border:`1.5px solid ${B.border}`, background:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.text, whiteSpace:"nowrap", flexShrink:0 }}>
                  <span>{p.emoji}</span> {p.label}
                </button>
              ))}
            </div>
          </>}
        </>}
      </div>
    );
  }

  /* ═══ NEW CHAT (empty state) ═══ */
  if (view === "chat" && messages.length === 0 && !loading) return (
    <div className="pg" style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      {ToastEl}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={goBackToHistory} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", color:B.text }}>{IC.back()}</button>
          <h2 style={{ fontSize:18, fontWeight:800 }}>Nova conversa</h2>
        </div>
      </div>

      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", padding:"0 12px" }}>
        <div style={{ width:64, height:64, borderRadius:20, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", marginBottom:16 }}>
          <span style={{ color:B.accent, transform:"scale(1.5)", display:"flex" }}>{IC.ai(B.accent)}</span>
        </div>
        <h3 style={{ fontSize:18, fontWeight:800, marginBottom:6 }}>Olá, {user?.nick || user?.name || "equipe"}!</h3>
        <p style={{ fontSize:13, color:B.muted, lineHeight:1.6, marginBottom:24 }}>Como posso ajudar? Escolha um atalho ou digite sua pergunta.</p>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:8, width:"100%" }}>
          {PRESETS.map((p, i) => (
            <Card key={i} onClick={() => { setSelPreset(i); setInput(p.prompt); setTimeout(()=>inputRef.current?.focus(),100); }} style={{ cursor:"pointer", padding:12, textAlign:"left", border:`1.5px solid ${selPreset===i?B.accent:B.border}`, background:selPreset===i?`${B.accent}06`:B.bgCard }}>
              <span style={{ fontSize:20, display:"block", marginBottom:4 }}>{p.emoji}</span>
              <p style={{ fontSize:12, fontWeight:700 }}>{p.label}</p>
            </Card>
          ))}
        </div>
      </div>

      <div style={{ padding:"12px 0 4px", display:"flex", gap:8, alignItems:"flex-end" }}>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if(e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="Pergunte qualquer coisa..."
          className="tinput" style={{ flex:1, minHeight:44, maxHeight:100, resize:"none", paddingTop:12 }}
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim()} className="send-btn" style={{ opacity:input.trim()?1:0.4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );

  /* ═══ ACTIVE CHAT VIEW ═══ */
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:B.bg }}>
      {ToastEl}
      <div style={{ padding:`52px 16px 10px`, display:"flex", alignItems:"center", justifyContent:"space-between", background:B.bgCard, borderBottom:`1px solid ${B.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={goBackToHistory} style={{ background:"none", border:"none", cursor:"pointer", display:"flex", color:B.text }}>{IC.back()}</button>
          <div style={{ width:36, height:36, borderRadius:12, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", color:B.accent }}>{IC.ai(B.accent)}</div>
          <div>
            <p style={{ fontSize:14, fontWeight:700 }}>Assistente IA</p>
            <p style={{ fontSize:10, color:B.green, fontWeight:600 }}>● Online</p>
          </div>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={() => { togglePin(activeChat); showToast(conversations.find(c=>c.id===activeChat)?.pinned ? "Desafixado" : "Fixado 📌"); }} className="ib" style={{ width:34, height:34 }} title="Fixar">
            <span style={{ fontSize:14 }}>📌</span>
          </button>
          <button onClick={startNewChat} className="ib" style={{ width:34, height:34 }} title="Nova conversa">
            {IC.plus}
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex:1, overflowY:"auto", padding:16, display:"flex", flexDirection:"column", gap:12 }}>
        {messages.map((m, i) => {
          const isUser = m.role === "user";
          return (
            <div key={i} style={{ display:"flex", justifyContent:isUser?"flex-end":"flex-start", gap:8, alignItems:"flex-end" }}>
              {!isUser && <div style={{ width:28, height:28, borderRadius:10, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><span style={{ color:B.accent, transform:"scale(0.7)", display:"flex" }}>{IC.ai(B.accent)}</span></div>}
              <div style={{
                maxWidth:"80%", padding:"10px 14px", borderRadius:isUser?"16px 4px 16px 16px":"4px 16px 16px 16px",
                background:isUser?B.accent:B.bgCard, color:isUser?"#192126":B.text,
                boxShadow:`0 1px 3px ${isUser?"rgba(0,0,0,0.1)":"rgba(0,0,0,0.06)"}`,
                fontSize:13, lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word",
              }}>
                {m.content}
              </div>
            </div>
          );
        })}
        {loading && (
          <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
            <div style={{ width:28, height:28, borderRadius:10, background:`${B.accent}15`, display:"flex", alignItems:"center", justifyContent:"center" }}><span style={{ color:B.accent, transform:"scale(0.7)", display:"flex" }}>{IC.ai(B.accent)}</span></div>
            <div style={{ padding:"12px 18px", borderRadius:"4px 16px 16px 16px", background:B.bgCard, display:"flex", gap:4, alignItems:"center" }}>
              <div style={{ width:6, height:6, borderRadius:3, background:B.accent, animation:"skPulse 1s ease infinite" }} />
              <div style={{ width:6, height:6, borderRadius:3, background:B.accent, animation:"skPulse 1s ease infinite .2s" }} />
              <div style={{ width:6, height:6, borderRadius:3, background:B.accent, animation:"skPulse 1s ease infinite .4s" }} />
            </div>
          </div>
        )}
      </div>

      {messages.length > 0 && messages.length < 4 && !loading && (
        <div style={{ padding:"0 16px 4px", display:"flex", gap:6, overflowX:"auto" }} className="hscroll">
          {["Melhore isso", "Mais curto", "Mais criativo", "Versão formal", "Traduzir p/ inglês"].map((s, i) => (
            <button key={i} onClick={() => sendMessage(s)} style={{ padding:"6px 14px", borderRadius:10, border:`1.5px solid ${B.border}`, background:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:B.text, whiteSpace:"nowrap", flexShrink:0 }}>{s}</button>
          ))}
        </div>
      )}

      <div style={{ padding:"8px 16px calc(env(safe-area-inset-bottom, 8px) + 8px)", background:B.bgCard, borderTop:`1px solid ${B.border}`, display:"flex", gap:8, alignItems:"flex-end" }}>
        <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if(e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
          placeholder="Escreva sua mensagem..."
          className="tinput" style={{ flex:1, minHeight:44, maxHeight:100, resize:"none", paddingTop:12, border:`1.5px solid ${B.border}` }}
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading} className="send-btn" style={{ opacity:(input.trim()&&!loading)?1:0.4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
}


function HelpPage({ onBack }) {
  const [selCat, setSelCat] = useState(null);
  const [selQ, setSelQ] = useState(null);
  const [contactForm, setContactForm] = useState(false);
  const [cMsg, setCMsg] = useState("");
  const [cTopic, setCTopic] = useState("");
  const { showToast, ToastEl } = useToast();

  const FAQ = [
    { cat:"Primeiros Passos", icon:IC.home, color:B.accent, questions:[
      { q:"Como adicionar um novo cliente?", a:"Vá em Clientes no menu principal, toque no botão '+ Novo Cliente' no topo da página. Preencha os dados do cliente como nome, contato, plano e segmento, depois toque em 'Salvar'. O cliente aparecerá automaticamente na lista." },
      { q:"Como fazer check-in de ponto?", a:"Acesse Check-in no menu ou pelo atalho na Home. Toque em 'Registrar Entrada' ao chegar e 'Registrar Saída' ao sair. O sistema registra automaticamente o horário e calcula as horas trabalhadas." },
      { q:"Como personalizar meu menu de navegação?", a:"Vá em Configurações > Personalizar Menu. Lá você pode arrastar os itens para reordenar e escolher quais aparecem na barra de navegação inferior (máximo 5 itens)." },
      { q:"Como alterar minha foto de perfil?", a:"Vá em Configurações > Perfil. Toque no ícone da câmera sobre sua foto de perfil atual e selecione uma nova imagem da sua galeria." },
    ]},
    { cat:"Clientes & Conteúdo", icon:IC.clients, color:B.blue, questions:[
      { q:"Como criar uma demanda de conteúdo?", a:"Na aba Conteúdo, selecione o pipeline desejado (Social, Campanhas ou Vídeo) e toque no '+'. Preencha o briefing com título, cliente, rede social e descrição. A demanda entrará na primeira coluna do pipeline." },
      { q:"Como mover uma demanda entre etapas?", a:"No pipeline de conteúdo, toque na demanda desejada para abrir os detalhes. Use os botões de 'Avançar Etapa' ou 'Voltar Etapa' para mover entre as colunas do pipeline." },
      { q:"Como acessar os arquivos de um cliente?", a:"Vá em Clientes, toque no cliente desejado e selecione a aba 'Biblioteca'. Todos os arquivos do cliente estarão organizados por categoria (Manual de Marca, Posts, Stories, Vídeos, etc.)." },
      { q:"Como enviar um contrato?", a:"No perfil do cliente, acesse a aba 'Contrato'. Lá você pode visualizar e gerenciar os termos contratuais, valores e datas de vigência." },
    ]},
    { cat:"Financeiro", icon:IC.dollar, color:B.green, questions:[
      { q:"Como visualizar o faturamento mensal?", a:"Acesse Financeiro no menu principal ou pelo card na Home. O dashboard mostra receita total, quantidade de pagantes, ticket médio e status de cada cliente (pago, pendente, atrasado)." },
      { q:"Como registrar um pagamento recebido?", a:"No Financeiro, localize o cliente na lista e toque em 'Marcar como Pago'. O sistema atualizará automaticamente o status e os totais do mês." },
      { q:"Como gerar relatórios financeiros?", a:"Vá em Relatórios > Financeiro. Selecione o período desejado e visualize a evolução de receita, receita por plano e detalhamento por cliente." },
    ]},
    { cat:"Equipe & Chat", icon:IC.chat, color:B.purple, questions:[
      { q:"Como usar o chat interno?", a:"Acesse Chat no menu principal. Você pode enviar mensagens para toda a equipe no chat geral ou tocar no nome de um membro para iniciar uma conversa privada. O chat suporta texto e mostra indicadores de leitura." },
      { q:"Como ver quem está online?", a:"Na Home, a seção 'Equipe online' mostra todos os membros com indicador verde (online) ou cinza (offline). Também é possível ver o status na página Equipe." },
      { q:"Como adicionar um membro à equipe?", a:"Vá em Equipe e toque em '+ Novo Membro'. Preencha nome, cargo, e-mail e telefone. Alternativamente, o membro pode se cadastrar pela tela de login e aguardar aprovação em Configurações > Aprovações." },
    ]},
    { cat:"Calendário & Agenda", icon:IC.clock, color:B.orange, questions:[
      { q:"Como criar um evento no calendário?", a:"Acesse Calendário, selecione o dia desejado e toque em '+ Novo'. Escolha o tipo (Reunião, Gravação, Evento, Lembrete ou Deadline), preencha os detalhes e salve." },
      { q:"Quais tipos de evento posso criar?", a:"O calendário suporta 5 tipos: Reunião (online/presencial, interna/com cliente), Gravação (com lista de equipamentos), Evento (externo), Lembrete (pessoal) e Deadline (prazo de entrega)." },
      { q:"Como adicionar participantes a um evento?", a:"Ao criar ou editar uma Reunião ou Gravação, use o campo 'Participantes' para selecionar membros da equipe. Você pode adicionar múltiplos participantes." },
    ]},
    { cat:"Conta & Segurança", icon:IC.lock, color:B.red, questions:[
      { q:"Como alterar minha senha?", a:"Vá em Configurações > Segurança > Alterar Senha. Digite sua senha atual, depois a nova senha (que deve ter 8+ caracteres, maiúscula, minúscula, número e caractere especial) e confirme." },
      { q:"Como ativar a autenticação em dois fatores?", a:"Vá em Configurações > Segurança e ative o toggle de 'Autenticação 2 Fatores'. Siga as instruções para configurar o app de autenticação." },
      { q:"Como encerrar sessões em outros dispositivos?", a:"Vá em Configurações > Segurança > Sessões Ativas. Você pode encerrar sessões individualmente ou usar 'Encerrar todas as outras sessões' para manter apenas o dispositivo atual." },
      { q:"Como aprovar um novo cadastro?", a:"Apenas CEO e Gerentes podem aprovar cadastros. Vá em Configurações > Aprovações para ver solicitações pendentes. Toque em Aprovar ou Recusar para cada solicitação." },
    ]},
  ];

  /* ── CONTACT FORM ── */
  if (contactForm) return (
    <div className="pg">
      {ToastEl}
      <Head title="Falar com Suporte" onBack={() => setContactForm(false)} />
      <Card style={{ background:`${B.accent}06`, border:`1.5px solid ${B.accent}20`, marginBottom:12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ color:B.accent, display:"flex" }}>{IC.chat}</span>
          <p style={{ fontSize:12, color:B.accent, fontWeight:500 }}>Tempo médio de resposta: 2 horas úteis</p>
        </div>
      </Card>
      <Card style={{ marginBottom:8 }}>
        <label className="sl" style={{ display:"block", marginBottom:6 }}>Assunto</label>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {["Bug / Erro","Dúvida","Sugestão","Financeiro","Outro"].map(t => (
            <button key={t} onClick={() => setCTopic(t)} style={{ padding:"7px 14px", borderRadius:10, border:`1.5px solid ${cTopic===t?B.accent:B.border}`, background:cTopic===t?`${B.accent}12`:B.bgCard, cursor:"pointer", fontFamily:"inherit", fontSize:11, fontWeight:600, color:cTopic===t?B.dark:B.muted }}>{t}</button>
          ))}
        </div>
      </Card>
      <Card style={{ marginBottom:12 }}>
        <label className="sl" style={{ display:"block", marginBottom:6 }}>Mensagem</label>
        <textarea value={cMsg} onChange={e => setCMsg(e.target.value)} placeholder="Descreva sua dúvida ou problema com o máximo de detalhes..." className="tinput" style={{ minHeight:100, resize:"vertical" }} />
      </Card>
      <button onClick={() => { if(!cTopic) return showToast("Selecione um assunto"); if(!cMsg.trim()) return showToast("Escreva a mensagem"); setContactForm(false); setCMsg(""); setCTopic(""); showToast("Mensagem enviada ao suporte ✓"); }} className="pill full accent">Enviar Mensagem</button>
    </div>
  );

  /* ── FAQ DETAIL ── */
  if (selCat !== null) {
    const cat = FAQ[selCat];
    return (
      <div className="pg">
        {ToastEl}
        <Head title={cat.cat} onBack={() => { setSelCat(null); setSelQ(null); }} />
        {cat.questions.map((item, i) => (
          <Card key={i} delay={i*0.03} style={{ marginBottom:8 }}>
            <div onClick={() => setSelQ(selQ === i ? null : i)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
              <p style={{ fontSize:13, fontWeight:600, flex:1, paddingRight:8 }}>{item.q}</p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={B.muted} strokeWidth="2.5" style={{ transition:"transform .2s", transform:selQ===i?"rotate(180deg)":"rotate(0)" }}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {selQ === i && <p style={{ fontSize:12, color:B.text, lineHeight:1.7, marginTop:10, paddingTop:10, borderTop:`1px solid ${B.border}` }}>{item.a}</p>}
          </Card>
        ))}
      </div>
    );
  }

  /* ── MAIN HELP ── */
  return (
    <div className="pg">
      {ToastEl}
      <Head title="Ajuda" onBack={onBack} />

      <Card style={{ background:B.dark, color:"#fff", border:"none", marginBottom:12, textAlign:"center", padding:20 }}>
        <div style={{ width:48, height:48, borderRadius:16, background:`${B.accent}20`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 10px", color:B.accent }}>{IC.help(B.accent)}</div>
        <h3 style={{ fontSize:16, fontWeight:800 }}>Como podemos ajudar?</h3>
        <p style={{ fontSize:11, opacity:.6, marginTop:4 }}>Encontre respostas rápidas ou fale com o suporte</p>
      </Card>

      <p className="sl" style={{ marginBottom:8 }}>Categorias</p>
      {FAQ.map((cat, i) => (
        <Card key={i} delay={i*0.03} onClick={() => setSelCat(i)} style={{ marginBottom:8, cursor:"pointer" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:`${cat.color}10`, display:"flex", alignItems:"center", justifyContent:"center", color:cat.color }}>{typeof cat.icon === "function" ? cat.icon(cat.color) : cat.icon}</div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14, fontWeight:600 }}>{cat.cat}</p>
              <p style={{ fontSize:11, color:B.muted }}>{cat.questions.length} perguntas</p>
            </div>
            {IC.chev()}
          </div>
        </Card>
      ))}

      <div style={{ marginTop:16 }}>
        <p className="sl" style={{ marginBottom:8 }}>Não encontrou sua resposta?</p>
        <Card onClick={() => setContactForm(true)} style={{ cursor:"pointer", border:`1.5px solid ${B.accent}25` }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:`${B.accent}10`, display:"flex", alignItems:"center", justifyContent:"center", color:B.accent }}>{IC.chat}</div>
            <div style={{ flex:1 }}>
              <p style={{ fontSize:14, fontWeight:600 }}>Falar com Suporte</p>
              <p style={{ fontSize:11, color:B.muted }}>Resposta em até 2 horas úteis</p>
            </div>
            {IC.chev()}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SearchPage({ onBack }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const inputRef = React.useRef(null);

  React.useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);

  const q = query.toLowerCase().trim();

  const clientResults = q ? CLIENTS_DATA_INIT.filter(c =>
    c.name.toLowerCase().includes(q) || c.contact?.toLowerCase().includes(q) || c.segment?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
  ) : [];

  const teamResults = q ? AGENCY_TEAM.filter(m =>
    m.name.toLowerCase().includes(q) || m.role?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q)
  ) : [];

  const fileResults = q ? CLIENTS_DATA_INIT.flatMap(c =>
    (c.files||[]).filter(f => f.name.toLowerCase().includes(q) || f.category?.toLowerCase().includes(q)).map(f => ({...f, clientName:c.name}))
  ).slice(0, 15) : [];

  const MENU_ITEMS = [
    { k:"home", l:"Home", d:"Dashboard principal", ic:IC.home },
    { k:"content", l:"Conteúdo", d:"Pipeline de demandas", ic:IC.content },
    { k:"chat", l:"Chat", d:"Mensagens da equipe", ic:IC.chat },
    { k:"clients", l:"Clientes", d:"Gerenciar clientes", ic:IC.clients },
    { k:"calendar", l:"Calendário", d:"Eventos e agenda", ic:IC.clock },
    { k:"library", l:"Biblioteca", d:"Todos os arquivos", ic:IC.folder },
    { k:"financial", l:"Financeiro", d:"Faturamento e pagamentos", ic:IC.dollar },
    { k:"reports", l:"Relatórios", d:"Performance e métricas", ic:IC.reports },
    { k:"team", l:"Equipe", d:"Membros da agência", ic:IC.team },
    { k:"academy", l:"Academy", d:"Cursos e treinamentos", ic:IC.academy },
    { k:"news", l:"News", d:"Notícias e tendências", ic:IC.news },
    { k:"ideas", l:"Ideias", d:"Brainstorm da equipe", ic:IC.ideas },
    { k:"ai", l:"Assistente IA", d:"Chat com inteligência artificial", ic:IC.ai },
    { k:"gamify", l:"Ranking", d:"Gamificação e recompensas", ic:IC.gamify },
    { k:"checkin", l:"Check-in", d:"Ponto digital", ic:IC.checkin },
    { k:"settings", l:"Configurações", d:"Perfil e preferências", ic:IC.settings },
    { k:"help", l:"Ajuda", d:"FAQ e suporte", ic:IC.help },
  ];

  const menuResults = q ? MENU_ITEMS.filter(m =>
    m.l.toLowerCase().includes(q) || m.d.toLowerCase().includes(q)
  ) : [];

  const totalResults = clientResults.length + teamResults.length + fileResults.length + menuResults.length;

  const hasResults = filter === "all" ? totalResults > 0 :
    filter === "clients" ? clientResults.length > 0 :
    filter === "team" ? teamResults.length > 0 :
    filter === "files" ? fileResults.length > 0 :
    menuResults.length > 0;

  const catColor = (cat) => ({ "Manual de Marca":B.red, "Posts Feed":B.blue, "Stories":B.pink, "Capas de Reels":B.purple, "Vídeos":B.orange, "Artes Digitais":B.cyan, "Material Impresso":B.green, "Documentos":B.muted, "Referências":"#F59E0B", "Outros":B.muted }[cat] || B.muted);

  return (
    <div className="pg">
      <Head title="Buscar" onBack={onBack} />

      {/* Search input */}
      <div style={{ position:"relative", marginBottom:12 }}>
        <span style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", color:B.muted, display:"flex" }}>{IC.search(B.muted)}</span>
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar clientes, equipe, arquivos, páginas..." className="tinput" style={{ paddingLeft:42 }} />
        {query && <button onClick={() => setQuery("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:B.muted, display:"flex" }}>{IC.x}</button>}
      </div>

      {/* Filters */}
      {q && <div className="hscroll" style={{ display:"flex", gap:4, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
        {[
          { k:"all", l:`Tudo (${totalResults})` },
          { k:"clients", l:`Clientes (${clientResults.length})` },
          { k:"team", l:`Equipe (${teamResults.length})` },
          { k:"files", l:`Arquivos (${fileResults.length})` },
          { k:"pages", l:`Páginas (${menuResults.length})` },
        ].map(f => (
          <button key={f.k} onClick={() => setFilter(f.k)} className={`htab${filter===f.k?" a":""}`} style={{ fontSize:10, whiteSpace:"nowrap", flexShrink:0 }}>{f.l}</button>
        ))}
      </div>}

      {/* Empty state */}
      {!q && (
        <Card style={{ textAlign:"center", padding:28 }}>
          <div style={{ width:48, height:48, borderRadius:16, background:`${B.muted}08`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", color:B.muted }}>{IC.search(B.muted)}</div>
          <p style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>Busca global</p>
          <p style={{ fontSize:12, color:B.muted, lineHeight:1.5 }}>Pesquise em clientes, membros da equipe, arquivos da biblioteca e páginas do sistema.</p>
        </Card>
      )}

      {q && !hasResults && (
        <Card style={{ textAlign:"center", padding:24 }}>
          <p style={{ fontSize:14, fontWeight:600 }}>Nenhum resultado para "{query}"</p>
          <p style={{ fontSize:12, color:B.muted, marginTop:4 }}>Tente termos diferentes ou mais curtos.</p>
        </Card>
      )}

      {/* Client results */}
      {q && (filter === "all" || filter === "clients") && clientResults.length > 0 && <>
        <p className="sl" style={{ marginBottom:6 }}>Clientes</p>
        {clientResults.map((c,i) => (
          <Card key={c.id} delay={i*0.03} style={{ marginBottom:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <Av name={c.name} sz={36} fs={13} />
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:700 }}>{c.name}</p>
                <p style={{ fontSize:10, color:B.muted }}>{c.segment} · {c.plan} · {c.monthly}</p>
              </div>
              <Tag color={c.status==="ativo"?B.green:B.orange}>{c.status==="ativo"?"Ativo":"Trial"}</Tag>
            </div>
          </Card>
        ))}
      </>}

      {/* Team results */}
      {q && (filter === "all" || filter === "team") && teamResults.length > 0 && <>
        <p className="sl" style={{ marginTop:filter==="all"&&clientResults.length?12:0, marginBottom:6 }}>Equipe</p>
        {teamResults.map((m,i) => (
          <Card key={m.id} delay={i*0.03} style={{ marginBottom:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ position:"relative" }}>
                <Av name={m.name} sz={36} fs={13} />
                <div style={{ position:"absolute", bottom:0, right:0, width:10, height:10, borderRadius:5, background:m.status==="online"?B.green:B.muted, border:"2px solid #fff" }} />
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:700 }}>{m.name}</p>
                <p style={{ fontSize:10, color:B.muted }}>{m.role} · {m.email||""}</p>
              </div>
              <Tag color={m.status==="online"?B.green:B.muted}>{m.status==="online"?"Online":"Offline"}</Tag>
            </div>
          </Card>
        ))}
      </>}

      {/* File results */}
      {q && (filter === "all" || filter === "files") && fileResults.length > 0 && <>
        <p className="sl" style={{ marginTop:12, marginBottom:6 }}>Arquivos</p>
        {fileResults.map((f,i) => (
          <Card key={f.id} delay={i*0.03} style={{ marginBottom:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:`${catColor(f.category)}10`, display:"flex", alignItems:"center", justifyContent:"center", color:catColor(f.category) }}>
                {IC.doc}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</p>
                <p style={{ fontSize:10, color:B.muted }}>{f.clientName} · {f.category} · {f.size}</p>
              </div>
            </div>
          </Card>
        ))}
      </>}

      {/* Page results */}
      {q && (filter === "all" || filter === "pages") && menuResults.length > 0 && <>
        <p className="sl" style={{ marginTop:12, marginBottom:6 }}>Páginas</p>
        {menuResults.map((m,i) => (
          <Card key={m.k} delay={i*0.03} style={{ marginBottom:6 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:`${B.accent}10`, display:"flex", alignItems:"center", justifyContent:"center", color:B.accent }}>
                {typeof m.ic === "function" ? m.ic(B.accent) : m.ic}
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:700 }}>{m.l}</p>
                <p style={{ fontSize:10, color:B.muted }}>{m.d}</p>
              </div>
              {IC.chev()}
            </div>
          </Card>
        ))}
      </>}
    </div>
  );
}

function PlaceholderPage({ title, onBack, icon }) {
  return (
    <div className="pg">
      <Head title={title} onBack={onBack} />
      <Card style={{ textAlign: "center", padding: 40 }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: `${B.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: B.accent }}>{icon}</div>
        <h3 style={{ fontSize: 18, fontWeight: 800 }}>{title}</h3>
        <p style={{ fontSize: 13, color: B.muted, marginTop: 8 }}>Em breve disponível!</p>
      </Card>
    </div>
  );
}

/* ═══════════════════════ MAIN APP ═══════════════════════ */
function MainApp({ user, setUser, onLogout, dark, setDark, themeColor, setThemeColor }) {
  const [tab, setTab] = useState("home");
  const { ToastEl } = useToast();
  const accentColor = THEME_MAP[themeColor] || "#BBF246";
  B = getB(dark, accentColor);
  const [sub, setSub] = useState(null);
  const [more, setMore] = useState(false);
  const [navPicks, setNavPicks] = useState(DEFAULT_NAV);
  const TABS = [...navPicks.map(k => ALL_TABS.find(t => t.k === k)).filter(Boolean), { k: "more", l: "Mais", i: IC.more }];
  const [showNavEdit, setShowNavEdit] = useState(false);

  /* ── Shared clients state loaded from Supabase ── */
  const [sharedClients, setSharedClients] = useState([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);

  /* ── Shared demands state loaded from Supabase ── */
  const [sharedDemands, setSharedDemands] = useState([]);
  const [demandsLoaded, setDemandsLoaded] = useState(false);

  useEffect(() => {
    if (!supabase || clientsLoaded) return;
    supaLoadClients().then(rows => {
      if (rows) {
        if (rows.length > 0) {
          const merged = rows.map(r => {
            const existing = CLIENTS_DATA_INIT.find(c => c.name.toLowerCase() === r.name.toLowerCase());
            return mergeSupaClient(r, existing);
          });
          setSharedClients(merged);
        } else {
          setSharedClients([]);
        }
      } else {
        setSharedClients(CLIENTS_DATA_INIT);
      }
      setClientsLoaded(true);
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

  const goTab = k => { setTab(k); setSub(null); setMore(false); };
  const goSub = k => { setSub(k); setMore(false); };

  return (
    <div className="app" style={{ background: B.bg, color: B.text }}>
      {ToastEl}
      <style dangerouslySetInnerHTML={{ __html: `
.app,.screen{background:${B.bg}!important;color:${B.text}!important}
.card{background:${B.bgCard};box-shadow:0 1px 3px ${dark?"rgba(0,0,0,0.3)":"rgba(25,33,38,0.06)"}}
.tinput{background:${B.bgInput}!important;color:${B.text}!important;border-color:${B.border}!important}.tinput:focus{border-color:${B.accent}!important;box-shadow:0 0 0 3px ${B.accent}25!important}.tinput::placeholder{color:${B.muted}!important}
.pill.accent,.pill.full.accent{background:${B.accent}!important;color:${B.textOnAccent}!important}
.pill.outline{color:${B.text}!important;border-color:${B.border}!important}
.pill{background:${B.dark}!important}
.send-btn{background:${B.accent}!important;color:${B.textOnAccent}!important}
.htab{background:${B.bgCard}!important;color:${B.muted}!important}.htab.a{background:${B.accent}!important;color:${B.textOnAccent}!important;box-shadow:0 2px 8px ${B.accent}30!important}
.ib{background:${B.bgCard}!important;color:${B.text}!important;border-color:${B.border}!important}
.sheet{background:${B.bgCard}!important}
.grid-btn{background:${B.bgCard}!important;color:${B.text}!important}
.sl{color:${B.muted}!important}
.tag{background:${dark?"rgba(255,255,255,0.06)":"rgba(11,35,66,0.04)"}!important}
.overlay{background:${dark?"rgba(0,0,0,0.6)":"rgba(25,33,38,0.4)"}!important}
.txtbtn{color:${B.muted}!important}
.bnav{background:${dark?"#0A0F12":"#192126"}!important}
` }} />
      <div className="content">
        {!sub && tab === "home" && <HomePage user={user} goSub={goSub} goTab={goTab} clients={sharedClients} />}
        {!sub && tab === "content" && <ContentPage user={user} clients={sharedClients} demands={sharedDemands} setDemands={setSharedDemands} />}
        {!sub && tab === "chat" && <ChatPage user={user} />}
        {!sub && tab === "clients" && <ClientsPage onBack={() => goTab("home")} onNavigate={(to) => { if(to==="content") goTab("content"); else if(to==="chat") goTab("chat"); }} clients={sharedClients} setClients={setSharedClients} />}

        {sub === "checkin" && <CheckinPage onBack={() => setSub(null)} user={user} />}
        {sub === "clients" && <ClientsPage onBack={() => setSub(null)} onNavigate={(to) => { setSub(null); if(to==="content") goTab("content"); else if(to==="chat") goTab("chat"); }} clients={sharedClients} setClients={setSharedClients} />}
        {sub === "academy" && <AcademyPage onBack={() => setSub(null)} />}
        {sub === "financial" && <FinancialPage onBack={() => setSub(null)} clients={sharedClients} />}
        {sub === "notifs" && <NotifsPage onBack={() => setSub(null)} />}
        {sub === "settings" && <SettingsPage onBack={() => setSub(null)} user={user} setUser={setUser} onLogout={onLogout} dark={dark} setDark={setDark} themeColor={themeColor} setThemeColor={setThemeColor} onNavEdit={() => setShowNavEdit(true)} />}
        {sub === "calendar" && <CalendarPage onBack={() => setSub(null)} clients={sharedClients} />}
        {sub === "library" && <LibraryPage onBack={() => setSub(null)} clients={sharedClients} />}
        {sub === "reports" && <ReportsPage onBack={() => setSub(null)} clients={sharedClients} />}
        {sub === "news" && <NewsPage onBack={() => setSub(null)} />}
        {sub === "ideas" && <IdeasPage onBack={() => setSub(null)} />}
        {sub === "gamify" && <GamifyPage onBack={() => setSub(null)} user={user} />}
        {sub === "ai" && <AIPage onBack={() => setSub(null)} user={user} />}
        {sub === "help" && <HelpPage onBack={() => setSub(null)} />}
        {sub === "search" && <SearchPage onBack={() => setSub(null)} />}
        {sub === "team" && <TeamPage onBack={() => setSub(null)} />}
      </div>

      <nav className="bnav">
        {TABS.map(t => {
          const a = (tab === t.k && !sub) || (sub === t.k);
          return (
            <button key={t.k} onClick={() => {
              if (t.k === "more") { setMore(!more); return; }
              if (["clients", "checkin", "academy", "financial", "calendar", "library", "reports", "news", "ideas", "gamify", "ai", "help", "search", "settings", "team"].includes(t.k)) { goSub(t.k); return; }
              goTab(t.k);
            }} className={`bt${a ? " a" : ""}`} style={a ? { background: accentColor, borderRadius: 14, padding: "8px 14px", gap: 5, margin: "0 2px" } : {}}>
              {t.i(a ? "#192126" : "rgba(255,255,255,0.45)")}
              {a && <span style={{ fontSize: 11, fontWeight: 700, color: "#192126" }}>{t.l}</span>}
              {t.k === "content" && <Badge n={3} style={{ position: "absolute", top: -2, right: a ? -4 : "calc(50% - 10px)" }} />}
              {t.k === "chat" && <Badge n={4} style={{ position: "absolute", top: -2, right: a ? -4 : "calc(50% - 10px)" }} />}
            </button>
          );
        })}
      </nav>

      {more && <MoreSheet onClose={() => setMore(false)} goSub={goSub} />}
      {showNavEdit && <NavEditSheet picks={navPicks} setPicks={setNavPicks} onClose={() => setShowNavEdit(false)} />}
    </div>
  );
}

/* ═══════════════════════ ROOT ═══════════════════════ */
export default function App() {
  const [user, setUser] = useState(null);
  const [dark, setDark] = useState(false);
  const [themeColor, setThemeColor] = useState("default");
  const [authLoading, setAuthLoading] = useState(!!supabase);

  /* Check for existing Supabase session on mount */
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        setUser({
          id: session.user.id, name: profile?.name || session.user.user_metadata?.name || session.user.email.split("@")[0],
          email: session.user.email, role: profile?.role === "admin" ? "CEO" : profile?.role === "member" ? (profile?.nick || "Colaborador") : "Cliente",
          supaRole: profile?.role || "member", photo: profile?.photo_url || TEAM_PHOTOS.matheus,
          nick: profile?.nick || profile?.name || session.user.email.split("@")[0],
          phone: profile?.phone || "", cpf: "", birth: "", social: "", blood: "", remember: true,
        });
      }
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") setUser(null);
    });
    return () => subscription?.unsubscribe();
  }, []);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setUser(null);
  };

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
html,body{font-family:'Figtree',sans-serif;background:${dark?"#0F1419":"#F7F7F8"};margin:0;padding:0;height:100%;color:${dark?"#E8EAED":"#192126"};overflow:hidden}
input,textarea,select{font-size:16px !important}
.app{width:100%;max-width:430px;margin:0 auto;height:100vh;height:100dvh;display:flex;flex-direction:column;position:relative;overflow:hidden;background:${dark?"#0F1419":"#F7F7F8"}}
.screen{width:100%;max-width:430px;margin:0 auto;height:100vh;height:100dvh;display:flex;flex-direction:column;position:relative;overflow:hidden;background:${dark?"#0F1419":"#F7F7F8"}}
.content{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;scroll-behavior:smooth;padding-bottom:100px}
.pg{padding:16px 16px 20px;padding-top:${TOP}}
.card{padding:16px;border-radius:16px;background:${dark?"#1C2228":"#fff"};border:none;box-shadow:0 1px 3px ${dark?"rgba(0,0,0,0.3)":"rgba(25,33,38,0.06)"}}
.sl{font-size:10px;font-weight:600;color:${dark?"#8B9099":"#8B8F92"};text-transform:uppercase;letter-spacing:1px}
.ani{animation:fadeUp .35s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes skPulse{0%,100%{opacity:0.4}50%{opacity:0.8}}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.bnav{position:fixed;bottom:14px;left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:398px;display:flex;align-items:center;justify-content:space-around;background:${dark?"#0A0F12":"#192126"};border-radius:20px;padding:8px 6px;z-index:50;box-shadow:0 8px 32px rgba(25,33,38,0.4)}
.bt{flex:1;display:flex;align-items:center;justify-content:center;gap:0;padding:10px 0;background:none;border:none;cursor:pointer;color:rgba(255,255,255,0.45);font-family:inherit;position:relative;border-radius:14px;transition:all .25s ease}.bt.a{flex:1.4}
.htabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}.htabs::-webkit-scrollbar{display:none}
.htab{padding:7px 14px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;background:${dark?"#1C2228":"#fff"};color:${dark?"#8B9099":"#8B8F92"};border:none;cursor:pointer;font-family:inherit;box-shadow:0 1px 2px ${dark?"rgba(0,0,0,0.2)":"rgba(0,0,0,0.04)"}}.htab.a{background:${THEME_MAP[themeColor]||"#BBF246"};color:#192126;box-shadow:0 2px 8px ${THEME_MAP[themeColor]||"#BBF246"}30}
.hscroll{scrollbar-width:none}.hscroll::-webkit-scrollbar{display:none}
.tinput{width:100%;padding:12px 14px;border-radius:14px;border:1.5px solid ${dark?"rgba(255,255,255,0.08)":"rgba(11,35,66,0.08)"};font-size:16px !important;font-family:inherit;background:${dark?"#1C2228":"#fff"};outline:none;color:${dark?"#E8EAED":"#192126"};transition:border .15s}.tinput:focus{border-color:${THEME_MAP[themeColor]||"#BBF246"};box-shadow:0 0 0 3px ${THEME_MAP[themeColor]||"#BBF246"}25}.tinput::placeholder{color:${dark?"#8B9099":"#8B8F92"}}
.pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:10px 18px;border-radius:14px;font-size:13px;font-weight:600;border:none;cursor:pointer;font-family:inherit;background:#192126;color:#fff}.pill:active{transform:scale(0.97)}.pill.full{width:100%;padding:14px 20px;font-size:14px}.pill.accent{background:${THEME_MAP[themeColor]||"#BBF246"};color:#192126}.pill.outline{background:transparent;color:${dark?"#E8EAED":"#192126"};border:1.5px solid ${dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)"}}
.ib{display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;border:1.5px solid ${dark?"rgba(255,255,255,0.08)":"rgba(11,35,66,0.1)"};background:${dark?"#1C2228":"#fff"};cursor:pointer;color:${dark?"#E8EAED":"#192126"};box-shadow:0 2px 6px ${dark?"rgba(0,0,0,0.2)":"rgba(25,33,38,0.08)"}}
.tag{display:inline-flex;align-items:center;gap:2px;padding:3px 10px;border-radius:8px;font-size:10px;font-weight:600;background:${dark?"rgba(255,255,255,0.06)":"rgba(11,35,66,0.04)"};color:${dark?"#9CA3AF":"#5E6468"}}
.overlay{position:fixed;inset:0;background:${dark?"rgba(0,0,0,0.6)":"rgba(25,33,38,0.4)"};backdrop-filter:blur(6px);z-index:100;animation:fadeIn .2s}
.sheet{position:fixed;bottom:0;left:0;right:0;max-width:430px;margin:0 auto;background:${dark?"#1C2228":"#fff"};border-radius:24px 24px 0 0;z-index:101;padding:16px 20px 28px;animation:slideUp .3s cubic-bezier(.16,1,.3,1);border:none;box-shadow:0 -4px 30px ${dark?"rgba(0,0,0,0.4)":"rgba(25,33,38,0.15)"}}
.grid-btn{padding:14px 6px;border-radius:16px;background:${dark?"#1C2228":"#fff"};border:none;box-shadow:0 1px 3px ${dark?"rgba(0,0,0,0.2)":"rgba(25,33,38,0.06)"};display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font-family:inherit;transition:all .15s ease;color:${dark?"#E8EAED":"inherit"}}.grid-btn:active{transform:scale(0.95)}
.send-btn{width:44px;height:44px;border-radius:14px;background:${THEME_MAP[themeColor]||"#BBF246"};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#192126;flex-shrink:0;box-shadow:0 2px 8px ${THEME_MAP[themeColor]||"#BBF246"}30}
.txtbtn{background:none;border:none;color:${dark?"#8B9099":"#8B8F92"};cursor:pointer;font-family:inherit;font-size:13px;font-weight:500}
      `}</style>
      {!user && <LoginPage onAuth={setUser} />}
      {user && <MainApp user={user} setUser={setUser} onLogout={handleLogout} dark={dark} setDark={setDark} themeColor={themeColor} setThemeColor={setThemeColor} />}
    </>
  );
}
