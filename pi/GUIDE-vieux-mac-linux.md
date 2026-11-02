# Transformer le vieux Mac (2014) en serveur du lecteur

Le vieux Mac va être **entièrement effacé** et recevoir Ubuntu Server, un Linux gratuit et léger. Il fera ensuite le relais tout seul, 24 h/24, à la place de votre Mac de travail. Comptez environ 45 minutes.

## Ce qu'il faut
- Le vieux Mac, branché sur secteur.
- Une **clé USB de 8 Go ou plus** (elle sera effacée).
- Un **câble Ethernet** entre le vieux Mac et la Freebox. Sur un MacBook Pro 2014, il faut un adaptateur Thunderbolt-Ethernet ou USB-Ethernet. Le Wi-Fi de ces Mac ne fonctionne pas tout de suite sous Linux.
- Votre Mac de travail, pour préparer la clé et lancer l'installation du lecteur.

## 1. Vérifier qu'il ne reste rien d'important sur le vieux Mac
Photos, documents… Tout sera effacé.

## 2. Préparer la clé USB (sur le Mac de travail)
1. Téléchargez **Ubuntu Server 24.04 LTS** sur https://ubuntu.com/download/server (bouton « Download Ubuntu Server »).
2. Installez **balenaEtcher** depuis https://etcher.balena.io, puis ouvrez-le.
3. « Flash from file » : choisissez le fichier Ubuntu téléchargé. « Select target » : la clé USB. Puis « Flash! ».

## 3. Installer Ubuntu sur le vieux Mac
1. Branchez la clé et le câble Ethernet sur le vieux Mac, éteint.
2. Allumez-le en maintenant la touche **⌥ Option (alt)** enfoncée, jusqu'à voir des icônes de disques.
3. Choisissez **EFI Boot** (l'icône orange ou jaune), puis « Try or Install Ubuntu Server ».
4. Répondez aux écrans, avec les flèches et Entrée :
   - Langue : **Français**. Clavier : **French**, variante **French (Macintosh)**.
   - Type d'installation : **Ubuntu Server** (pas « minimized »).
   - Réseau : une adresse en 192.168.1.x doit apparaître. Notez-la, puis « Terminé ».
   - Proxy et miroir : laissez tel quel, « Terminé ».
   - Stockage : **Utiliser un disque entier**, puis « Terminé », puis « Continuer » pour confirmer l'effacement.
   - Profil :
     - Votre nom : ce que vous voulez
     - Nom du serveur : **lecteur**
     - Nom d'utilisateur : **pi**
     - Mot de passe : choisissez-en un et notez-le
   - Ubuntu Pro : « Skip for now ».
   - SSH : cochez **Install OpenSSH server** (barre d'espace), puis « Terminé ».
   - Logiciels supplémentaires (snaps) : ne cochez rien, « Terminé ».
5. À la fin, choisissez **Redémarrer**, et retirez la clé quand on vous le demande.
6. Après le redémarrage, l'écran affiche « lecteur login: ». Tapez `pi`, puis votre mot de passe. L'adresse IP s'affiche dans le texte d'accueil (« IPv4 address for … : 192.168.1.xx »). Notez-la.

## 4. Installer le lecteur (depuis le Mac de travail)
1. Téléchargez **installer-pi.sh** dans Téléchargements, où se trouvent déjà `serveur.mjs`, `config.json` et `donnees.json` (vos profils et favoris).
2. Dans le Terminal, arrêtez le lecteur du Mac de travail (Ctrl + C), puis tapez, en remplaçant l'adresse par la vôtre :
   `PI=pi@192.168.1.xx bash ~/Downloads/installer-pi.sh`
3. Répondez `yes` à la question sur l'empreinte, puis entrez le mot de passe du vieux Mac quand il est demandé (plusieurs fois).
4. À la fin, un lien Tailscale s'affiche : ouvrez-le et validez avec votre compte Tailscale.
5. Les adresses du lecteur s'affichent alors. Notez-les.

## 5. Mettre à jour vos appareils
- **TV** : ouvrez l'app Lecteur. Comme le Mac de travail ne répond plus, elle propose de changer l'adresse : tapez `http://lecteur.local:8080` (ou l'adresse 192.168.1.xx:8080).
- **iPhone / iPad** : ouvrez l'adresse Tailscale (`http://100.…:8080`) et ajoutez-la à l'écran d'accueil à la place de l'ancienne.

Le vieux Mac peut rester écran rabattu dans un coin, branché à la Freebox. Il redémarre le lecteur tout seul après une coupure de courant.
