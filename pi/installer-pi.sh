#!/bin/bash
# Installe le Lecteur M3U sur le serveur maison (Raspberry Pi ou vieux Mac sous Ubuntu), à lancer depuis le Mac :
#   PI=pi@192.168.1.XX bash ~/Downloads/installer-pi.sh   (adresse affichée sur l'écran du serveur)
# Pré-requis : Pi préparé avec Raspberry Pi Imager (nom « lecteur », utilisateur « pi », SSH activé),
# branché à la Freebox. serveur.mjs et config.json (et donnees.json s'il existe) dans ~/Downloads.
set -e
PI="${PI:-pi@lecteur.local}"
cd ~/Downloads
for f in serveur.mjs config.json; do [ -f "$f" ] || { echo "Il manque ~/Downloads/$f"; exit 1; }; done
echo "1/3  Copie du lecteur vers le serveur (son mot de passe est demandé)…"
FILES="serveur.mjs config.json"; [ -f donnees.json ] && FILES="$FILES donnees.json"
ssh -o StrictHostKeyChecking=accept-new "$PI" "mkdir -p ~/lecteur"
scp $FILES "$PI":lecteur/
echo "2/3  Installation sur le serveur (Node.js, ffmpeg, Tailscale, démarrage automatique)… quelques minutes"
ssh -t "$PI" 'set -e
sudo apt-get update -qq
sudo apt-get install -y -qq nodejs ffmpeg curl avahi-daemon >/dev/null
# Portable : continuer à fonctionner écran rabattu
sudo mkdir -p /etc/systemd/logind.conf.d
printf "[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\n" | sudo tee /etc/systemd/logind.conf.d/lecteur.conf >/dev/null
sudo systemctl restart systemd-logind || true
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
echo "3/3  Connexion du serveur à Tailscale : ouvrez le lien qui va s afficher et validez avec votre compte Tailscale."
sudo tailscale up
echo
echo "Terminé ! Adresses du lecteur :"
echo "   à la maison : http://lecteur.local:8080   ou  http://$(hostname -I | cut -d" " -f1):8080"
echo "   partout (Tailscale) : http://$(tailscale ip -4 | head -1):8080"
'
