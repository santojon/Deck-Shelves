
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
SSH_OPTS="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"

pnpm run build

rm -rf .deploy
mkdir -p "${STAGE_DIR}/dist"
cp plugin.json package.json main.py "${STAGE_DIR}/"
# Inject debug flag for dev deploy (not present in source plugin.json for store submission)
node -e 'const fs=require("fs"),p=JSON.parse(fs.readFileSync(process.argv[1]));if(!p.flags.includes("debug"))p.flags.push("debug");fs.writeFileSync(process.argv[1],JSON.stringify(p,null,2)+"\n")' "${STAGE_DIR}/plugin.json"
rsync -a dist/ "${STAGE_DIR}/dist/"
if [[ -d assets ]]; then mkdir -p "${STAGE_DIR}/assets" && rsync -a assets/ "${STAGE_DIR}/assets/"; fi
if [[ -d i18n ]]; then mkdir -p "${STAGE_DIR}/i18n" && rsync -a i18n/ "${STAGE_DIR}/i18n/"; fi

# Strategy: rsync to a temp dir the deck user owns, then sudo-move to the plugin dir.
# This avoids needing the remote rsync process to run as root (--rsync-path="sudo rsync"
# requires a TTY which SSH doesn't provide by default).
TEMP_REMOTE="/tmp/ds_deploy_${PLUGIN_SLUG}"

ssh ${SSH_OPTS} "${USER_NAME}@${HOST}" "mkdir -p '${TEMP_REMOTE}'"
rsync -az --delete --no-perms --omit-dir-times \
  -e "ssh ${SSH_OPTS}" \
  "${STAGE_DIR}/" "${USER_NAME}@${HOST}:${TEMP_REMOTE}/"

# Move temp → plugin dir with sudo.
# Try passwordless sudo first (sudo -n), fall back to sudo -S with DECK_SUDO_PASS.
MOVE_CMD="mkdir -p '${PLUGIN_DIR}' && rsync -a --delete '${TEMP_REMOTE}/' '${PLUGIN_DIR}/' && rm -rf '${TEMP_REMOTE}'"

MOVED=0
# 1. Try sudo -n (NOPASSWD setups)
if ssh ${SSH_OPTS} "${USER_NAME}@${HOST}" "sudo -n bash -c \"${MOVE_CMD}\"" 2>/dev/null; then
  MOVED=1
  echo "[deploy] Moved with sudo -n (NOPASSWD)"
fi

# 2. Try sudo -S with DECK_SUDO_PASS
if [[ "$MOVED" == "0" ]] && [[ -n "$SUDO_PASS" ]]; then
  if ssh ${SSH_OPTS} "${USER_NAME}@${HOST}" "printf '%s\n' '${SUDO_PASS}' | sudo -S bash -c \"${MOVE_CMD}\" 2>/dev/null"; then
    MOVED=1
    echo "[deploy] Moved with sudo -S"
  fi
fi

# 3. Fallback: direct copy (works if deck already owns the plugin dir from a previous deploy)
if [[ "$MOVED" == "0" ]]; then
  if ssh ${SSH_OPTS} "${USER_NAME}@${HOST}" "rsync -a --delete '${TEMP_REMOTE}/' '${PLUGIN_DIR}/' && rm -rf '${TEMP_REMOTE}'" 2>/dev/null; then
    MOVED=1
    echo "[deploy] Moved directly (deck owns plugin dir)"
  fi
fi

if [[ "$MOVED" == "0" ]]; then
  ssh ${SSH_OPTS} "${USER_NAME}@${HOST}" "rm -rf '${TEMP_REMOTE}'" 2>/dev/null || true
  echo "[deploy] ERROR: Could not move files to ${PLUGIN_DIR}." >&2
  echo "[deploy] Set DECK_SUDO_PASS in .env with your deck user sudo password and retry." >&2
  exit 1
fi

# Verify dist/index.js landed
ssh ${SSH_OPTS} "${USER_NAME}@${HOST}" "ls '${PLUGIN_DIR}/dist/index.js' || echo '[deploy] ERROR: dist/index.js not found!'"

if [[ "$HARD" == "1" ]]; then
  ssh ${SSH_OPTS} "${USER_NAME}@${HOST}" "killall steam >/dev/null 2>&1 || true"
  echo "[deploy] Hard reload requested: Steam terminated."
else
  echo "[deploy] Soft deploy complete. Decky debug mode should reload the plugin automatically."
fi

echo "[deploy] Runtime synced to ${USER_NAME}@${HOST}:${PLUGIN_DIR}"
