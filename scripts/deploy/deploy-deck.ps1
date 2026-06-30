#!/usr/bin/env pwsh
# Windows / cross-platform deploy variant of scripts/deploy/deploy-deck.sh.
# Uses the OpenSSH client (ssh/scp) bundled with Windows 10+ and PowerShell 5.1+
# (or pwsh 7+). No rsync / bash required — upload uses scp -r.
#
#   pnpm run deploy:deck:win            # soft (sync only)
#   pnpm run deploy:deck:win:hard       # restart plugin_loader + kill Steam
#   pwsh scripts/deploy/deploy-deck.ps1 -Hard -DeckHost 192.168.1.15 -DeckUser deck
#
# Reads DECK_HOST / DECK_USER / DECK_SUDO_PASS from .env (gitignored).
[CmdletBinding()]
param(
  [switch]$Hard,
  [string]$DeckHost,
  [string]$DeckUser
)
$ErrorActionPreference = 'Stop'

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path

# ── Load .env (KEY=VALUE, # comments, optional quotes) ───────────────────────
$envVars = @{}
$envPath = Join-Path $ProjectRoot '.env'
if (Test-Path $envPath) {
  foreach ($line in Get-Content $envPath) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#') -or ($t -notmatch '=')) { continue }
    $k, $v = $t -split '=', 2
    $envVars[$k.Trim()] = $v.Trim().Trim('"').Trim("'")
  }
}
function Get-Conf([string]$key, [string]$fallback) {
  if ($envVars.ContainsKey($key) -and $envVars[$key]) { return $envVars[$key] }
  $val = [System.Environment]::GetEnvironmentVariable($key)
  if ($val) { return $val }
  return $fallback
}

if (-not $DeckHost) { $DeckHost = Get-Conf 'DECK_HOST' '' }
if (-not $DeckUser) { $DeckUser = Get-Conf 'DECK_USER' 'deck' }
$SudoPass = Get-Conf 'DECK_SUDO_PASS' ''

if (-not $DeckHost) {
  Write-Error 'Usage: pnpm run deploy:deck:win  (set DECK_HOST in .env, or pass -DeckHost <ip>)'
  exit 1
}

$Slug       = 'deck-shelves'
$PluginDir  = "/home/$DeckUser/homebrew/plugins/$Slug"
$StageRel   = ".deploy/$Slug"                       # relative — avoids the scp "C:" gotcha
$StageDir   = Join-Path $ProjectRoot ".deploy\$Slug"
$TempRemote = "/tmp/$Slug"
$Target     = "$DeckUser@$DeckHost"
$SshOpts    = @('-o', 'StrictHostKeyChecking=no', '-o', 'UserKnownHostsFile=/dev/null', '-o', 'LogLevel=ERROR')
$SshAlive   = $SshOpts + @('-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=6')

function Invoke-Remote([string[]]$opts, [string]$cmd) {
  & ssh @opts $Target $cmd
  return $LASTEXITCODE
}

Push-Location $ProjectRoot
try {
  # ── 1. Build ────────────────────────────────────────────────────────────────
  & pnpm run build
  if ($LASTEXITCODE -ne 0) { throw 'build failed' }

  # ── 2. Stage ────────────────────────────────────────────────────────────────
  if (Test-Path (Join-Path $ProjectRoot '.deploy')) { Remove-Item -Recurse -Force (Join-Path $ProjectRoot '.deploy') }
  New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'dist') | Out-Null
  Copy-Item 'plugin.json', 'package.json', 'main.py' $StageDir
  # Ship every top-level Python module main.py depends on (paths/storage/...).
  Get-ChildItem -Path $ProjectRoot -Filter '*.py' -File | Where-Object { $_.Name -ne 'main.py' } |
    ForEach-Object { Copy-Item $_.FullName $StageDir }
  # Inject the dev `debug` flag into the staged plugin.json (node = cross-platform).
  & node -e 'const fs=require("fs"),p=JSON.parse(fs.readFileSync(process.argv[1]));if(!p.flags.includes("debug"))p.flags.push("debug");fs.writeFileSync(process.argv[1],JSON.stringify(p,null,2)+"\n")' (Join-Path $StageDir 'plugin.json')
  Copy-Item -Recurse -Force (Join-Path $ProjectRoot 'dist\*') (Join-Path $StageDir 'dist')
  foreach ($d in 'assets', 'i18n') {
    if (Test-Path (Join-Path $ProjectRoot $d)) {
      New-Item -ItemType Directory -Force -Path (Join-Path $StageDir $d) | Out-Null
      Copy-Item -Recurse -Force (Join-Path $ProjectRoot "$d\*") (Join-Path $StageDir $d)
    }
  }

  # ── 3. Upload to a temp dir the deck user owns (scp -r the folder into /tmp) ──
  Invoke-Remote $SshOpts "rm -rf '$TempRemote'" | Out-Null
  & scp @SshOpts -r $StageRel "${Target}:/tmp/"    # creates /tmp/deck-shelves
  if ($LASTEXITCODE -ne 0) { throw 'scp upload failed' }

  # ── 4. Move temp → plugin dir (sudo -n → sudo -S → direct) ───────────────────
  $moveCmd = "mkdir -p '$PluginDir' && cp -rf '$TempRemote/.' '$PluginDir/' && rm -rf '$TempRemote'"
  $moved = $false
  if ((Invoke-Remote $SshOpts "sudo -n bash -c `"$moveCmd`"") -eq 0) {
    $moved = $true; Write-Host '[deploy] Moved with sudo -n (NOPASSWD)'
  }
  if (-not $moved -and $SudoPass) {
    if ((Invoke-Remote $SshOpts "printf '%s\n' '$SudoPass' | sudo -S bash -c `"$moveCmd`"") -eq 0) {
      $moved = $true; Write-Host '[deploy] Moved with sudo -S'
    }
  }
  if (-not $moved) {
    if ((Invoke-Remote $SshOpts "mkdir -p '$PluginDir' && cp -rf '$TempRemote/.' '$PluginDir/' && rm -rf '$TempRemote'") -eq 0) {
      $moved = $true; Write-Host '[deploy] Moved directly (deck owns plugin dir)'
    }
  }
  if (-not $moved) {
    Invoke-Remote $SshOpts "rm -rf '$TempRemote'" | Out-Null
    Write-Error "[deploy] Could not move files to $PluginDir. Set DECK_SUDO_PASS in .env and retry."
    exit 1
  }

  # ── 5. Reload ────────────────────────────────────────────────────────────────
  if ($Hard) {
    if ($SudoPass) {
      Invoke-Remote $SshAlive "test -f '$PluginDir/dist/index.js' || echo '[deploy] WARN: index.js missing'; printf '%s\n' '$SudoPass' | sudo -S systemctl restart plugin_loader.service 2>/dev/null; killall steam 2>/dev/null || true" | Out-Null
      Write-Host '[deploy] hard reload done.'
    } else {
      Write-Warning '[deploy] DECK_SUDO_PASS not set — plugin_loader NOT restarted.'
      Invoke-Remote $SshOpts 'killall steam 2>/dev/null || true' | Out-Null
    }
  } else {
    Invoke-Remote $SshOpts "test -f '$PluginDir/dist/index.js' || echo '[deploy] WARN: index.js missing'" | Out-Null
  }

  Write-Host "[deploy] Runtime synced to ${Target}:$PluginDir"
}
finally { Pop-Location }
