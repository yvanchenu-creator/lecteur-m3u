# Le lecteur sur le PC HP (Windows), allumé en permanence

Rien n'est effacé : le lecteur s'ajoute à Windows, démarre tout seul à l'allumage (même sans ouvrir de session) et ne met plus le PC en veille quand il est branché.

## 1. Préparer le PC
- Branchez-le sur **secteur**, et de préférence à la Freebox par un **câble Ethernet** (le ProBook a une prise réseau). Le Wi-Fi marche aussi.
- Connectez-vous avec un compte **administrateur** de Windows.

## 2. Récupérer les fichiers (sur le PC)
Téléchargez ces deux fichiers depuis la conversation avec Claude, dans **Téléchargements** :
- `serveur.mjs`
- `installer-windows.ps1`

Pour garder les profils et favoris déjà créés, copiez aussi `config.json` et `donnees.json` du dossier Téléchargements du Mac vers celui du PC (clé USB, AirDrop vers un téléphone, e-mail…). Sinon, l'installation vous demandera vos identifiants IPTV et votre code, et les profils seront à recréer.

## 3. Lancer l'installation
1. Menu Démarrer, tapez **PowerShell**, faites un clic droit sur « Windows PowerShell », puis **Exécuter en tant qu'administrateur**, puis **Oui**.
2. Collez cette ligne, puis appuyez sur Entrée :

   `powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\installer-windows.ps1"`

3. Laissez faire (5 à 10 minutes). Répondez aux questions si on vous en pose. À la fin, « Le lecteur tourne ! » et les adresses s'affichent.

## 4. Tailscale (accès hors de la maison)
Cliquez sur l'icône **Tailscale** près de l'horloge, puis **Log in**, avec le même compte que sur vos iPhone/iPad. Relancez ensuite la ligne de l'étape 3 pour voir l'adresse en `http://100.…:8080`.

## 5. Basculer vos appareils
- Sur le **Mac** : arrêtez l'ancien lecteur (Ctrl + C dans le Terminal). Il ne sert plus.
- **TV** : ouvrez l'app Lecteur. Comme le Mac ne répond plus, elle propose de changer l'adresse : tapez l'adresse du PC (`http://192.168.1.xx:8080`).
- **iPhone / iPad** : ouvrez l'adresse Tailscale du PC (`http://100.…:8080`) et ajoutez-la à l'écran d'accueil.

Le PC peut rester écran rabattu dans un coin. Après une mise à jour Windows ou une coupure de courant, le lecteur redémarre tout seul.
