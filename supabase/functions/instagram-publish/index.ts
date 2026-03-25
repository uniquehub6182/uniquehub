import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const H = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS" };
const json = (d: unknown, s=200) => new Response(JSON.stringify(d), { headers:{...H,"Content-Type":"application/json"}, status:s });

async function waitReady(id: string, token: string) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`https://graph.instagram.com/v21.0/${id}?fields=status_code&access_token=${token}`);
    const d = await r.json();
    if (d.status_code === "FINISHED") return;
    if (d.status_code === "ERROR") throw new Error("Instagram processing error: " + JSON.stringify(d));
    await new Promise(r => setTimeout(r, i < 5 ? 1000 : 2000));
  }
  throw new Error("Media processing timeout");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  try {
    const body = await req.json();
    const { client_id, caption, media_type, cover_url } = body;
    const urls: string[] = body.image_urls || (body.image_url ? [body.image_url] : []);
    if (!client_id || !urls.length) throw new Error("Missing client_id or media URLs");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: s } = await sb.from("app_settings").select("value").eq("key", `ig_token_${client_id}`).single();
    if (!s?.value) throw new Error("Instagram não conectado");
    const tk = JSON.parse(s.value);
    if (!tk.ig_user_id || !tk.access_token) throw new Error("Token inválido");
    const uid = tk.ig_user_id, at = tk.access_token;
    const type = (media_type || "FEED").toUpperCase();
    const carousel = urls.length > 1 && type !== "STORIES" && type !== "REELS";
    let cid: string;

    if (type === "REELS") {
      /* ── REELS: video_url required, optional cover_url ── */
      const p = new URLSearchParams({ access_token: at, media_type: "REELS", video_url: urls[0] });
      if (caption) p.append("caption", caption);
      if (cover_url) p.append("cover_url", cover_url);
      if (body.share_to_feed !== false) p.append("share_to_feed", "true");
      const r = await fetch(`https://graph.instagram.com/v21.0/${uid}/media`, { method: "POST", body: p });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message);
      cid = d.id;
    } else if (carousel) {
      /* ── CAROUSEL ── */
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
    } else if (type === "STORIES") {
      /* ── STORIES: each image is a separate story ── */
      const results: string[] = [];
      for (const url of urls) {
        const p = new URLSearchParams({ access_token: at, image_url: url, media_type: "STORIES" });
        const r = await fetch(`https://graph.instagram.com/v21.0/${uid}/media`, { method: "POST", body: p });
        const d = await r.json();
        if (d.error) throw new Error(d.error.message);
        const storyId = d.id;
        await waitReady(storyId, at);
        const pp = new URLSearchParams({ access_token: at, creation_id: storyId });
        const pr = await fetch(`https://graph.instagram.com/v21.0/${uid}/media_publish`, { method: "POST", body: pp });
        const pd = await pr.json();
        if (pd.error) throw new Error(pd.error.message);
        results.push(pd.id);
      }
      return json({ success: true, media_id: results[0], post_ids: results, media_type: "STORIES", count: results.length, message: `${results.length} Storie${results.length > 1 ? "s" : ""} publicado${results.length > 1 ? "s" : ""}!` });
    } else {
      /* ── FEED ── */
      const p = new URLSearchParams({ access_token: at, image_url: urls[0] });
      if (caption) p.append("caption", caption);
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
    const label = type === "REELS" ? "Reels" : carousel ? "Carrossel" : type === "STORIES" ? "Story" : "Post";
    return json({ success: true, media_id: pd.id, post_id: pd.id, media_type: carousel ? "CAROUSEL" : type, message: `${label} publicado!` });
  } catch (e: any) { return json({ error: e.message }, 400); }
});
