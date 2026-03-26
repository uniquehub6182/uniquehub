import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { headers: { ...H, "Content-Type": "application/json" }, status: s });

async function waitReady(id: string, token: string) {
  for (let i = 0; i < 15; i++) {
    const r = await fetch(`https://graph.instagram.com/v21.0/${id}?fields=status_code&access_token=${token}`);
    const d = await r.json();
    if (d.status_code === "FINISHED") return;
    if (d.status_code === "ERROR") throw new Error("Instagram processing error");
    await new Promise(r => setTimeout(r, i < 3 ? 300 : 500));
  }
}

async function publishInstagram(sb: any, clientId: string, urls: string[], caption: string, mediaType: string) {
  const { data: s } = await sb.from("app_settings").select("value").eq("key", `ig_token_${clientId}`).single();
  if (!s?.value) throw new Error("Instagram não conectado");
  const tk = JSON.parse(s.value);
  if (!tk.ig_user_id || !tk.access_token) throw new Error("Token inválido");
  const uid = tk.ig_user_id, at = tk.access_token;
  const type = (mediaType || "FEED").toUpperCase();
  const carousel = urls.length > 1 && type !== "STORIES";

  let cid: string;
  if (carousel) {
    const kids = await Promise.all(urls.map(async (url: string) => {
      const p = new URLSearchParams({ access_token: at, image_url: url, is_carousel_item: "true" });
      const r = await fetch(`https://graph.instagram.com/v21.0/${uid}/media`, { method: "POST", body: p });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      return d.id as string;
    }));
    await Promise.all(kids.map(id => waitReady(id, at)));
    const p = new URLSearchParams({ access_token: at, media_type: "CAROUSEL", children: kids.join(",") });
    if (caption) p.append("caption", caption);
    const r = await fetch(`https://graph.instagram.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  } else {
    const p = new URLSearchParams({ access_token: at, image_url: urls[0] });
    if (type === "STORIES") p.append("media_type", "STORIES");
    if (caption && type !== "STORIES") p.append("caption", caption);
    const r = await fetch(`https://graph.instagram.com/v21.0/${uid}/media`, { method: "POST", body: p });
    const d = await r.json();
    if (d.error) throw new Error(d.error.message);
    cid = d.id;
  }

  await waitReady(cid, at);
  const pp = new URLSearchParams({ access_token: at, creation_id: cid });
  const pr = await fetch(`https://graph.instagram.com/v21.0/${uid}/media_publish`, { method: "POST", body: pp });
  const pd = await pr.json();
  if (pd.error) throw new Error(pd.error.message);
  return { success: true, media_id: pd.id, media_type: carousel ? "CAROUSEL" : type };
}

async function publishFacebook(sb: any, clientId: string, imageUrl: string, caption: string) {
  /* Try client_socials first, then fall back to meta_token */
  let pageToken: string | null = null;
  let pageId: string | null = null;

  const { data: s1 } = await sb.from("app_settings").select("value").eq("key", `client_socials_${clientId}`).single();
  if (s1?.value) {
    try {
      const socials = JSON.parse(s1.value);
      const fb = socials.facebook;
      if (fb?.oauth?.page_token && fb?.oauth?.page_id) {
        pageToken = fb.oauth.page_token;
        pageId = fb.oauth.page_id;
      }
    } catch { /* ignore parse errors */ }
  }

  /* Fallback: try meta_token_${clientId} */
  if (!pageToken || !pageId) {
    const { data: s2 } = await sb.from("app_settings").select("value").eq("key", `meta_token_${clientId}`).single();
    if (s2?.value) {
      try {
        const tk = JSON.parse(s2.value);
        if (tk.page_token && tk.page_id) {
          pageToken = tk.page_token;
          pageId = tk.page_id;
        }
      } catch { /* ignore */ }
    }
  }

  if (!pageToken || !pageId) throw new Error("Token Facebook não encontrado");

  const params = new URLSearchParams({ access_token: pageToken, message: caption || "", url: imageUrl });
  const r = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, { method: "POST", body: params });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return { success: true, media_id: d.id || d.post_id };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    // Find posts that are due (scheduled_at <= now AND status = pending)
    const now = new Date().toISOString();
    const { data: posts, error } = await sb
      .from("scheduled_posts")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(10);

    if (error) throw new Error(`DB error: ${error.message}`);
    if (!posts || posts.length === 0) return json({ message: "No posts due", count: 0 });

    console.log(`[Scheduler] Found ${posts.length} posts to publish`);
    const results = [];

    for (const post of posts) {
      // Atomically mark as publishing — only if still pending (prevents duplicates from concurrent calls)
      const { data: updated, error: upErr } = await sb
        .from("scheduled_posts")
        .update({ status: "publishing" })
        .eq("id", post.id)
        .eq("status", "pending")
        .select("id")
        .single();
      
      if (upErr || !updated) {
        console.log(`[Scheduler] Post ${post.id} already picked up by another call, skipping`);
        continue;
      }
      
      try {
        const urls = (post.image_urls || []) as string[];
        let result;

        if (post.platform === "instagram") {
          result = await publishInstagram(sb, post.client_id, urls, post.caption || "", post.media_type);
        } else {
          result = await publishFacebook(sb, post.client_id, urls[0], post.caption || "");
        }

        // Mark as published
        await sb.from("scheduled_posts").update({
          status: "published",
          result: result,
          published_at: new Date().toISOString(),
        }).eq("id", post.id);

        // Move demand from "scheduled" to "published" if demand_id exists
        if (post.demand_id) {
          await sb.from("demands").update({ stage: "published" }).eq("id", post.demand_id);
          console.log(`[Scheduler] Moved demand ${post.demand_id} to published`);
        }

        console.log(`[Scheduler] Published post ${post.id} on ${post.platform}`);
        results.push({ id: post.id, status: "published" });
      } catch (e: any) {
        console.error(`[Scheduler] Failed post ${post.id}:`, e.message);
        await sb.from("scheduled_posts").update({
          status: "failed",
          error: e.message,
        }).eq("id", post.id);
        results.push({ id: post.id, status: "failed", error: e.message });
      }
    }

    return json({ message: `Processed ${results.length} posts`, results });
  } catch (e: any) {
    console.error("[Scheduler] Error:", e.message);
    return json({ error: e.message }, 500);
  }
});
