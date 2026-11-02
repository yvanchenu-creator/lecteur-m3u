import { readFileSync, writeFileSync, mkdirSync } from "fs";
const html = readFileSync("src/app.html", "utf8");
const w = readFileSync("src/worker.js", "utf8").replace("__APP_HTML__", () => JSON.stringify(html));
mkdirSync("dist/mac", { recursive: true });
writeFileSync("dist/worker.js", w);
const mac = readFileSync("mac/adapter.mjs", "utf8") + "\n" + w.replace("export default {", "var WORKER = {").replace(/^\/\/ Variables à définir[\s\S]*?APP_PIN .*\n/m, "");
writeFileSync("dist/mac/serveur.mjs", mac);
writeFileSync("dist/mac/Lancer le lecteur.command", [
  "#!/bin/bash",
  'cd "$(dirname "$0")"',
  'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"',
  '[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1',
  'if ! command -v node >/dev/null; then echo "Node.js n\'est pas installé : https://nodejs.org (version LTS)"; read -n1; exit 1; fi',
  "node serveur.mjs",
  'read -n1 -p "Appuyez sur une touche pour fermer"', ""].join("\n"), { mode: 0o755 });
console.log("ok", w.length, mac.length);
