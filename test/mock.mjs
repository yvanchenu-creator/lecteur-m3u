import fs from "fs";
// Faux fournisseur Xtream pour les tests
import http from "http";
const now = Math.floor(Date.now()/1000);
const b64 = (s) => Buffer.from(s).toString("base64");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","base64");
const data = {
  "": { user_info: { username: "u", password: "p", status: "Active" }, server_info: {} },
  get_live_categories: [{ category_id: "1", category_name: "France" }, { category_id: "2", category_name: "Sport" }],
  get_live_streams: Array.from({ length: 12 }, (_, i) => ({ stream_id: 100 + i, name: "Chaîne " + (i + 1), stream_icon: i % 2 ? "http://127.0.0.1:9100/logo.png" : "", category_id: i < 8 ? "1" : "2" })),
  get_vod_info: { info: { duration_secs: 40 } },
  get_vod_categories: [{ category_id: "10", category_name: "Films récents" }],
  get_vod_streams: Array.from({ length: 40 }, (_, i) => ({ stream_id: 500 + i, name: "Film " + (i + 1), stream_icon: "http://127.0.0.1:9100/logo.png", category_id: "10", added: String(now - i * 3600), container_extension: i === 0 ? "mkv" : "mp4" })).map((x, i) => i === 0 ? { ...x, stream_id: 600, name: "Film MKV MULTI" } : x),
  get_series_categories: [{ category_id: "20", category_name: "Séries" }],
  get_series: Array.from({ length: 10 }, (_, i) => ({ series_id: 900 + i, name: "Série " + (i + 1), cover: "", category_id: "20", last_modified: String(now - i * 7200) })),
  get_series_info: { info: { plot: "Une série de test." }, episodes: { "1": [{ id: "7001", episode_num: 1, title: "Pilote", container_extension: "mp4" }, { id: "7002", episode_num: 2, title: "Suite", container_extension: "mp4" }] } },
};
http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname === "/player_api.php") {
    if (u.searchParams.get("username") !== "u" || u.searchParams.get("password") !== "p") { res.writeHead(401); return res.end("{}"); }
    const a = u.searchParams.get("action") || "";
    if (a === "get_short_epg") { res.writeHead(200); return res.end(JSON.stringify({ epg_listings: [{ title: b64("Journal de 13h"), start: "2026-11-02 13:00:00", end: "2026-11-02 13:40:00" }] })); }
    res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify(data[a] ?? []));
  }
  if (u.pathname === "/logo.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(png); }
  let m = u.pathname.match(/^\/live\/u\/p\/(\d+)\.m3u8$/);
  if (m) { res.writeHead(302, { location: "/hls/" + m[1] + "/index.m3u8" }); return res.end(); }
  m = u.pathname.match(/^\/hls\/(\d+)\/index\.m3u8$/);
  if (m) { res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" }); return res.end("#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg1.ts\n#EXTINF:4,\nhttp://127.0.0.1:9100/hls/" + m[1] + "/seg2.ts\n"); }
  if (u.pathname.startsWith("/hls/")) { res.writeHead(200, { "content-type": "video/mp2t" }); return res.end(Buffer.alloc(188 * 10, 0x47)); }
  if (u.pathname === "/movie/u/p/600.mkv") {
    const buf0 = fs.readFileSync(new URL("./film.mkv", import.meta.url));
    // Comme le vrai fournisseur : une seule connexion à la fois, débit limité
    if (globalThis.ACTIVE) { console.log("mock: 461 (connexion déjà ouverte)"); res.writeHead(461); return res.end(); }
    globalThis.ACTIVE = true; res.on("close", () => { globalThis.ACTIVE = false; });
    const slow = (b) => { let i = 0; const t = setInterval(() => { if (res.destroyed) return clearInterval(t); res.write(b.subarray(i, i += 8192)); if (i >= b.length) { clearInterval(t); res.end(); } }, 50); };
    const buf = buf0;
    const r0 = req.headers.range && req.headers.range.match(/bytes=(\d+)-(\d*)/);
    if (r0) { const a = +r0[1], b = r0[2] ? +r0[2] : buf.length - 1; res.writeHead(206, { "content-type": "video/x-matroska", "accept-ranges": "bytes", "content-range": `bytes ${a}-${b}/${buf.length}`, "content-length": b - a + 1 }); return slow(buf.subarray(a, b + 1)); }
    res.writeHead(200, { "content-type": "video/x-matroska", "accept-ranges": "bytes", "content-length": buf.length }); return slow(buf);
    const r = req.headers.range && req.headers.range.match(/bytes=(\d+)-(\d*)/);
    if (r) { const a = +r[1], b = r[2] ? +r[2] : buf.length - 1; res.writeHead(206, { "content-type": "video/x-matroska", "accept-ranges": "bytes", "content-range": `bytes ${a}-${b}/${buf.length}`, "content-length": b - a + 1 }); return res.end(buf.subarray(a, b + 1)); }
    res.writeHead(200, { "content-type": "video/x-matroska", "accept-ranges": "bytes", "content-length": buf.length }); return res.end(buf);
  }
  m = u.pathname.match(/^\/(movie|series)\/u\/p\/(\d+)\.mp4$/);
  if (m) {
    const body = Buffer.alloc(1000, 1);
    if (req.headers.range) { res.writeHead(206, { "content-type": "video/mp4", "content-range": "bytes 0-99/1000", "content-length": 100 }); return res.end(body.subarray(0, 100)); }
    res.writeHead(200, { "content-type": "video/mp4", "content-length": 1000 }); return res.end(body);
  }
  res.writeHead(404); res.end();
}).listen(9100, () => console.log("mock 9100"));
