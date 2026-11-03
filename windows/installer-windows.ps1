# Installe le Lecteur M3U sur un PC Windows qui reste allumé à la maison.
# À lancer en administrateur depuis le dossier qui contient serveur.mjs (voir GUIDE-windows.md).
$ErrorActionPreference = "Stop"
$Dir = "C:\LecteurM3U"
$Src = Split-Path -Parent $MyInvocation.MyCommand.Path

function Etape($t) { Write-Host ""; Write-Host "==> $t" -ForegroundColor Cyan }

# 0. Administrateur ?
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Host "Relancez PowerShell en tant qu'administrateur (clic droit > Exécuter en tant qu'administrateur)." -ForegroundColor Red; exit 1 }

Etape "1/7  Copie des fichiers dans $Dir"
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
foreach ($f in "serveur.mjs", "config.json", "donnees.json") {
  $p = Join-Path $Src $f
  if ((Test-Path $p) -and ($Src -ne $Dir)) { Copy-Item $p $Dir -Force }
}
if (-not (Test-Path "$Dir\serveur.mjs")) { Write-Host "serveur.mjs introuvable à côté de ce script." -ForegroundColor Red; exit 1 }

Etape "2/7  Installation de Node.js et de Tailscale (quelques minutes)"
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Write-Host "winget absent : installez 'App Installer' depuis le Microsoft Store puis relancez." -ForegroundColor Red; exit 1 }
$node = "$env:ProgramFiles\nodejs\node.exe"
if (-not (Test-Path $node)) { winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent }
if (-not (Test-Path $node)) { Write-Host "Node.js ne s'est pas installé correctement." -ForegroundColor Red; exit 1 }
if (-not (Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe")) { winget install --id tailscale.tailscale -e --accept-package-agreements --accept-source-agreements --silent }

Etape "3/7  Outil de conversion vidéo (ffmpeg)"
& "$env:ProgramFiles\nodejs\npm.cmd" install --prefix $Dir --no-audit --no-fund ffmpeg-static | Out-Null

Etape "4/7  Réglages du lecteur"
if (-not (Test-Path "$Dir\config.json")) {
  $user = Read-Host "Identifiant IPTV (le username= de votre lien)"
  $pass = Read-Host "Mot de passe IPTV (le password= de votre lien)"
  $pin  = Read-Host "Code d'accès du lecteur (celui que la famille utilise déjà)"
  $cfg = [ordered]@{ XTREAM_HOST = "http://p5.siplinks.me"; XTREAM_USER = $user; XTREAM_PASS = $pass; APP_PIN = $pin; PORT = 8080 }
  [IO.File]::WriteAllText("$Dir\config.json", ($cfg | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
}

Etape "5/7  Pare-feu : autoriser le lecteur sur le réseau"
if (-not (Get-NetFirewallRule -DisplayName "Lecteur M3U" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "Lecteur M3U" -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Any | Out-Null
}

Etape "6/7  Le PC reste éveillé, même écran rabattu (sur secteur)"
powercfg /change standby-timeout-ac 0 | Out-Null
powercfg /change hibernate-timeout-ac 0 | Out-Null
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0 | Out-Null
powercfg /setactive SCHEME_CURRENT | Out-Null

Etape "7/7  Démarrage automatique du lecteur"
$action   = New-ScheduledTaskAction -Execute $node -Argument "`"$Dir\serveur.mjs`"" -WorkingDirectory $Dir
$trigger  = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$princ    = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName "Lecteur M3U" -Action $action -Trigger $trigger -Settings $settings -Principal $princ -Force | Out-Null
Stop-ScheduledTask -TaskName "Lecteur M3U" -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName "Lecteur M3U"
Start-Sleep -Seconds 4

$ok = $false
try { $ok = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8080/" -TimeoutSec 5).StatusCode -eq 200 } catch {}
Write-Host ""
if ($ok) { Write-Host "Le lecteur tourne !" -ForegroundColor Green } else { Write-Host "Le lecteur ne répond pas encore : envoyez une capture à Claude." -ForegroundColor Yellow }
Write-Host "Adresses du lecteur :"
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | ForEach-Object {
  $tag = ""; if ($_.IPAddress -like "100.*") { $tag = "   <- Tailscale (marche aussi hors de la maison)" }
  Write-Host ("   http://{0}:8080{1}" -f $_.IPAddress, $tag)
}
Write-Host ""
Write-Host "Dernière étape : ouvrez Tailscale (icône près de l'horloge) et connectez-vous avec le même compte que vos iPhone/iPad."
