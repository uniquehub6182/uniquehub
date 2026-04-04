import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { headers: { ...H, "Content-Type": "application/json" }, status: s });

const MAX_RETRIES = 6;
const STUCK_TIMEOUT_MIN = 3;
const PROCESSING_TIMEOUT_MIN = 15;

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

async function checkContainerStatus(containerId: string, token: string): Promise<{status: string, error?: string}> {
  const r = await fetch(`https://graph.facebook.com/v21.0/${containerId}?fields=status_code,status&access_token=${token}`);
  const d = await r.json();
  return { status: d.status_code || "UNKNOWN", error: d.status || undefined };
}

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
  if (r2Data.publicUrl) return r2Data.publicUrl;
  throw new Error(`R2 proxy failed for ${filename}: ${r2Data.error || 'unknown'}`);
}

/* ══ INSTAGRAM PHASE 1: Create container ══ */
async function createIGContainer(sb: any, clientId: string, urls: string[], caption: string, mediaType: string) {
  const { uid, at } = await getIGToken(sb, clientId);
  const type = (mediaType || "FEED").toUpperCase();
  const proxied = await Promise.all(urls.map(u => proxyToR2(u, sb)));

  if (type === "REELS") {
    const videoUrl = proxied[0];
    const coverUrl = proxied.length > 1 ? proxied[1] : null;
    const p = new URLSearchParams({ access_token: at, video_url: videoUrl, media_type: "REELS" });
    if (caption) p.append("caption", caption);
    if (coverUrl) p.append("cover_url", coverUrl);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(`IG REELS container: ${d.error.message}`);
    return { container_id: d.id, ig_user_id: uid, type };
  } else if (proxied.length > 1 && type !== "STORIES") {
    const kids: string[] = [];
    for (const imgUrl of proxied) {
      const p = new URLSearchParams({ access_token: at, image_url: imgUrl, is_carousel_item: "true" });
      const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
      const d = await r.json();
      if (d.error) throw new Error(`IG carousel child: ${d.error.message}`);
      kids.push(d.id);
    }
    return { container_id: null, ig_user_id: uid, type: "CAROUSEL", children: kids, caption };
  } else {
    const p = new URLSearchParams({ access_token: at, image_url: proxied[0] });
    if (type === "STORIES") p.append("media_type", "STORIES");
    if (caption && type !== "STORIES") p.append("caption", caption);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(`IG ${type} container: ${d.error.message}`);
    return { container_id: d.id, ig_user_id: uid, type };
  }
}

/* ══ INSTAGRAM PHASE 2: Check & publish ══ */
async function checkAndPublishIG(sb: any, clientId: string, meta: any) {
  const { at } = await getIGToken(sb, clientId);
  const uid = meta.ig_user_id;

  if (meta.type === "CAROUSEL" && meta.children && !meta.container_id) {
    for (const kidId of meta.children) {
      const { status } = await checkContainerStatus(kidId, at);
      if (status === "IN_PROGRESS" || status === "UNKNOWN") return { ready: false };
      if (status === "ERROR") throw new Error("Carousel child processing error");
    }
    const p = new URLSearchParams({ access_token: at, media_type: "CAROUSEL", children: meta.children.join(",") });
    if (meta.caption) p.append("caption", meta.caption);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(`Carousel main: ${d.error.message}`);
    return { ready: false, updated_meta: { ...meta, container_id: d.id } };
  }

  const { status, error: statusError } = await checkContainerStatus(meta.container_id, at);
  if (status === "IN_PROGRESS" || status === "UNKNOWN") return { ready: false };
  if (status === "ERROR") throw new Error(`IG processamento falhou: ${statusError || "erro desconhecido"}`);

  const pp = new URLSearchParams({ access_token: at, creation_id: meta.container_id });
  const pr = await fetch(`https://graph.facebook.com/v21.0/${uid}/media_publish`, { method: "POST", body: pp });
  const pd = await pr.json();
  if (pd.error) throw new Error(`IG publish: ${pd.error.message}`);
  return { ready: true, success: true, media_id: pd.id, media_type: meta.type };
}

/* ══ FACEBOOK PUBLISHING ══ */
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
    if (initData.error) throw new Error(`FB Reels init: ${initData.error.message}`);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
    const fileSize = videoRes.headers.get("content-length") || "0";
    await fetch(initData.upload_url, { method: "POST", headers: { "Authorization": `OAuth ${pageToken}`, "offset": "0", "file_size": fileSize, "Content-Type": "application/octet-stream" }, body: videoRes.body });
    const finishParams = new URLSearchParams({ upload_phase: "finish", access_token: pageToken, video_id: initData.video_id });
    if (caption) finishParams.append("description", caption);
    if (proxied.length > 1 && proxied[1]) finishParams.append("thumb", proxied[1]);
    const finishRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: finishParams });
    const finishData = await finishRes.json();
    if (finishData.error) throw new Error(`FB Reels finish: ${finishData.error.message}`);
    await fetch(`https://graph.facebook.com/v21.0/${initData.video_id}`, { method: "POST", body: new URLSearchParams({ access_token: pageToken, published: "true" }) });
    return { success: true, media_id: initData.video_id };
  }
  const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, { method: "POST", body: new URLSearchParams({ access_token: pageToken, message: caption || "", url: proxied[0] || "" }) });
  const d = await r.json();
  if (d.error) throw new Error(`FB photo: ${d.error.message}`);
  return { success: true, media_id: d.id || d.post_id };
}

/* ── Helpers ── */
async function tryMarkDemandPublished(sb: any, demandId: string) {
  if (!demandId) return;
  const { data: siblings } = await sb.from("scheduled_posts").select("id,status").eq("demand_id", demandId);
  if ((siblings || []).every((s: any) => s.status === "published")) {
    await sb.from("demands").update({ stage: "published" }).eq("id", demandId);
  }
}

async function notifyFailure(sb: any, post: any, errorMsg: string) {
  try {
    let clientName = post.client_id;
    const { data: cl } = await sb.from("clients").select("name").eq("id", post.client_id).single();
    if (cl?.name) clientName = cl.name;
    const platform = post.platform === "instagram" ? "Instagram" : "Facebook";
    const { data: team } = await sb.from("profiles").select("id, role").in("role", ["admin", "owner", "manager"]);
    for (const u of (team || [])) {
      await sb.from("notifications").insert({ user_id: u.id, type: "publish_failed", title: `❌ Falha — ${clientName} (${platform})`, body: `${(errorMsg || "Erro desconhecido").substring(0, 200)}`, read: false });
    }
  } catch (e) { console.error("[Notif]", e); }
}

function isTransientError(msg: string): boolean {
  return /unexpected|temporarily|timeout|ETIMEDOUT|retry|ECONNRESET|socket|network|502|503|429/i.test(msg);
}

/* ══════════════════════════════════════════════════════════
   MAIN HANDLER — FIXED: uses updated_at, higher retry limit, processes more per call
   ══════════════════════════════════════════════════════════ */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  console.log(`[Scheduler] Request received at ${new Date().toISOString()}`);
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    /* ── Admin reset mode ── */
    let body: any = {};
    try { body = await req.json(); } catch {}
    if (body?.action === "reset_all") {
      const r1 = await sb.from("scheduled_posts").update({ status: "pending", error: null, retry_count: 0 }).eq("status", "publishing").select("id");
      const r2 = await sb.from("scheduled_posts").update({ status: "pending", error: null, retry_count: 0 }).eq("status", "failed").select("id");
      return json({ reset: true, publishing_reset: r1.data?.length||0, failed_reset: r2.data?.length||0 });
    }

    const now = new Date();
    const results: any[] = [];

    /* ═══ RECOVERY: stuck "publishing" posts — uses UPDATED_AT not created_at ═══ */
    const stuckCutoff = new Date(now.getTime() - STUCK_TIMEOUT_MIN * 60 * 1000).toISOString();
    const { data: stuck } = await sb.from("scheduled_posts")
      .select("id,retry_count")
      .eq("status", "publishing")
      .lte("updated_at", stuckCutoff);
    if (stuck?.length) {
      for (const s of stuck) {
        const retries = (s.retry_count || 0) + 1;
        if (retries >= MAX_RETRIES) {
          await sb.from("scheduled_posts").update({ status: "failed", error: `Falhou após ${retries} tentativas (publishing stuck)`, retry_count: retries }).eq("id", s.id);
          console.log(`[Recovery] FAILED ${s.id} after ${retries} retries`);
        } else {
          await sb.from("scheduled_posts").update({ status: "pending", error: null, retry_count: retries }).eq("id", s.id);
          console.log(`[Recovery] Reset ${s.id} (retry ${retries}/${MAX_RETRIES})`);
        }
      }
    }

    /* ═══ PHASE 2: Check containers being processed by Instagram ═══ */
    const { data: processing } = await sb.from("scheduled_posts").select("*").eq("status", "processing");
    for (const post of (processing || [])) {
      try {
        const meta = typeof post.result === "string" ? JSON.parse(post.result) : post.result;
        if (!meta?.ig_user_id) {
          await sb.from("scheduled_posts").update({ status: "failed", error: "Dados do container ausentes (Phase 1 incompleto)" }).eq("id", post.id);
          continue;
        }
        /* Carousel without main container_id — check children first */
        if (meta.type === "CAROUSEL" && !meta.container_id && !meta.children?.length) {
          await sb.from("scheduled_posts").update({ status: "failed", error: "Carousel sem children IDs" }).eq("id", post.id);
          continue;
        }
        const res = await checkAndPublishIG(sb, post.client_id, meta);
        if (res.ready) {
          await sb.from("scheduled_posts").update({ status: "published", result: res, published_at: new Date().toISOString() }).eq("id", post.id);
          console.log(`[Phase2] ✅ Published ${post.id}`);
          results.push({ id: post.id, status: "published", phase: 2 });
          await tryMarkDemandPublished(sb, post.demand_id);
        } else if (res.updated_meta) {
          await sb.from("scheduled_posts").update({ result: res.updated_meta }).eq("id", post.id);
          results.push({ id: post.id, status: "processing", phase: 2, note: "carousel_main_created" });
        } else {
          /* Still processing — check timeout */
          const elapsed = (now.getTime() - new Date(post.updated_at || post.created_at).getTime()) / 60000;
          if (elapsed > PROCESSING_TIMEOUT_MIN) {
            await sb.from("scheduled_posts").update({ status: "failed", error: `Instagram não processou em ${PROCESSING_TIMEOUT_MIN} min` }).eq("id", post.id);
            await notifyFailure(sb, post, `Vídeo não processado após ${PROCESSING_TIMEOUT_MIN} min`);
            results.push({ id: post.id, status: "failed", phase: 2, reason: "timeout" });
          } else {
            results.push({ id: post.id, status: "processing", phase: 2, minutes: elapsed.toFixed(0) });
          }
        }
      } catch (e: any) {
        const msg = e.message || "";
        console.error(`[Phase2] Error ${post.id}: ${msg}`);
        if (isTransientError(msg)) {
          const retries = (post.retry_count || 0) + 1;
          if (retries >= MAX_RETRIES) {
            await sb.from("scheduled_posts").update({ status: "failed", error: `Falhou após ${retries} tentativas: ${msg}`, retry_count: retries }).eq("id", post.id);
            await notifyFailure(sb, post, msg);
          } else {
            /* Keep in processing — don't reset to pending, just increment retry */
            await sb.from("scheduled_posts").update({ retry_count: retries }).eq("id", post.id);
          }
          results.push({ id: post.id, status: retries >= MAX_RETRIES ? "failed" : "retry", phase: 2 });
        } else {
          await sb.from("scheduled_posts").update({ status: "failed", error: msg }).eq("id", post.id);
          await notifyFailure(sb, post, msg);
          results.push({ id: post.id, status: "failed", phase: 2, error: msg });
        }
      }
    }

    /* ═══ PHASE 1: Process pending posts that are due ═══ */
    const startTime = Date.now();
    const WALL_LIMIT_MS = 45000; /* Stop processing if we've been running > 45s (Edge Function limit is 60s) */
    const elapsed = () => Date.now() - startTime;

    const { data: allDue, error } = await sb.from("scheduled_posts").select("*")
      .eq("status", "pending").lte("scheduled_at", now.toISOString())
      .order("scheduled_at", { ascending: true }).limit(12);

    if (error) throw new Error(`DB: ${error.message}`);
    if ((!allDue || allDue.length === 0) && results.length === 0) {
      console.log(`[Scheduler] No posts due. phase2=${processing?.length||0} recovered=${stuck?.length||0}`);
      return json({ message: "No posts due", phase2: processing?.length || 0, recovered: stuck?.length || 0 });
    }

    /* Sort: Instagram first (fast ~2s per container), then Facebook FEED (fast ~3s), then Facebook REELS (slow ~20s) */
    const igPosts = (allDue||[]).filter((p: any) => p.platform === "instagram");
    const fbImages = (allDue||[]).filter((p: any) => p.platform === "facebook" && p.media_type !== "REELS");
    const fbReels = (allDue||[]).filter((p: any) => p.platform === "facebook" && p.media_type === "REELS");
    const batch = [...igPosts.slice(0, 6), ...fbImages.slice(0, 4), ...fbReels.slice(0, 2)];
    console.log(`[Phase1] ${allDue?.length} due → batch ${batch.length} | elapsed ${elapsed()}ms`);

    for (const post of batch) {
      /* ── WATCHDOG: Stop if running too long ── */
      if (elapsed() > WALL_LIMIT_MS) {
        console.log(`[Phase1] WATCHDOG: Stopping at ${elapsed()}ms — ${results.length} processed so far`);
        break;
      }

      /* Atomically claim — one at a time */
      let claimed: any = null;
      try {
        const res = await sb.from("scheduled_posts")
          .update({ status: "publishing" }).eq("id", post.id).eq("status", "pending").select("id").single();
        claimed = res.data;
      } catch (claimErr: any) {
        console.error(`[Phase1] Claim error ${post.id}: ${claimErr.message}`);
        continue;
      }
      if (!claimed) continue;

      try {
        const urls = (post.image_urls || []) as string[];
        if (!urls.length) throw new Error("Sem mídia — adicione imagens/vídeo");

        if (post.platform === "instagram") {
          console.log(`[Phase1] Creating IG container for ${post.id} (${post.media_type})...`);
          const container = await createIGContainer(sb, post.client_id, urls, post.caption || "", post.media_type);
          /* CRITICAL: update status AND result. Do NOT use .select().single() — it causes errors in Deno */
          const { error: updErr } = await sb.from("scheduled_posts")
            .update({ status: "processing", result: container, error: null })
            .eq("id", post.id);
          if (updErr) {
            const errDetail = `code=${updErr.code}|msg=${updErr.message}|hint=${updErr.hint}|details=${updErr.details}`;
            console.error(`[Phase1] DB UPDATE FAILED for ${post.id}: ${errDetail}`);
            results.push({ id: post.id, status: "db_error", phase: 1, db_error: errDetail, type: container.type });
            /* Fallback: try status and result separately */
            await sb.from("scheduled_posts").update({ status: "processing" }).eq("id", post.id);
            await sb.from("scheduled_posts").update({ result: container }).eq("id", post.id);
          } else {
            console.log(`[Phase1] IG ${post.id} → processing (${elapsed()}ms)`);
            results.push({ id: post.id, status: "processing", phase: 1, type: container.type });
          }
        } else {
          console.log(`[Phase1] Publishing FB ${post.id} (${post.media_type})...`);
          const result = await publishFacebook(sb, post.client_id, urls, post.caption || "", post.media_type);
          await sb.from("scheduled_posts").update({ status: "published", result, published_at: new Date().toISOString() }).eq("id", post.id);
          console.log(`[Phase1] ✅ FB ${post.id} published (${elapsed()}ms)`);
          results.push({ id: post.id, status: "published", phase: 1 });
          await tryMarkDemandPublished(sb, post.demand_id);
        }
      } catch (e: any) {
        const msg = e.message || String(e);
        console.error(`[Phase1] ERROR ${post.id} (${elapsed()}ms): ${msg}`);
        if (isTransientError(msg)) {
          const retries = (post.retry_count || 0) + 1;
          if (retries >= MAX_RETRIES) {
            await sb.from("scheduled_posts").update({ status: "failed", error: `Falhou após ${retries} tentativas: ${msg}`, retry_count: retries }).eq("id", post.id);
            await notifyFailure(sb, post, msg);
          } else {
            await sb.from("scheduled_posts").update({ status: "pending", error: null, retry_count: retries }).eq("id", post.id);
          }
          results.push({ id: post.id, status: retries >= MAX_RETRIES ? "failed" : "retry", phase: 1 });
        } else {
          await sb.from("scheduled_posts").update({ status: "failed", error: msg }).eq("id", post.id);
          await notifyFailure(sb, post, msg);
          results.push({ id: post.id, status: "failed", phase: 1, error: msg });
        }
      }
    }

    console.log(`[Scheduler] Done in ${elapsed()}ms — ${results.length} processed`);
    return json({ message: `Processed ${results.length} posts`, results, recovered: stuck?.length || 0, elapsed_ms: elapsed() });
  } catch (e: any) {
    console.error("[Scheduler] Fatal:", e.message);
    return json({ error: e.message }, 500);
  }
});
