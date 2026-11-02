// ---- Serveur pour Mac : fait tourner le lecteur sur votre connexion internet ----
import http from "node:http";
import os from "node:os";
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync, rmSync, statSync, createReadStream } from "node:fs";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
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
  try { return execFileSync("/bin/sh", ["-c", "command -v ffmpeg"]).toString().trim() || null; } catch { return null; }
}
FFMPEG = findFfmpeg();
if (!FFMPEG) {
  console.log("  Installation de l'outil de conversion vidéo (une seule fois, ~1 minute)…");
  const npm = join(dirname(process.execPath), "npm");
  const p = spawn(existsSync(npm) ? npm : "npm", ["install", "--prefix", DIR, "--no-audit", "--no-fund", "ffmpeg-static"], { stdio: "ignore" });
  p.on("exit", () => { FFMPEG = findFfmpeg(); console.log(FFMPEG ? "  Outil de conversion vidéo prêt." : "  Échec de l'installation de l'outil de conversion (les .mkv ne marcheront pas dans Safari)."); });
  p.on("error", () => {});
}

// Empêche la mise en veille automatique du Mac tant que le lecteur tourne
if (process.platform === "darwin") { try { spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore" }).unref(); } catch {} }

const TMP = join(os.tmpdir(), "lecteur-m3u");
rmSync(TMP, { recursive: true, force: true });
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

const hide = (t) => t.split(String(env.XTREAM_PASS)).join("***").split(String(env.XTREAM_USER)).join("***");
async function startSession(key, upstream, start, retry = 0, hint = {}) {
  // Une seule connexion autorisée par le fournisseur : on arrête toute autre conversion
  for (const k of [...SESS.keys()]) if (k !== key) stopSession(k);
  const dir = join(TMP, key.replace(/[^\w.-]/g, "_"));
  mkdirSync(dir, { recursive: true });
  const sess = { dir, proc: null, last: Date.now(), done: false, failed: false };
  SESS.set(key, sess);
  if (!retry && hint.direct) await wait(1500); // laisse le temps à la tentative directe de libérer la connexion
  // Le codec annoncé par le fournisseur évite une analyse préalable (une connexion et plusieurs secondes de gagnées)
  const vcodec = /^(h264|hevc)$/.test(hint.vc || "") ? hint.vc : await probe(upstream);
  const v = vcodec === "h264" ? ["-c:v", "copy"]
    : vcodec === "hevc" ? ["-c:v", "copy", "-tag:v", "hvc1"]
    : ["-c:v", "h264_videotoolbox", "-b:v", "6M"];
  const args = ["-hide_banner", "-nostdin", "-loglevel", "error",
    "-user_agent", UA, ...(start > 0 ? [...(v[1] === "copy" ? ["-noaccurate_seek"] : []), "-ss", String(start)] : []), "-i", upstream,
    "-map", "0:v:0", "-map", "0:a:0?", ...v, "-c:a", "aac", "-b:a", "192k", "-ac", "2",
    "-avoid_negative_ts", "make_zero", "-max_muxing_queue_size", "4096",
    "-f", "hls", "-hls_time", "4", "-hls_init_time", "1", "-hls_list_size", "0", "-hls_playlist_type", "event",
    "-hls_segment_type", "fmp4", "-hls_flags", "temp_file", "-hls_fmp4_init_filename", "init.mp4",
    "-hls_segment_filename", join(dir, "seg%05d.m4s"), join(dir, "index.m3u8")];
  const proc = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
  sess.proc = proc;
  proc.stderr.on("data", (d) => { sess.log = hide(String(d)).slice(0, 300); });
  console.log(`  Conversion de ${key} (vidéo ${vcodec || "inconnue"}) à partir de ${start}s`);
  proc.on("close", (code) => {
    if (code && !retry && SESS.get(key) === sess && !existsSync(join(dir, "index.m3u8"))) {
      console.log(`  Conversion ${key} refusée par le fournisseur, nouvel essai dans 4 s…`);
      SESS.delete(key);
      return setTimeout(() => { startSession(key, upstream, start, 1, hint).then((s2) => { sess.next = s2; }); }, 4000);
    }
    if (code) console.log(`  Conversion ${key} arrêtée (code ${code}) ${sess.log || ""}`); sess.done = true; if (code) sess.failed = !existsSync(join(dir, "index.m3u8")); });
  return sess;
}
function stopSession(key) {
  const s = SESS.get(key);
  if (!s) return;
  SESS.delete(key);
  try { s.proc && s.proc.kill("SIGKILL"); } catch {}
  rmSync(s.dir, { recursive: true, force: true });
}
setInterval(() => { for (const [k, s] of SESS) if (Date.now() - s.last > 120000) stopSession(k); }, 30000).unref();

async function handleVod(req, res, path, query) {
  const m = path.match(/^\/vod\/(movie|series)\/(\d+)\.([a-z0-9]{2,5})\/(\d+)\/([\w.]+)$/i);
  if (!m || !FFMPEG) { res.writeHead(404); return res.end(); }
  const [, type, id, ext, start, file] = m;
  const key = `${type}-${id}-${start}`;
  let sess = SESS.get(key);
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
  if (!existsSync(fp)) { res.writeHead(sess.failed ? 502 : 404); return res.end(sess.log || ""); }
  if (file === "index.m3u8") {
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
    const ac = new AbortController();
    res.on("close", () => ac.abort());
    const r = await WORKER.fetch(new Request(`http://${req.headers.host || "localhost"}${req.url}`, {
      method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, signal: ac.signal,
    }), env);
    const h = {};
    r.headers.forEach((v, k) => { h[k] = v; });
    res.writeHead(r.status, h);
    if (r.body) {
      const body = Readable.fromWeb(r.body);
      // Quand le navigateur abandonne, on coupe aussi la connexion au fournisseur (souvent limitée à 1)
      res.on("close", () => { body.destroy(); ac.abort(); });
      body.on("error", () => res.destroy()).pipe(res);
    } else res.end();
  } catch (e) {
    if (!res.headersSent) { res.writeHead(500); res.end(String(e)); } else res.destroy();
  }
}).listen(port, "0.0.0.0", () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address);
  console.log("\n  Lecteur M3U démarré. Sur l'iPad, l'iPhone ou la TV, ouvrez :\n");
  for (const ip of ips) console.log(`     http://${ip}:${port}${ip.startsWith("100.") ? "   ← adresse Tailscale (marche aussi hors de la maison)" : ""}`);
  console.log("\n  Laissez cette fenêtre ouverte. Pour arrêter : fermez-la.\n");
});
