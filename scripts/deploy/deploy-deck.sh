
#!/usr/bin/env bash
set -euo pipefail

# Load .env from project root if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

HARD=0
if [[ "${1:-}" == "--hard" ]]; then
  HARD=1
  shift
fi

HOST="${1:-${DECK_HOST:-}}"
USER_NAME="${2:-${DECK_USER:-deck}}"
SUDO_PASS="${DECK_SUDO_PASS:-}"

if [[ -z "$HOST" ]]; then
  echo "Usage: pnpm run deploy:deck <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi

PLUGIN_SLUG="deck-shelves"
PLUGIN_DIR="/home/${USER_NAME}/homebrew/plugins/${PLUGIN_SLUG}"
STAGE_DIR=".deploy/${PLUGIN_SLUG}"

# SSH option arrays — bash arrays avoid the word-splitting issue that breaks
# the `=` syntax on macOS OpenSSH 9.x when SSH_OPTS is a plain string variable.
SSH_OPTS=(-o "StrictHostKeyChecking no" -o "UserKnownHostsFile /dev/null" -o "LogLevel ERROR")
# Same options as a string, used for rsync's -e flag (rsync passes it to sh
# which splits correctly; the `=` form is fine there via the shell).
SSH_OPTS_STR="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
# ServerAliveInterval keeps the connection alive during long remote commands
# (systemctl restart plugin_loader takes ~8 s).
SSH_ALIVE=(-o "StrictHostKeyChecking no" -o "UserKnownHostsFile /dev/null" -o "LogLevel ERROR" -o "ServerAliveInterval 10" -o "ServerAliveCountMax 6")

pnpm run build 2>&1 | grep -E "built in|error|warning" || true

rm -rf .deploy
mkdir -p "${STAGE_DIR}/dist"
cp plugin.json package.json main.py "${STAGE_DIR}/"
# Ship every top-level Python module main.py depends on. Auto-include
# anything new dropped at the repo root so future extractions don't get
# silently dropped from the deploy — that's how paths / storage /
# sanitizer / launchers stopped reaching the deck when they were split
# out of main.py, breaking every RPC with "Route does not exist".
for pyf in *.py; do
  [[ "$pyf" == "main.py" ]] && continue
  cp "$pyf" "${STAGE_DIR}/"
done
# Inject debug flag for dev deploy (not present in source plugin.json for store submission)
node -e 'const fs=require("fs"),p=JSON.parse(fs.readFileSync(process.argv[1]));if(!p.flags.includes("debug"))p.flags.push("debug");fs.writeFileSync(process.argv[1],JSON.stringify(p,null,2)+"\n")' "${STAGE_DIR}/plugin.json"
rsync -a dist/ "${STAGE_DIR}/dist/"
if [[ -d assets ]]; then mkdir -p "${STAGE_DIR}/assets" && rsync -a assets/ "${STAGE_DIR}/assets/"; fi
if [[ -d i18n ]]; then mkdir -p "${STAGE_DIR}/i18n" && rsync -a i18n/ "${STAGE_DIR}/i18n/"; fi

# Strategy: rsync to a temp dir the deck user owns, then sudo-move to the plugin dir.
# This avoids needing the remote rsync process to run as root (--rsync-path="sudo rsync"
# requires a TTY which SSH doesn't provide by default).
TEMP_REMOTE="/tmp/ds_deploy_${PLUGIN_SLUG}"

# rsync for upload — faster than tar+ssh + handles partial transfers.
# SSH passed as string to -e (macOS OpenSSH 9.x rejects `=` form in that slot).
ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "mkdir -p '${TEMP_REMOTE}'"
rsync -az --delete --no-perms --omit-dir-times \
  -e "ssh ${SSH_OPTS_STR}" \
  "${STAGE_DIR}/" "${USER_NAME}@${HOST}:${TEMP_REMOTE}/"

# Move temp → plugin dir with sudo.
# Try passwordless sudo first (sudo -n), fall back to sudo -S with DECK_SUDO_PASS.
MOVE_CMD="mkdir -p '${PLUGIN_DIR}' && rsync -a --delete '${TEMP_REMOTE}/' '${PLUGIN_DIR}/' && rm -rf '${TEMP_REMOTE}'"

MOVED=0
# 1. Try sudo -n (NOPASSWD setups)
if ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "sudo -n bash -c \"${MOVE_CMD}\"" 2>/dev/null; then
  MOVED=1
  echo "[deploy] Moved with sudo -n (NOPASSWD)"
fi

# 2. Try sudo -S with DECK_SUDO_PASS
if [[ "$MOVED" == "0" ]] && [[ -n "$SUDO_PASS" ]]; then
  if ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "printf '%s\n' '${SUDO_PASS}' | sudo -S bash -c \"${MOVE_CMD}\" 2>/dev/null"; then
    MOVED=1
    echo "[deploy] Moved with sudo -S"
  fi
fi

# 3. Fallback: direct copy (works if deck already owns the plugin dir from a previous deploy)
if [[ "$MOVED" == "0" ]]; then
  if ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "rsync -a --delete '${TEMP_REMOTE}/' '${PLUGIN_DIR}/' && rm -rf '${TEMP_REMOTE}'" 2>/dev/null; then
    MOVED=1
    echo "[deploy] Moved directly (deck owns plugin dir)"
  fi
fi

if [[ "$MOVED" == "0" ]]; then
  ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "rm -rf '${TEMP_REMOTE}'" 2>/dev/null || true
  echo "[deploy] ERROR: Could not move files to ${PLUGIN_DIR}." >&2
  echo "[deploy] Set DECK_SUDO_PASS in .env with your deck user sudo password and retry." >&2
  exit 1
fi

if [[ "$HARD" == "1" ]]; then
  # Batch: verify + restart plugin_loader + kill Steam in one SSH session.
  # systemctl restart takes ~8 s; ServerAliveInterval keeps the connection alive.
  if [[ -n "${SUDO_PASS}" ]]; then
    ssh "${SSH_ALIVE[@]}" "${USER_NAME}@${HOST}" \
      "test -f '${PLUGIN_DIR}/dist/index.js' || echo '[deploy] WARN: index.js missing'; \
       printf '%s\n' '${SUDO_PASS}' | sudo -S systemctl restart plugin_loader.service 2>/dev/null; \
       killall steam 2>/dev/null || true"
    echo "[deploy] hard reload done."
  else
    echo "[deploy] WARN: DECK_SUDO_PASS not set — plugin_loader NOT restarted." >&2
    ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "killall steam 2>/dev/null || true"
  fi
else
  ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" \
    "test -f '${PLUGIN_DIR}/dist/index.js' || echo '[deploy] WARN: index.js missing'"
fi

echo "[deploy] Runtime synced to ${USER_NAME}@${HOST}:${PLUGIN_DIR}"
