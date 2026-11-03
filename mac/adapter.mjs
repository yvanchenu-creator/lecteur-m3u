// ---- Serveur pour Mac : fait tourner le lecteur sur votre connexion internet ----
import http from "node:http";
import os from "node:os";
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync, statSync, createReadStream } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto; // Node 18 (Ubuntu 24.04)
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DIR = dirname(fileURLToPath(import.meta.url));
const CONF = join(DIR, "config.json");
const DATA = join(DIR, "donnees.json");
if (!existsSync(CONF)) {
  writeFileSync(CONF, JSON.stringify({ XTREAM_HOST: "http://p5.siplinks.me", XTREAM_USER: "", XTREAM_PASS: "", APP_PIN: "", PORT: 8080 }, null, 2));
  console.log("\n>> Fichier config.json créé. Ouvrez-le, remplissez vos identifiants et votre code, puis relancez.\n");
  process.exit(0);
}
const env = JSON.parse(readFileSync(CONF, "utf8"));
for (const k of ["XTREAM_HOST", "XTREAM_USER", "XTREAM_PASS", "APP_PIN"]) {
  if (!env[k]) { console.log(`\n>> Il manque ${k} dans config.json.\n`); process.exit(1); }
}
env.STORE = {
  async get() { try { return JSON.parse(readFileSync(DATA, "utf8")); } catch { return null; } },
  async put(v) { writeFileSync(DATA + ".tmp", JSON.stringify(v)); renameSync(DATA + ".tmp", DATA); },
};
const port = Number(env.PORT) || 8080;

// ---------- Conversion des films mkv/avi pour Safari (ffmpeg, sans perte, à la volée) ----------
let FFMPEG = null;
function findFfmpeg() {
  const cands = [env.FFMPEG, "/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"];
  try { cands.push(createRequire(join(DIR, "x.js"))("ffmpeg-static")); } catch {}
  for (const c of cands) if (c && existsSync(c)) return c;
  try {
    if (process.platform === "win32") return execFileSync("where", ["ffmpeg"]).toString().split(/\r?\n/)[0].trim() || null;
    return execFileSync("/bin/sh", ["-c", "command -v ffmpeg"]).toString().trim() || null;
  } catch { return null; }
}
FFMPEG = findFfmpeg();
if (!FFMPEG) {
  console.log("  Installation de l'outil de conversion vidéo (une seule fois, ~1 minute)…");
  const win = process.platform === "win32";
  const npm = join(dirname(process.execPath), win ? "npm.cmd" : "npm");
  const p = spawn(existsSync(npm) ? `"${npm}"` : "npm", ["install", "--prefix", `"${DIR}"`, "--no-audit", "--no-fund", "ffmpeg-static"], { stdio: "ignore", shell: true });
  p.on("exit", () => { FFMPEG = findFfmpeg(); console.log(FFMPEG ? "  Outil de conversion vidéo prêt." : "  Échec de l'installation de l'outil de conversion (les .mkv ne marcheront pas dans Safari)."); });
  p.on("error", () => {});
}

// Empêche la mise en veille automatique du Mac tant que le lecteur tourne
if (process.platform === "darwin") { try { spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" }).unref(); } catch {} }

const TMP = join(os.tmpdir(), "lecteur-m3u");
try { rmSync(TMP, { recursive: true, force: true }); } catch {}
const SESS = new Map(); // clé -> { dir, proc, last, done }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function probe(url) {
  return new Promise((resolve) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-nostdin", "-user_agent", UA, "-i", url], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    const t = setTimeout(() => p.kill("SIGKILL"), 20000);
    p.on("close", () => { clearTimeout(t); const m = err.match(/Video: (\w+)/); resolve(m ? m[1] : ""); });
  });
}

// Relais local : ffmpeg ne parle jamais directement au fournisseur, qui n'autorise qu'une connexion.
// Quand ffmpeg saute dans le film (nouvelle requête), l'ancienne connexion est coupée avant d'ouvrir la suivante.
const UPS = new Map(); // id -> { url, ac }
const UPS_ORIG = new Map();
let upSeq = 0;
function relayOpen(upstream) { const id = String(++upSeq); UPS.set(id, { url: upstream, ac: null }); UPS_ORIG.set(id, upstream); if (UPS_ORIG.size > 50) UPS_ORIG.delete(UPS_ORIG.keys().next().value); return id; }
function relayClose(id) { const u = UPS.get(id); if (!u) return; UPS.delete(id); try { u.ac && u.ac.abort(); } catch {} }
async function handleUp(req, res, id) {
  const u = UPS.get(id);
  if (!u) { res.writeHead(404); return res.end(); }
  if (u.ac) u.ac.abort();
  const ac = new AbortController(); u.ac = ac;
  res.on("close", () => { ac.abort(); if (u.ac === ac) u.ac = null; });
  const headers = { "user-agent": UA };
  if (req.headers.range) headers.range = req.headers.range;
  let r = null;
  for (let i = 0; i < 8 && !ac.signal.aborted; i++) {
    try { r = await fetch(u.url, { headers, signal: ac.signal, redirect: "follow" }); } catch { r = null; }
    if (r && r.status < 400) break;
    if (r) { try { await r.body?.cancel(); } catch {} }
    await wait(1000); // le fournisseur met parfois un instant à libérer la connexion précédente
  }
  if (ac.signal.aborted) return res.destroy();
  if (!r || r.status >= 400) { console.log(`  Fournisseur : film refusé (code ${r ? r.status : "aucune réponse"})`); res.writeHead(r ? r.status : 502); return res.end(); }
  const h = {};
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) { const v = r.headers.get(k); if (v) h[k] = v; }
  res.writeHead(r.status, h);
  Readable.fromWeb(r.body).on("error", () => res.destroy()).pipe(res);
}

// Listes du fournisseur gardées en mémoire : l'app s'ouvre tout de suite, les listes sont rafraîchies en arrière-plan
const LISTS = new Set(["get_live_categories", "get_live_streams", "get_vod_categories", "get_vod_streams", "get_series_categories", "get_series"]);
const APIC = new Map(); // requête -> { at, raw, gz, loading }
async function apiLoad(key, headers) {
  const c = APIC.get(key) || {};
  if (c.loading) return c.loading;
  c.loading = (async () => {
    try {
      const r = await WORKER.fetch(new Request("http://localhost" + key, { headers }), env);
      if (r.status !== 200) return c.raw ? c : { status: r.status, body: Buffer.from(await r.arrayBuffer()) };
      const raw = Buffer.from(await r.arrayBuffer());
      Object.assign(c, { at: Date.now(), raw, gz: gzipSync(raw), headers });
      APIC.set(key, c);
      return c;
    } finally { c.loading = null; }
  })();
  APIC.set(key, c);
  return c.loading;
}
setInterval(() => { for (const [k, c] of APIC) if (c.raw && Date.now() - c.at > 25 * 60000) apiLoad(k, c.headers).catch(() => {}); }, 5 * 60000).unref();

const hide = (t) => t.split(String(env.XTREAM_PASS)).join("***").split(String(env.XTREAM_USER)).join("***");
async function startSession(key, upstream, start, retry = 0, hint = {}) {
  // Une seule connexion autorisée par le fournisseur : on arrête toute autre conversion
  for (const k of [...SESS.keys()]) if (k !== key) stopSession(k);
  const dir = join(TMP, key.replace(/[^\w.-]/g, "_") + "-" + Date.now().toString(36)); // dossier neuf : sous Windows l'ancien peut rester verrouillé un instant
  mkdirSync(dir, { recursive: true });
  const up = relayOpen(upstream);
  upstream = `http://127.0.0.1:${port}/_up/${up}`;
  const sess = { dir, proc: null, last: Date.now(), t0: Date.now(), done: false, failed: false, up };
  SESS.set(key, sess);
  if (!retry && hint.direct) await wait(1500); // laisse le temps à la tentative directe de libérer la connexion
  // Le codec annoncé par le fournisseur évite une analyse préalable (une connexion et plusieurs secondes de gagnées)
  const vcodec = /^(h264|hevc)$/.test(hint.vc || "") ? hint.vc : await probe(upstream);
  const v = vcodec === "h264" ? ["-c:v", "copy"]
    : vcodec === "hevc" ? ["-c:v", "copy", "-tag:v", "hvc1"]
    : ["-c:v", "h264_videotoolbox", "-b:v", "6M"];
  const args = ["-hide_banner", "-nostdin", "-loglevel", "error",
    "-user_agent", UA, "-reconnect", "1", "-reconnect_on_network_error", "1", "-reconnect_delay_max", "10", ...(start > 0 ? [...(v[1] === "copy" ? ["-noaccurate_seek"] : []), "-ss", String(start)] : []), "-i", upstream,
    "-map", "0:v:0", "-map", "0:a:0?", ...v, "-c:a", "aac", "-b:a", "192k", "-ac", "2",
    "-avoid_negative_ts", "make_zero", "-max_muxing_queue_size", "4096",
    "-f", "hls", "-hls_time", "4", "-hls_init_time", "1", "-hls_list_size", "0", "-hls_playlist_type", "event",
    "-hls_segment_type", "fmp4", "-hls_flags", "temp_file", "-hls_fmp4_init_filename", "init.mp4",
    "-hls_segment_filename", "seg%05d.m4s", "index.m3u8"]; // chemins relatifs : sous Windows, ffmpeg plaçait init.mp4 ailleurs
  const proc = spawn(FFMPEG, args, { cwd: dir, stdio: ["ignore", "ignore", "pipe"] });
  sess.proc = proc;
  proc.stderr.on("data", (d) => { sess.log = hide(String(d)).slice(0, 300); });
  console.log(`  Conversion de ${key} (vidéo ${vcodec || "inconnue"}) à partir de ${start}s`);
  proc.on("close", (code) => {
    if (code && !retry && SESS.get(key) === sess && !existsSync(join(dir, "index.m3u8"))) {
      console.log(`  Conversion ${key} refusée par le fournisseur, nouvel essai dans 4 s…`);
      SESS.delete(key);
      relayClose(up);
      return setTimeout(() => { startSession(key, UPS_ORIG.get(up) || upstream, start, 1, hint).then((s2) => { sess.next = s2; }); }, 4000);
    }
    if (code) console.log(`  Conversion ${key} arrêtée (code ${code}) ${sess.log || ""}`); sess.done = true; if (code) sess.failed = !existsSync(join(dir, "index.m3u8")); });
  return sess;
}
function stopSession(key) {
  const s = SESS.get(key);
  if (!s) return;
  SESS.delete(key);
  try { s.proc && s.proc.kill("SIGKILL"); } catch {}
  relayClose(s.up);
  // Sous Windows, les fichiers restent verrouillés tant que ffmpeg n'est pas complètement arrêté : on efface après
  const rm = () => { try { rmSync(s.dir, { recursive: true, force: true }); } catch {} };
  if (s.proc && s.proc.exitCode === null) { s.proc.once("close", () => setTimeout(rm, 500)); setTimeout(rm, 5000); } else rm();
}
setInterval(() => { for (const [k, s] of SESS) if (Date.now() - s.last > 120000) stopSession(k); }, 30000).unref();

async function handleVod(req, res, path, query) {
  const m = path.match(/^\/vod\/(movie|series)\/(\d+)\.([a-z0-9]{2,5})\/(\d+)\/([\w.]+)$/i);
  if (!m || !FFMPEG) { res.writeHead(404); return res.end(); }
  const [, type, id, ext, start, file] = m;
  const key = `${type}-${id}-${start}`;
  let sess = SESS.get(key);
  // Nouveau lancement du même film (plus de demande depuis 15 s) : on repart d'une conversion neuve
  if (sess && file === "index.m3u8" && Date.now() - sess.last > 15000) { console.log(`  Nouveau lancement de ${key} : conversion relancée`); stopSession(key); sess = null; }
  if (!sess) {
    if (file !== "index.m3u8") { res.writeHead(404); return res.end(); }
    const host = String(env.XTREAM_HOST).replace(/\/+$/, "");
    sess = await startSession(key, `${host}/${type}/${encodeURIComponent(env.XTREAM_USER)}/${encodeURIComponent(env.XTREAM_PASS)}/${id}.${ext}`, Number(start), 0, { vc: query.get("vc"), direct: query.get("d") === "1" });
  }
  sess.last = Date.now();
  const fp = join(sess.dir, file);
  // Attend que ffmpeg ait produit le fichier demandé
  for (let i = 0; i < 250; i++) {
    if (file === "index.m3u8" ? existsSync(fp) && /#EXTINF/.test(readFileSync(fp, "utf8")) : existsSync(fp) && statSync(fp).size > 0) break;
    if (sess.done && !existsSync(fp)) break;
    await wait(200);
  }
  if (!existsSync(fp)) { console.log(`  ${new Date().toLocaleTimeString()} ${file} pas prêt pour ${key} ${sess.log || "(ffmpeg ne dit rien)"}`); res.writeHead(sess.failed ? 502 : 404); return res.end(sess.log || ""); }
  if (file === "index.m3u8") {
    if (!sess.ready) { sess.ready = true; console.log(`  Film prêt en ${((Date.now() - sess.t0) / 1000).toFixed(1)} s`); }
    res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" });
    return res.end(readFileSync(fp));
  }
  res.writeHead(200, { "content-type": file.endsWith(".mp4") || file.endsWith(".m4s") ? "video/mp4" : "application/octet-stream", "cache-control": "no-store" });
  createReadStream(fp).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : v;
    const path = req.url.split("?")[0];
    if (path.startsWith("/_up/")) {
      const ra = req.socket.remoteAddress || "";
      if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(ra)) { res.writeHead(403); return res.end(); }
      return await handleUp(req, res, path.slice(5));
    }
    // App TV à installer depuis la TV (app « Downloader ») : http://<adresse>:8080/tv.apk
    if (path === "/tv.apk") {
      const apk = ["lecteur-tv.apk", "app-debug.apk"].map((f) => join(DIR, f)).find((f) => existsSync(f));
      if (!apk) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); return res.end("Placez lecteur-tv.apk à côté de serveur.mjs"); }
      res.writeHead(200, { "content-type": "application/vnd.android.package-archive", "content-length": statSync(apk).size });
      return createReadStream(apk).pipe(res);
    }
    if (path === "/caps" || path.startsWith("/vod/")) {
      const probeReq = new Request("http://x/", { headers });
      if (!(await authorized(probeReq, env))) { res.writeHead(401); return res.end(); }
      if (path === "/caps") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ remux: !!FFMPEG })); }
      return await handleVod(req, res, path, new URL(req.url, "http://x").searchParams);
    }
    if (path === "/api" && LISTS.has(new URL(req.url, "http://x").searchParams.get("action") || "")) {
      if (!(await authorized(new Request("http://x/", { headers }), env))) { res.writeHead(401); return res.end(); }
      let c = APIC.get(req.url);
      if (c && c.raw) { if (Date.now() - c.at > 2 * 60000) apiLoad(req.url, headers).catch(() => {}); }
      else c = await apiLoad(req.url, headers);
      if (!c.raw) { res.writeHead(c.status || 502, { "content-type": "application/json" }); return res.end(c.body || ""); }
      const gz = /gzip/.test(req.headers["accept-encoding"] || "");
      res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...(gz ? { "content-encoding": "gzip", "content-length": c.gz.length } : { "content-length": c.raw.length }) });
      return res.end(gz ? c.gz : c.raw);
    }
    const ac = new AbortController();
    res.on("close", () => ac.abort());
    const r = await WORKER.fetch(new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
      method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, signal: ac.signal,
    }), env);
    const h = {};
    r.headers.forEach((v, k) => { h[k] = v; });
    // Journal : les erreurs toujours, chaque vidéo demandée (pour le dépannage)
    if (r.status >= 400 && (r.status !== 401 || path !== "/api")) {
      let detail = "";
      try { detail = (await r.clone().text()).slice(0, 160); } catch {}
      console.log(`  ${new Date().toLocaleTimeString()} ${req.method} ${hide(decodeURIComponent(path === "/seg" ? "/seg " + (new URL(req.url, "http://x").searchParams.get("u") || "").slice(0, 120) : path))} -> ${r.status} ${hide(detail)}`);
    } else if (/^\/live\/|^\/(movie|series)\/|^\/seg$/.test(path)) {
      const seg = path === "/seg" ? " " + (new URL(req.url, "http://x").searchParams.get("u") || "").split("/").pop().slice(0, 40) : "";
      console.log(`  ${new Date().toLocaleTimeString()} ${req.method} ${path}${seg} -> ${r.status}${req.headers.range ? " " + req.headers.range : ""} [${String(req.headers["user-agent"] || "").slice(0, 40)}]`);
    }
    res.writeHead(r.status, h);
    if (r.body) {
      const body = Readable.fromWeb(r.body);
      // Quand le navigateur abandonne, on coupe aussi la connexion au fournisseur (souvent limitée à 1)
      res.on("close", () => { body.destroy(); ac.abort(); });
      body.on("error", () => res.destroy()).pipe(res);
    } else res.end();
  } catch (e) {
    console.log(`  Erreur sur ${hide(req.url.split("?")[0])} : ${hide(String(e && e.message || e))}`);
    if (!res.headersSent) { res.writeHead(500); res.end(String(e)); } else res.destroy();
  }
}).listen(port, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log("\n  Lecteur M3U démarré. Sur l'iPad, l'iPhone ou la TV, ouvrez :\n");
  for (const ip of ips) console.log(`     http://${ip}:${port}${ip.startsWith("100.") ? "   ← adresse Tailscale (marche aussi hors de la maison)" : ""}`);
  console.log("\n  Laissez cette fenêtre ouverte. Pour arrêter : fermez-la.\n");
});
