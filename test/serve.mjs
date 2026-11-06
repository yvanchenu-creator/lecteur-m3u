// Fait tourner le Worker sous Node (adaptateur minimal)
import http from "http";
import { Readable } from "stream";
const mod = await import("../dist/worker.js?" + Date.now());
const env = { XTREAM_HOST: "http://127.0.0.1:9100", XTREAM_USER: "u", XTREAM_PASS: "p", APP_PIN: "1234" };
let MEM = null; env.STORE = { get: async () => MEM && JSON.parse(MEM), put: async (v) => { MEM = JSON.stringify(v); } }; // stockage en mémoire pour les tests
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await mod.default.fetch(new Request("http://127.0.0.1:9200" + req.url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined }), env);
  const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
  // Secure cookie inutilisable en http local : on l'enlève pour les tests
  if (h["set-cookie"]) h["set-cookie"] = h["set-cookie"].replace("; Secure", "");
  res.writeHead(r.status, h);
  if (r.body) Readable.fromWeb(r.body).pipe(res); else res.end();
}).listen(9200, () => console.log("worker 9200"));
