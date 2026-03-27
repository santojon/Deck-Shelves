
#!/usr/bin/env bash
set -euo pipefail

HARD=0
if [[ "${1:-}" == "--hard" ]]; then
  HARD=1
  shift
fi

HOST="${1:-${DECK_HOST:-}}"
USER_NAME="${2:-${DECK_USER:-deck}}"
if [[ -z "$HOST" ]]; then
  echo "Usage: pnpm run deploy:deck <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi

PLUGIN_SLUG="deck-shelves"
DEV_DIR="/home/${USER_NAME}/homebrew/plugins/${PLUGIN_SLUG}"
STAGE_DIR=".deploy/${PLUGIN_SLUG}"

pnpm run build

rm -rf .deploy
mkdir -p "${STAGE_DIR}/dist"
cp plugin.json package.json main.py "${STAGE_DIR}/"
rsync -a dist/ "${STAGE_DIR}/dist/"
if [[ -d assets ]]; then mkdir -p "${STAGE_DIR}/assets" && rsync -a assets/ "${STAGE_DIR}/assets/"; fi
if [[ -d i18n ]]; then mkdir -p "${STAGE_DIR}/i18n" && rsync -a i18n/ "${STAGE_DIR}/i18n/"; fi

bash scripts/deck/fix-deck-perms.sh "${HOST}" "${USER_NAME}"
# Upload files to the dev dir as the remote user (avoid creating root-owned files)
rsync -az --delete --no-perms --omit-dir-times "${STAGE_DIR}/" "${USER_NAME}@${HOST}:${DEV_DIR}/"

PLUGIN_DIR="/home/${USER_NAME}/homebrew/plugins/${PLUGIN_SLUG}"
# Create target dir if missing and ensure ownership — prefer running as the remote user
ssh "${USER_NAME}@${HOST}" "mkdir -p '${PLUGIN_DIR}' && chown -R ${USER_NAME}:${USER_NAME} '${PLUGIN_DIR}' || true"
rsync -az --delete --no-perms --omit-dir-times "${STAGE_DIR}/" "${USER_NAME}@${HOST}:${PLUGIN_DIR}/"

# Verify dist/index.js
ssh "${USER_NAME}@${HOST}" "ls '${PLUGIN_DIR}/dist/index.js' || echo '[deploy] ERROR: dist/index.js not found!'"

# Ensure executable bits for backend on remote (rsync --no-perms may remove +x)
ssh "${USER_NAME}@${HOST}" "chmod -R u+rwX '${PLUGIN_DIR}' || true"

if [[ "$HARD" == "1" ]]; then
  ssh "${USER_NAME}@${HOST}" "killall steam >/dev/null 2>&1 || true"
  echo "[deploy] Hard reload requested: Steam terminated."
else
  echo "[deploy] Soft deploy complete. Decky debug mode should reload the plugin automatically."
fi

echo "[deploy] Runtime synced to ${USER_NAME}@${HOST}:${DEV_DIR}"
