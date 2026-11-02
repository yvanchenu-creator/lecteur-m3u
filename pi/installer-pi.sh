#!/bin/bash
# Installe le Lecteur M3U sur le Raspberry Pi, à lancer depuis le Mac :
#   bash ~/Downloads/installer-pi.sh
# Pré-requis : Pi préparé avec Raspberry Pi Imager (nom « lecteur », utilisateur « pi », SSH activé),
# branché à la Freebox. serveur.mjs et config.json (et donnees.json s'il existe) dans ~/Downloads.
set -e
PI="${PI:-pi@lecteur.local}"
cd ~/Downloads
for f in serveur.mjs config.json; do [ -f "$f" ] || { echo "Il manque ~/Downloads/$f"; exit 1; }; done
echo "1/3  Copie du lecteur vers le Raspberry Pi (mot de passe du Pi demandé)…"
FILES="serveur.mjs config.json"; [ -f donnees.json ] && FILES="$FILES donnees.json"
ssh -o StrictHostKeyChecking=accept-new "$PI" "mkdir -p ~/lecteur"
scp $FILES "$PI":lecteur/
echo "2/3  Installation sur le Pi (Node.js, ffmpeg, Tailscale, démarrage automatique)… quelques minutes"
ssh -t "$PI" 'set -e
sudo apt-get update -qq
sudo apt-get install -y -qq nodejs ffmpeg curl >/dev/null
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh
sudo tee /etc/systemd/system/lecteur.service >/dev/null <<UNIT
[Unit]
Description=Lecteur M3U
After=network-online.target
Wants=network-online.target
[Service]
User=$USER
WorkingDirectory=$HOME/lecteur
ExecStart=/usr/bin/node $HOME/lecteur/serveur.mjs
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now lecteur
sleep 3
echo
echo "3/3  Connexion du Pi à Tailscale : ouvrez le lien qui va s afficher et validez avec votre compte Tailscale."
sudo tailscale up
echo
echo "Terminé ! Adresses du lecteur :"
echo "   à la maison : http://lecteur.local:8080   ou  http://$(hostname -I | cut -d" " -f1):8080"
echo "   partout (Tailscale) : http://$(tailscale ip -4 | head -1):8080"
'
