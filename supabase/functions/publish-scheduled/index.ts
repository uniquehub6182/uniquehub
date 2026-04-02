import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { headers: { ...H, "Content-Type": "application/json" }, status: s });

/* ── Get Instagram token for a client ── */
async function getIGToken(sb: any, clientId: string) {
  let uid = "", at = "";
  const { data: s } = await sb.from("app_settings").select("value").eq("key", `ig_token_${clientId}`).single();
  if (s?.value) { try { const tk = JSON.parse(s.value); uid = tk.ig_user_id || ""; at = tk.access_token || ""; } catch {} }
  if (!uid || !at) {
    const { data: st } = await sb.from("social_tokens").select("access_token,ig_user_id,page_id").eq("client_id", clientId).eq("platform", "meta").single();
    if (st?.access_token && st?.page_id) {
      const pRes = await fetch(`https://graph.facebook.com/v21.0/${st.page_id}?fields=access_token,instagram_business_account&access_token=${st.access_token}`);
      const pData = await pRes.json();
      if (pData.access_token && pData.instagram_business_account?.id) {
        uid = pData.instagram_business_account.id; at = pData.access_token;
        await sb.from("app_settings").upsert({ key: `ig_token_${clientId}`, value: JSON.stringify({ ig_user_id: uid, access_token: at, page_id: st.page_id }) }, { onConflict: "key" });
      }
    }
  }
  if (!uid || !at) throw new Error("Instagram não conectado — reconecte nas configurações");
  return { uid, at };
}

/* waitReady removed — ALL IG posts now use 2-phase (no in-function waiting) */

/* ── Check IG container status (single call, for 2-phase REELS) ── */
async function checkContainerStatus(containerId: string, token: string): Promise<string> {
  const r = await fetch(`https://graph.facebook.com/v21.0/${containerId}?fields=status_code&access_token=${token}`);
  const d = await r.json();
  return d.status_code || "UNKNOWN"; // FINISHED, IN_PROGRESS, ERROR
}

/* ── R2 proxy (fails loud if needed) ── */
async function proxyToR2(fileUrl: string, sb: any): Promise<string> {
  if (fileUrl.includes("r2.dev") || fileUrl.includes("r2.cloudflarestorage")) return fileUrl;
  if (!fileUrl.includes("supabase.co/storage")) return fileUrl;
  const filename = fileUrl.split("/").pop() || `file_${Date.now()}`;
  const ext = filename.split(".").pop()?.toLowerCase() || "bin";
  const ct = ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "application/octet-stream";
  const r2Res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/r2-upload`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: filename, contentType: ct, sourceUrl: fileUrl }),
  });
  const r2Data = await r2Res.json();
  if (r2Data.publicUrl) { console.log(`[R2] ${filename} → OK`); return r2Data.publicUrl; }
  throw new Error(`R2 proxy failed for ${filename}: ${r2Data.error || 'unknown'}`);
}

/* ══════════════════════════════════════════════════════════
   INSTAGRAM PUBLISHING
   ══════════════════════════════════════════════════════════ */

/* ── Phase 1 for ALL IG types: Create container only (fast) ── */
async function createIGContainer(sb: any, clientId: string, urls: string[], caption: string, mediaType: string) {
  const { uid, at } = await getIGToken(sb, clientId);
  const type = (mediaType || "FEED").toUpperCase();
  const proxied = await Promise.all(urls.map(u => proxyToR2(u, sb)));
  
  let cid: string;
  if (type === "REELS") {
    const videoUrl = proxied[0];
    const coverUrl = proxied.length > 1 ? proxied[1] : null;
    const p = new URLSearchParams({ access_token: at, video_url: videoUrl, media_type: "REELS" });
    if (caption) p.append("caption", caption);
    if (coverUrl) p.append("cover_url", coverUrl);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  } else if (proxied.length > 1 && type !== "STORIES") {
    /* CAROUSEL: create children (no wait needed at creation) + main container */
    const kids: string[] = [];
    for (const imgUrl of proxied) {
      const p = new URLSearchParams({ access_token: at, image_url: imgUrl, is_carousel_item: "true" });
      const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      kids.push(d.id);
    }
    /* Save kids + main will be created in Phase 2 after kids are ready */
    return { container_id: null, ig_user_id: uid, type: "CAROUSEL", children: kids, caption };
  } else {
    /* FEED or STORIES */
    const p = new URLSearchParams({ access_token: at, image_url: proxied[0] });
    if (type === "STORIES") p.append("media_type", "STORIES");
    if (caption && type !== "STORIES") p.append("caption", caption);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  }
  console.log(`[IG Phase1] Container created: ${cid} (${type})`);
  return { container_id: cid, ig_user_id: uid, type };
}

/* ── Phase 2 for ALL IG types: Check ready & publish ── */
async function checkAndPublishIG(sb: any, clientId: string, meta: any) {
  const { at } = await getIGToken(sb, clientId);
  const uid = meta.ig_user_id;
  
  if (meta.type === "CAROUSEL" && meta.children && !meta.container_id) {
    /* CAROUSEL Phase 2a: check kids ready, then create main container */
    for (const kidId of meta.children) {
      const status = await checkContainerStatus(kidId, at);
      if (status === "IN_PROGRESS" || status === "UNKNOWN") return { ready: false, status: "children_processing" };
      if (status === "ERROR") throw new Error("Carousel child processing error");
    }
    /* All kids ready → create main carousel container */
    const p = new URLSearchParams({ access_token: at, media_type: "CAROUSEL", children: meta.children.join(",") });
    if (meta.caption) p.append("caption", meta.caption);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    /* Update meta with main container_id for next check */
    return { ready: false, status: "carousel_created", updated_meta: { ...meta, container_id: d.id } };
  }
  
  /* Check container status */
  const status = await checkContainerStatus(meta.container_id, at);
  console.log(`[IG Phase2] Container ${meta.container_id} (${meta.type}): ${status}`);
  if (status === "IN_PROGRESS" || status === "UNKNOWN") return { ready: false, status };
  if (status === "ERROR") throw new Error("Instagram rejeitou a mídia durante processamento");
  
  /* FINISHED → publish! */
  const pp = new URLSearchParams({ access_token: at, creation_id: meta.container_id });
  const pr = await fetch(`https://graph.facebook.com/v21.0/${uid}/media_publish`, { method: "POST", body: pp });
  const pd = await pr.json();
  if (pd.error) throw new Error(pd.error.message);
  return { ready: true, success: true, media_id: pd.id, media_type: meta.type };
}

/* (publishInstagramImages removed — ALL IG posts now use 2-phase via createIGContainer + checkAndPublishIG) */

/* ══════════════════════════════════════════════════════════
   FACEBOOK PUBLISHING (single-phase, streaming upload)
   ══════════════════════════════════════════════════════════ */
async function publishFacebook(sb: any, clientId: string, imageUrls: string[], caption: string, mediaType?: string) {
  let pageToken: string | null = null, pageId: string | null = null;
  const { data: s1 } = await sb.from("app_settings").select("value").eq("key", `client_socials_${clientId}`).single();
  if (s1?.value) { try { const soc = JSON.parse(s1.value); const fb = soc.facebook; if (fb?.oauth?.page_token && fb?.oauth?.page_id) { pageToken = fb.oauth.page_token; pageId = fb.oauth.page_id; } } catch {} }
  if (!pageToken || !pageId) {
    const { data: s2 } = await sb.from("app_settings").select("value").eq("key", `meta_token_${clientId}`).single();
    if (s2?.value) { try { const tk = JSON.parse(s2.value); if (tk.page_token && tk.page_id) { pageToken = tk.page_token; pageId = tk.page_id; } } catch {} }
  }
  if (!pageToken || !pageId) throw new Error("Token Facebook não encontrado");
  const type = (mediaType || "FEED").toUpperCase();
  const proxied = await Promise.all(imageUrls.map(u => proxyToR2(u, sb)));

  if (type === "REELS") {
    const videoUrl = proxied[0];
    if (!videoUrl) throw new Error("No video URL for Reels");
    const initRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: new URLSearchParams({ upload_phase: "start", access_token: pageToken }) });
    const initData = await initRes.json();
    if (initData.error) throw new Error(initData.error.message);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
    const fileSize = videoRes.headers.get("content-length") || "0";
    await fetch(initData.upload_url, { method: "POST", headers: { "Authorization": `OAuth ${pageToken}`, "offset": "0", "file_size": fileSize, "Content-Type": "application/octet-stream" }, body: videoRes.body });
    const finishParams = new URLSearchParams({ upload_phase: "finish", access_token: pageToken, video_id: initData.video_id });
    if (caption) finishParams.append("description", caption);
    if (proxied.length > 1 && proxied[1]) finishParams.append("thumb", proxied[1]);
    const finishRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: finishParams });
    const finishData = await finishRes.json();
    if (finishData.error) throw new Error(finishData.error.message);
    await fetch(`https://graph.facebook.com/v21.0/${initData.video_id}`, { method: "POST", body: new URLSearchParams({ access_token: pageToken, published: "true" }) });
    return { success: true, media_id: initData.video_id };
  }
  /* FEED photo */
  const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, { method: "POST", body: new URLSearchParams({ access_token: pageToken, message: caption || "", url: proxied[0] || "" }) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return { success: true, media_id: d.id || d.post_id };
}

/* ── Helper: mark demand published only when ALL posts are done ── */
async function tryMarkDemandPublished(sb: any, demandId: string) {
  if (!demandId) return;
  const { data: siblings } = await sb.from("scheduled_posts").select("id,status").eq("demand_id", demandId);
  const allDone = (siblings || []).every((s: any) => s.status === "published");
  if (allDone) {
    await sb.from("demands").update({ stage: "published" }).eq("id", demandId);
    console.log(`[Scheduler] ALL posts for demand ${demandId} → published`);
  }
}

/* ── Helper: notify admins on failure ── */
async function notifyFailure(sb: any, post: any, errorMsg: string) {
  try {
    let clientName = post.client_id;
    const { data: cl } = await sb.from("clients").select("name").eq("id", post.client_id).single();
    if (cl?.name) clientName = cl.name;
    const platform = post.platform === "instagram" ? "Instagram" : "Facebook";
    const msg = (errorMsg || "Erro desconhecido").substring(0, 120);
    const { data: team } = await sb.from("profiles").select("id, role").in("role", ["admin", "owner", "manager"]);
    for (const u of (team || [])) {
      await sb.from("notifications").insert({ user_id: u.id, type: "publish_failed", title: `❌ Falha — ${clientName} (${platform})`, body: `Erro: ${msg}`, read: false });
    }
  } catch (e) { console.error("[Notif] Error:", e); }
}

/* ══════════════════════════════════════════════════════════
   MAIN HANDLER
   ══════════════════════════════════════════════════════════ */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    /* ── Admin reset mode ── */
    let body: any = {};
    try { body = await req.json(); } catch {}
    if (body?.action === "reset_all") {
      const r1 = await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("status", "publishing").select("id");
      const r2 = await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("status", "failed").ilike("error", "%Only photo or video%").select("id");
      const r3 = await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("status", "failed").ilike("error", "%Invalid image format%").select("id");
      const r4 = await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("status", "failed").ilike("error", "%R2 proxy failed%").select("id");
      const { data: badDemands } = await sb.from("scheduled_posts").select("demand_id").in("status", ["pending","failed"]).not("demand_id","is",null);
      const uids = [...new Set((badDemands||[]).map((d:any) => d.demand_id))];
      let dr = 0;
      for (const did of uids) { const { data: dem } = await sb.from("demands").select("stage").eq("id", did).single(); if (dem?.stage === "published") { await sb.from("demands").update({ stage: "scheduled" }).eq("id", did); dr++; } }
      return json({ reset: true, stuck: r1.data?.length||0, r2_fix: (r2.data?.length||0)+(r3.data?.length||0)+(r4.data?.length||0), demands_reset: dr });
    }

    const now = new Date();
    const nowISO = now.toISOString();
    const results: any[] = [];

    /* ═══ RECOVERY: stuck "publishing" posts (>5 min) ═══ */
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: stuck } = await sb.from("scheduled_posts").select("id").eq("status", "publishing").lte("created_at", fiveMinAgo);
    if (stuck?.length) {
      for (const s of stuck) await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("id", s.id);
      console.log(`[Recovery] Reset ${stuck.length} stuck publishing posts`);
    }

    /* ═══ PHASE 2: Check REELS containers being processed by Instagram ═══ */
    const { data: processing } = await sb.from("scheduled_posts").select("*").eq("status", "processing");
    for (const post of (processing || [])) {
      try {
        const meta = typeof post.result === "string" ? JSON.parse(post.result) : post.result;
        if (!meta?.container_id || !meta?.ig_user_id) { 
          await sb.from("scheduled_posts").update({ status: "failed", error: "Missing container_id from Phase 1" }).eq("id", post.id);
          continue; 
        }
        const res = await checkAndPublishIG(sb, post.client_id, meta);
        if (res.ready) {
          await sb.from("scheduled_posts").update({ status: "published", result: res, published_at: new Date().toISOString() }).eq("id", post.id);
          console.log(`[Phase2] ✅ ${post.id} published on Instagram!`);
          results.push({ id: post.id, status: "published", phase: 2 });
          await tryMarkDemandPublished(sb, post.demand_id);
        } else if (res.updated_meta) {
          /* Carousel: main container created, save and check next cycle */
          await sb.from("scheduled_posts").update({ result: res.updated_meta }).eq("id", post.id);
          console.log(`[Phase2] Carousel main container created, will publish next cycle`);
          results.push({ id: post.id, status: "processing", phase: 2, note: "carousel_main_created" });
        } else {
          /* Not ready yet — check how long it's been processing */
          const created = new Date(post.created_at).getTime();
          const elapsed = (now.getTime() - created) / 60000; /* minutes */
          if (elapsed > 10) {
            await sb.from("scheduled_posts").update({ status: "failed", error: "Instagram não processou o vídeo em 10 min — verifique o arquivo" }).eq("id", post.id);
            await notifyFailure(sb, post, "Vídeo não processado após 10 min");
            results.push({ id: post.id, status: "failed", phase: 2, reason: "timeout_10min" });
          } else {
            console.log(`[Phase2] REELS ${post.id} still processing (${elapsed.toFixed(0)}min)...`);
            results.push({ id: post.id, status: "processing", phase: 2, minutes: elapsed.toFixed(0) });
          }
        }
      } catch (e: any) {
        const msg = e.message || "";
        const isTransient = msg.includes("unexpected") || msg.includes("temporarily") || msg.includes("timeout") || msg.includes("ETIMEDOUT");
        console.error(`[Phase2] ${isTransient?"Transient":"Fatal"} error for ${post.id}: ${msg}`);
        if (isTransient) {
          /* Auto-retry: reset to pending, cron will pick up again */
          await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("id", post.id);
          results.push({ id: post.id, status: "retry", phase: 2 });
        } else {
          await sb.from("scheduled_posts").update({ status: "failed", error: msg }).eq("id", post.id);
          await notifyFailure(sb, post, msg);
          results.push({ id: post.id, status: "failed", phase: 2, error: msg });
        }
      }
    }

    /* ═══ PHASE 1: Process pending posts that are due ═══ */
    const { data: allDue, error } = await sb.from("scheduled_posts").select("*")
      .eq("status", "pending").lte("scheduled_at", nowISO)
      .order("scheduled_at", { ascending: true }).limit(10);

    if (error) throw new Error(`DB: ${error.message}`);
    if ((!allDue || allDue.length === 0) && results.length === 0) {
      return json({ message: "No posts due", phase2: processing?.length || 0, recovered: stuck?.length || 0 });
    }

    /* Sort: images first (fast), videos last. Max 4 images + 1 video per call */
    const imgs = (allDue||[]).filter((p: any) => p.media_type !== "REELS");
    const vids = (allDue||[]).filter((p: any) => p.media_type === "REELS");
    const batch = [...imgs.slice(0, 4), ...vids.slice(0, 1)];
    console.log(`[Phase1] ${allDue?.length || 0} due → processing ${batch.length} (${imgs.length > 4 ? 4 : imgs.length} img + ${vids.length > 0 ? 1 : 0} vid)`);

    for (const post of batch) {
      /* Atomically claim the post */
      const { data: claimed } = await sb.from("scheduled_posts")
        .update({ status: "publishing" }).eq("id", post.id).eq("status", "pending").select("id").single();
      if (!claimed) continue;

      try {
        const urls = (post.image_urls || []) as string[];

        if (post.platform === "instagram") {
          /* ── ALL Instagram: 2-PHASE — create container now, publish in Phase 2 ── */
          const container = await createIGContainer(sb, post.client_id, urls, post.caption || "", post.media_type);
          await sb.from("scheduled_posts").update({
            status: "processing",
            result: container,
            error: null
          }).eq("id", post.id);
          console.log(`[Phase1] IG container created (${container.type}) → "processing"`);
          results.push({ id: post.id, status: "processing", phase: 1, type: container.type });
        } else {
          /* ── Facebook: single-phase publish ── */
          const result = await publishFacebook(sb, post.client_id, urls, post.caption || "", post.media_type);
          await sb.from("scheduled_posts").update({ status: "published", result, published_at: new Date().toISOString() }).eq("id", post.id);
          console.log(`[Phase1] ✅ Published ${post.id} on Facebook`);
          results.push({ id: post.id, status: "published", phase: 1 });
          await tryMarkDemandPublished(sb, post.demand_id);
        }
      } catch (e: any) {
        const msg = e.message || "";
        const isTransient = msg.includes("unexpected") || msg.includes("temporarily") || msg.includes("timeout") || msg.includes("ETIMEDOUT") || msg.includes("retry");
        console.error(`[Phase1] ${isTransient?"Transient":"Fatal"} ${post.id}: ${msg}`);
        if (isTransient) {
          await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("id", post.id);
          results.push({ id: post.id, status: "retry", phase: 1 });
        } else {
          await sb.from("scheduled_posts").update({ status: "failed", error: msg }).eq("id", post.id);
          await notifyFailure(sb, post, msg);
          results.push({ id: post.id, status: "failed", phase: 1, error: msg });
        }
      }
    }

    return json({ message: `Processed ${results.length} posts`, results, recovered: stuck?.length || 0 });
  } catch (e: any) {
    console.error("[Scheduler] Fatal:", e.message);
    return json({ error: e.message }, 500);
  }
});
