# Lecteur M3U familial

Lecteur IPTV (abonnement Xtream) pour la famille : tuiles En direct / Nouveautés / Favoris, profils, reprise de lecture entre appareils, playlist rechargée à chaque démarrage.

- `src/app.html` : l'application web (iPad, iPhone, Mac, TV).
- `src/worker.js` : relais (API, flux, images, profils, synchronisation). Tourne sur le Mac via `mac/adapter.mjs`.
- `build.mjs` : produit `dist/mac/serveur.mjs` (fichier unique à lancer avec `node serveur.mjs` sur le Mac).
- `android/` : app Google TV qui affiche le lecteur du Mac (compilée par GitHub Actions, onglet Actions > App TV).
- `test/` : faux fournisseur Xtream et tests de navigateur.

Les identifiants IPTV ne sont jamais dans ce dépôt : ils vont dans `config.json` à côté de `serveur.mjs`, sur le Mac.
