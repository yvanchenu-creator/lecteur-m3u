// Blasto TV : Worker Cloudflare (application + relais sécurisé vers le fournisseur Xtream)
// Variables à définir dans Cloudflare (Settings > Variables, en "Secret") :
//   XTREAM_HOST  ex. http://p5.siplinks.me
//   XTREAM_USER  identifiant IPTV
//   XTREAM_PASS  mot de passe IPTV
//   APP_PIN      code d'accès choisi par vous (protège votre abonnement)

const APP_HTML = __APP_HTML__;
const ICON_SVG = __ICON_SVG__, ICON_180 = __ICON_180__, ICON_512 = __ICON_512__;

const COOKIE = "m3u_pin";
let WATCH = null;            // { sid, name, title, at } : la lecture en cours
const KICKED = new Map();    // sid -> nom de la personne qui a pris la main
const API_ACTIONS = new Set([
  "", "get_live_categories", "get_live_streams", "get_vod_categories", "get_vod_streams",
  "get_series_categories", "get_series", "get_series_info", "get_vod_info", "get_short_epg",
]);

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  },
};

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/" || path === "/index.html") {
    return new Response(APP_HTML, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }
  if (path === "/manifest.webmanifest") {
    return new Response(JSON.stringify({
      name: "Blasto TV", short_name: "Blasto TV", display: "standalone",
      background_color: "#0b0b0d", theme_color: "#0b0b0d", start_url: "/",
      icons: [{ src: "/icon-180.png", sizes: "180x180", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    }), { headers: { "content-type": "application/manifest+json" } });
  }
  // Logo Blasto TV (onglet du navigateur, écran d'accueil iPhone/iPad)
  if (path === "/icon.svg") return new Response(ICON_SVG, { headers: { "content-type": "image/svg+xml", "cache-control": "max-age=86400" } });
  if (path === "/icon-180.png" || path === "/icon-512.png") {
    const b64 = path === "/icon-180.png" ? ICON_180 : ICON_512;
    return new Response(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), { headers: { "content-type": "image/png", "cache-control": "max-age=86400" } });
  }

  if (path === "/login" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!env.APP_PIN || String(body.pin || "") !== String(env.APP_PIN)) {
      return json({ ok: false }, 401);
    }
    return json({ ok: true }, 200, {
      "set-cookie": `${COOKIE}=${encodeURIComponent(await pinHash(env))}; Path=/; Max-Age=31536000; HttpOnly;${url.protocol === "https:" ? " Secure;" : ""} SameSite=Lax`,
    });
  }

  if (!(await authorized(request, env))) return json({ error: "auth" }, 401);

  // Synchronisation favoris / positions entre appareils
  // Une seule connexion autorisée par le fournisseur : on suit qui regarde
  if (path === "/watch" && request.method === "POST") {
    const b = await request.json().catch(() => ({}));
    const now = Date.now();
    const active = WATCH && now - WATCH.at < 25000 ? WATCH : null;
    if (b.op === "stop") { if (active && active.sid === b.sid) WATCH = null; return json({ ok: true }); }
    if (b.op === "beat") {
      if (active && active.sid === b.sid) { active.at = now; return json({ ok: true }); }
      if (KICKED.has(b.sid)) { const by = KICKED.get(b.sid); KICKED.delete(b.sid); return json({ kicked: true, by }); }
      if (!active) { WATCH = { sid: b.sid, name: b.name, title: b.title, at: now }; return json({ ok: true }); }
      return json({ ok: true });
    }
    // op = start
    if (active && active.sid !== b.sid && !b.force) return json({ busy: { name: active.name, title: active.title } });
    if (active && active.sid !== b.sid) KICKED.set(active.sid, b.name || "Quelqu'un");
    WATCH = { sid: b.sid, name: b.name, title: b.title, at: now };
    return json({ ok: true });
  }

  // Profils de la famille et synchronisation favoris / positions par profil
  if (path === "/profiles" || path === "/sync") {
    const db = (env.STORE && (await env.STORE.get())) || {};
    db.profiles = db.profiles || {};
    db.data = db.data || {};
    if (db.favs || db.pos) { db.legacy = { favs: db.favs || {}, pos: db.pos || {} }; delete db.favs; delete db.pos; }
    if (path === "/profiles") {
      if (request.method === "POST") {
        const b = await request.json().catch(() => ({}));
        const name = String(b.name || "").trim().slice(0, 20);
        if (!name) return json({ error: "nom" }, 400);
        const id = "p" + Date.now().toString(36);
        db.profiles[id] = { name, color: b.color || "#4f8cff", at: Date.now() };
        if (db.legacy) { db.data[id] = db.legacy; delete db.legacy; } // le premier profil récupère l'historique existant
        if (env.STORE) await env.STORE.put(db);
        return json({ id, profiles: db.profiles });
      }
      if (request.method === "DELETE") {
        const id = url.searchParams.get("id");
        delete db.profiles[id]; delete db.data[id];
        if (env.STORE) await env.STORE.put(db);
      }
      return json({ profiles: db.profiles }, 200, { "cache-control": "no-store" });
    }
    const pid = url.searchParams.get("profile") || "";
    if (!db.profiles[pid]) return json({ error: "profil" }, 404);
    const cur = db.data[pid] = db.data[pid] || { favs: {}, pos: {} };
    if (request.method === "PUT") {
      const inc = await request.json().catch(() => ({}));
      for (const part of ["favs", "pos", "prefs"]) {
        cur[part] = cur[part] || {};
        for (const [k, v] of Object.entries((inc && inc[part]) || {})) {
          if (v && typeof v === "object" && (!cur[part][k] || (v.at || 0) > (cur[part][k].at || 0))) cur[part][k] = v;
        }
      }
      if (env.STORE) await env.STORE.put(db);
    }
    return json(cur, 200, { "cache-control": "no-store" });
  }

  const host = String(env.XTREAM_HOST || "").replace(/\/+$/, "");
  const user = env.XTREAM_USER, pass = env.XTREAM_PASS;
  if (!host || !user || !pass) return json({ error: "config" }, 500);

  // Données : /api?action=...&category_id=...
  if (path === "/api") {
    const action = url.searchParams.get("action") || "";
    if (!API_ACTIONS.has(action)) return json({ error: "action" }, 400);
    const up = new URL(host + "/player_api.php");
    up.searchParams.set("username", user);
    up.searchParams.set("password", pass);
    for (const [k, v] of url.searchParams) if (k !== "username" && k !== "password") up.searchParams.set(k, v);
    let r;
    try { r = await fetch(up.toString(), { headers: { "user-agent": UA } }); }
    catch (e) { return json({ error: "fournisseur injoignable", detail: String(e && e.message || e) }, 502); }
    if (!r.ok) return json({ error: "le fournisseur a répondu " + r.status, status: r.status }, 502);
    if (action === "") {
      // Petite réponse : on retire les identifiants avant de la renvoyer
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { return json({ error: "réponse illisible du fournisseur", debut: text.slice(0, 200) }, 502); }
      if (data && data.user_info) { delete data.user_info.username; delete data.user_info.password; }
      return json(data, 200, { "cache-control": "no-store" });
    }
    // Grosses listes : transmises telles quelles, sans les décoder (limite CPU du plan gratuit)
    return new Response(r.body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }

  // Flux direct en HLS : /live/<id>.m3u8
  let m = path.match(/^\/live\/(\d+)\.m3u8$/);
  if (m) {
    return proxyPlaylist(`${host}/live/${enc(user)}/${enc(pass)}/${m[1]}.m3u8`);
  }
  // Films / épisodes : /movie/<id>.<ext>  /series/<id>.<ext>
  m = path.match(/^\/(movie|series)\/(\d+)\.([a-z0-9]{2,5})$/i);
  if (m) {
    return proxyMedia(`${host}/${m[1]}/${enc(user)}/${enc(pass)}/${m[2]}.${m[3]}`, request);
  }
  // Segments et sous-listes HLS réécrits : /seg?u=<url absolue signée>
  if (path === "/seg") {
    const target = url.searchParams.get("u") || "";
    const sig = url.searchParams.get("s") || "";
    if (sig !== (await sign(target, env))) return json({ error: "sig" }, 403);
    if (/\.m3u8(\?|$)/i.test(target)) return proxyPlaylist(target, env);
    return proxyMedia(target, request);
  }

  // Images (logos, affiches) servies en https : /img?u=<url>
  if (path === "/img") {
    const target = url.searchParams.get("u") || "";
    if (!/^https?:\/\//i.test(target)) return new Response("", { status: 400 });
    const r = await fetch(target, { headers: { "user-agent": UA }, cf: { cacheTtl: 86400, cacheEverything: true } });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) return new Response("", { status: 404 });
    return new Response(r.body, { headers: { "content-type": type, "cache-control": "public, max-age=86400" } });
  }

  return json({ error: "not found" }, 404);

  async function proxyPlaylist(target) {
    const r = await fetch(target, { headers: { "user-agent": UA }, redirect: "follow" });
    if (!r.ok) return new Response("upstream " + r.status, { status: 502 });
    const base = r.url || target;
    const text = await r.text();
    const out = [];
    for (const line of text.split(/\r?\n/)) {
      if (line && !line.startsWith("#")) {
        out.push(await segUrl(new URL(line.trim(), base).toString()));
      } else if (line.startsWith("#") && /URI="([^"]+)"/.test(line)) {
        const uri = line.match(/URI="([^"]+)"/)[1];
        const abs = new URL(uri, base).toString();
        out.push(line.replace(/URI="[^"]+"/, `URI="${await segUrl(abs)}"`));
      } else out.push(line);
    }
    return new Response(out.join("\n"), {
      headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
    });
  }

  async function segUrl(abs) {
    return `/seg?u=${encodeURIComponent(abs)}&s=${await sign(abs, env)}`;
  }
}

async function proxyMedia(target, request) {
  const headers = { "user-agent": UA };
  const range = request.headers.get("range");
  if (range) headers.range = range;
  const r = await fetch(target, { headers, redirect: "follow" });
  const h = new Headers();
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const v = r.headers.get(k);
    if (v) h.set(k, v);
  }
  if (!h.has("accept-ranges")) h.set("accept-ranges", "bytes");
  if (/\.mp4(\?|$)/i.test(target) && !/mp4/.test(h.get("content-type") || "")) h.set("content-type", "video/mp4");
  h.set("cache-control", "no-store");
  return new Response(r.body, { status: r.status, headers: h });
}

const UA = "Mozilla/5.0 (Linux; Android 11) LecteurM3U/1.0";
const enc = encodeURIComponent;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function pinHash(env) { return hmac(String(env.XTREAM_PASS) + "|pin", String(env.APP_PIN)); }
async function sign(u, env) { return (await hmac(String(env.XTREAM_PASS) + "|seg|" + String(env.APP_PIN), u)).slice(0, 24); }

async function authorized(request, env) {
  if (!env.APP_PIN) return false;
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return !!m && decodeURIComponent(m[1]) === (await pinHash(env));
}
