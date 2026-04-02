import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { headers: { ...H, "Content-Type": "application/json" }, status: s });

async function waitReady(id: string, token: string, isVideo = false) {
  const maxAttempts = isVideo ? 60 : 15;
  const baseDelay = isVideo ? 2000 : 300;
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetch(`https://graph.facebook.com/v21.0/${id}?fields=status_code&access_token=${token}`);
    const d = await r.json();
    if (d.status_code === "FINISHED") return;
    if (d.status_code === "ERROR") throw new Error("Instagram processing error: " + (d.status || "unknown"));
    await new Promise(r => setTimeout(r, i < 3 ? baseDelay : (isVideo ? 3000 : 500)));
  }
  throw new Error("Instagram processing timeout — video may still be processing");
}

async function proxyToR2IfNeeded(fileUrl: string, sb: any): Promise<string> {
  if (fileUrl.includes("r2.dev") || fileUrl.includes("r2.cloudflarestorage")) return fileUrl;
  if (fileUrl.includes("supabase.co/storage")) {
    try {
      const filename = fileUrl.split("/").pop() || `file_${Date.now()}`;
      const ext = filename.split(".").pop()?.toLowerCase() || "bin";
      const ct = ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "application/octet-stream";
      const r2Res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/r2-upload`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: filename, contentType: ct, sourceUrl: fileUrl }),
      });
      const r2Data = await r2Res.json();
      if (r2Data.publicUrl) {
        console.log(`[R2 Proxy] ${filename} → ${r2Data.publicUrl}`);
        return r2Data.publicUrl;
      }
      console.warn("[R2 Proxy] Failed, using original URL:", r2Data.error);
    } catch (e) { console.warn("[R2 Proxy] Error:", (e as Error).message); }
  }
  return fileUrl;
}

async function publishInstagram(sb: any, clientId: string, urls: string[], caption: string, mediaType: string) {
  let uid = "", at = "";
  const { data: s } = await sb.from("app_settings").select("value").eq("key", `ig_token_${clientId}`).single();
  if (s?.value) {
    try { const tk = JSON.parse(s.value); if (tk.ig_user_id && tk.access_token) { uid = tk.ig_user_id; at = tk.access_token; } } catch {}
  }
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
  const type = (mediaType || "FEED").toUpperCase();
  const carousel = urls.length > 1 && type !== "STORIES" && type !== "REELS";

  /* ── FIX: Proxy ALL URLs through R2 (not just for REELS) ── */
  const proxiedUrls = await Promise.all(urls.map(u => proxyToR2IfNeeded(u, sb)));
  console.log(`[IG] Proxied ${proxiedUrls.length} URLs for ${type}`);

  let cid: string;
  if (type === "REELS") {
    const videoUrl = proxiedUrls[0];
    const coverUrl = proxiedUrls.length > 1 && proxiedUrls[1] ? proxiedUrls[1] : null;
    const p = new URLSearchParams({ access_token: at, video_url: videoUrl, media_type: "REELS" });
    if (caption) p.append("caption", caption);
    if (coverUrl) p.append("cover_url", coverUrl);
    console.log(`[IG Reels] Creating container with video: ${videoUrl.substring(0, 80)}`);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  } else if (carousel) {
    const kids = await Promise.all(proxiedUrls.map(async (url: string) => {
      const p = new URLSearchParams({ access_token: at, image_url: url, is_carousel_item: "true" });
      const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      return d.id as string;
    }));
    await Promise.all(kids.map(id => waitReady(id, at)));
    const p = new URLSearchParams({ access_token: at, media_type: "CAROUSEL", children: kids.join(",") });
    if (caption) p.append("caption", caption);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  } else {
    /* FEED or STORIES — use proxied URL */
    const p = new URLSearchParams({ access_token: at, image_url: proxiedUrls[0] });
    if (type === "STORIES") p.append("media_type", "STORIES");
    if (caption && type !== "STORIES") p.append("caption", caption);
    const r = await fetch(`https://graph.facebook.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    console.log(`[IG ${type}] Container response:`, JSON.stringify(d).substring(0, 200));
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  }
  await waitReady(cid, at, type === "REELS");
  const pp = new URLSearchParams({ access_token: at, creation_id: cid });
  const pr = await fetch(`https://graph.facebook.com/v21.0/${uid}/media_publish`, { method: "POST", body: pp });
  const pd = await pr.json();
  if (pd.error) throw new Error(pd.error.message);
  return { success: true, media_id: pd.id, media_type: carousel ? "CAROUSEL" : type };
}

async function publishFacebook(sb: any, clientId: string, imageUrls: string[], caption: string, mediaType?: string) {
  let pageToken: string | null = null;
  let pageId: string | null = null;
  const { data: s1 } = await sb.from("app_settings").select("value").eq("key", `client_socials_${clientId}`).single();
  if (s1?.value) {
    try { const socials = JSON.parse(s1.value); const fb = socials.facebook; if (fb?.oauth?.page_token && fb?.oauth?.page_id) { pageToken = fb.oauth.page_token; pageId = fb.oauth.page_id; } } catch {}
  }
  if (!pageToken || !pageId) {
    const { data: s2 } = await sb.from("app_settings").select("value").eq("key", `meta_token_${clientId}`).single();
    if (s2?.value) { try { const tk = JSON.parse(s2.value); if (tk.page_token && tk.page_id) { pageToken = tk.page_token; pageId = tk.page_id; } } catch {} }
  }
  if (!pageToken || !pageId) throw new Error("Token Facebook não encontrado");
  const type = (mediaType || "FEED").toUpperCase();

  /* Proxy ALL URLs through R2 for reliable access */
  const proxiedUrls = await Promise.all(imageUrls.map(u => proxyToR2IfNeeded(u, sb)));

  if (type === "REELS") {
    const videoUrl = proxiedUrls[0];
    if (!videoUrl) throw new Error("No video URL for Reels");
    const initParams = new URLSearchParams({ upload_phase: "start", access_token: pageToken });
    const initRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: initParams });
    const initData = await initRes.json();
    if (initData.error) throw new Error(initData.error.message);
    const videoId = initData.video_id;
    const uploadUrl = initData.upload_url;
    console.log(`[FB Reels Sched] Streaming video...`);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new Error(`Download failed: ${videoRes.status}`);
    const fileSize = videoRes.headers.get("content-length") || "0";
    await fetch(uploadUrl, { method: "POST", headers: { "Authorization": `OAuth ${pageToken}`, "offset": "0", "file_size": fileSize, "Content-Type": "application/octet-stream" }, body: videoRes.body });
    const finishParams = new URLSearchParams({ upload_phase: "finish", access_token: pageToken, video_id: videoId });
    if (caption) finishParams.append("description", caption);
    if (proxiedUrls.length > 1 && proxiedUrls[1]) finishParams.append("thumb", proxiedUrls[1]);
    const finishRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/video_reels`, { method: "POST", body: finishParams });
    const finishData = await finishRes.json();
    if (finishData.error) throw new Error(finishData.error.message);
    await fetch(`https://graph.facebook.com/v21.0/${videoId}`, { method: "POST", body: new URLSearchParams({ access_token: pageToken, published: "true" }) });
    return { success: true, media_id: videoId };
  }
  /* FEED photo */
  const params = new URLSearchParams({ access_token: pageToken, message: caption || "", url: proxiedUrls[0] || "" });
  const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, { method: "POST", body: params });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return { success: true, media_id: d.id || d.post_id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const now = new Date();
    const nowISO = now.toISOString();

    /* ── FIX 1: Recover stuck "publishing" posts (>5 min) ── */
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: stuck } = await sb.from("scheduled_posts").select("id").eq("status", "publishing").lte("created_at", fiveMinAgo);
    if (stuck && stuck.length > 0) {
      console.log(`[Scheduler] Recovering ${stuck.length} stuck "publishing" posts`);
      for (const s of stuck) {
        await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("id", s.id);
      }
    }

    /* ── FIX 2: Auto-recover "failed" posts with R2-fixable errors ── */
    const { data: r2Fixable } = await sb.from("scheduled_posts").select("id,demand_id")
      .eq("status", "failed").ilike("error", "%Only photo or video%");
    if (r2Fixable && r2Fixable.length > 0) {
      console.log(`[Scheduler] Recovering ${r2Fixable.length} failed posts (R2 proxy fix)`);
      for (const f of r2Fixable) {
        await sb.from("scheduled_posts").update({ status: "pending", error: null }).eq("id", f.id);
        /* Reset demand back to scheduled if it was prematurely marked published */
        if (f.demand_id) {
          const { data: dem } = await sb.from("demands").select("stage").eq("id", f.demand_id).single();
          if (dem?.stage === "published") {
            await sb.from("demands").update({ stage: "scheduled" }).eq("id", f.demand_id);
            console.log(`[Scheduler] Reset demand ${f.demand_id} from published → scheduled`);
          }
        }
      }
    }

    /* Find posts that are due */
    const { data: posts, error } = await sb
      .from("scheduled_posts").select("*").eq("status", "pending")
      .lte("scheduled_at", nowISO).order("scheduled_at", { ascending: true }).limit(3);

    if (error) throw new Error(`DB error: ${error.message}`);
    if (!posts || posts.length === 0) return json({ message: "No posts due", count: 0, recovered: stuck?.length || 0 });

    console.log(`[Scheduler] Found ${posts.length} posts to publish`);
    const results = [];

    for (const post of posts) {
      const { data: updated, error: upErr } = await sb
        .from("scheduled_posts").update({ status: "publishing" })
        .eq("id", post.id).eq("status", "pending").select("id").single();
      if (upErr || !updated) { console.log(`[Scheduler] Post ${post.id} already picked up, skipping`); continue; }

      try {
        const urls = (post.image_urls || []) as string[];
        let result;
        if (post.platform === "instagram") {
          result = await publishInstagram(sb, post.client_id, urls, post.caption || "", post.media_type);
        } else {
          result = await publishFacebook(sb, post.client_id, urls, post.caption || "", post.media_type);
        }
        await sb.from("scheduled_posts").update({ status: "published", result, published_at: new Date().toISOString() }).eq("id", post.id);
        console.log(`[Scheduler] Published post ${post.id} on ${post.platform}`);
        results.push({ id: post.id, demand_id: post.demand_id, status: "published" });

        /* ── FIX 2: Only mark demand "published" when ALL posts for this demand are done ── */
        if (post.demand_id) {
          const { data: siblings } = await sb.from("scheduled_posts").select("id,status")
            .eq("demand_id", post.demand_id);
          const allDone = (siblings || []).every(s => s.status === "published");
          if (allDone) {
            await sb.from("demands").update({ stage: "published" }).eq("id", post.demand_id);
            console.log(`[Scheduler] ALL posts for demand ${post.demand_id} published → demand marked published`);
          } else {
            console.log(`[Scheduler] Demand ${post.demand_id} has pending siblings, NOT marking published yet`);
          }
        }
      } catch (e: any) {
        console.error(`[Scheduler] Failed post ${post.id}:`, e.message);
        const isTransient = e.message?.includes("processing error") || e.message?.includes("timeout") || e.message?.includes("transient");
        const alreadyRetried = (post.error || "").includes("Retry");
        if (isTransient && !alreadyRetried) {
          const retryAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
          await sb.from("scheduled_posts").update({ status: "pending", error: `Retry: ${e.message}`, scheduled_at: retryAt }).eq("id", post.id);
          console.log(`[Scheduler] Auto-retry for post ${post.id}`);
          results.push({ id: post.id, status: "retry" });
        } else {
          await sb.from("scheduled_posts").update({ status: "failed", error: e.message }).eq("id", post.id);
          results.push({ id: post.id, status: "failed", error: e.message });
          /* Notify admins */
          try {
            let clientName = post.client_id;
            const { data: cl } = await sb.from("clients").select("name").eq("id", post.client_id).single();
            if (cl?.name) clientName = cl.name;
            const platform = post.platform === "instagram" ? "Instagram" : "Facebook";
            const errorMsg = (e.message || "Erro desconhecido").substring(0, 120);
            const { data: teamUsers } = await sb.from("profiles").select("id, role").in("role", ["admin", "owner", "manager"]);
            for (const u of (teamUsers || [])) {
              await sb.from("notifications").insert({ user_id: u.id, type: "publish_failed", title: `❌ Falha — ${clientName} (${platform})`, body: `Erro: ${errorMsg}`, read: false });
            }
          } catch (notifErr) { console.error("[Scheduler] Notification error:", notifErr); }
        }
      }
    }
    return json({ message: `Processed ${results.length} posts`, results, recovered: stuck?.length || 0 });
  } catch (e: any) {
    console.error("[Scheduler] Error:", e.message);
    return json({ error: e.message }, 500);
  }
});
