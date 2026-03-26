
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
DEV_DIR="/home/${USER_NAME}/dev-plugins/${PLUGIN_SLUG}"
STAGE_DIR=".deploy/${PLUGIN_SLUG}"

pnpm run build

rm -rf .deploy
mkdir -p "${STAGE_DIR}/dist"
cp plugin.json package.json main.py "${STAGE_DIR}/"
rsync -a dist/ "${STAGE_DIR}/dist/"
if [[ -d assets ]]; then mkdir -p "${STAGE_DIR}/assets" && rsync -a assets/ "${STAGE_DIR}/assets/"; fi
if [[ -d i18n ]]; then mkdir -p "${STAGE_DIR}/i18n" && rsync -a i18n/ "${STAGE_DIR}/i18n/"; fi

bash scripts/deck/fix-deck-perms.sh "${HOST}" "${USER_NAME}"
rsync -az --delete --no-perms --omit-dir-times "${STAGE_DIR}/" "${USER_NAME}@${HOST}:${DEV_DIR}/"

# Sync plugin files to the Decky plugins directory (real copy, not symlink)
# Decky's web server does not follow symlinks, so we must copy files directly.
# homebrew/plugins/ is owned by root, so we always use sudo for cleanup and ownership.
PLUGIN_DIR="/home/${USER_NAME}/homebrew/plugins/Deck Shelves"
PLUGIN_DIR_ESCAPED="/home/${USER_NAME}/homebrew/plugins/Deck\ Shelves"
ssh -t "${USER_NAME}@${HOST}" "sudo rm -rf '${PLUGIN_DIR}' && sudo mkdir -p '${PLUGIN_DIR}' && sudo chown -R ${USER_NAME}:${USER_NAME} '${PLUGIN_DIR}'"
rsync -az --delete --no-perms --omit-dir-times "${STAGE_DIR}/" "${USER_NAME}@${HOST}:${PLUGIN_DIR_ESCAPED}/"

# Verify dist/index.js
ssh "${USER_NAME}@${HOST}" "ls '${PLUGIN_DIR}/dist/index.js' || echo '[deploy] ERROR: dist/index.js not found!'"

if [[ "$HARD" == "1" ]]; then
  ssh "${USER_NAME}@${HOST}" "killall steam >/dev/null 2>&1 || true"
  echo "[deploy] Hard reload requested: Steam terminated."
else
  echo "[deploy] Soft deploy complete. Decky debug mode should reload the plugin automatically."
fi

echo "[deploy] Runtime synced to ${USER_NAME}@${HOST}:${DEV_DIR}"
