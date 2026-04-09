
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
if [[ -z "$HOST" ]]; then
  echo "Usage: pnpm run deploy:deck <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi

PLUGIN_SLUG="deck-shelves"
PLUGIN_DIR="/home/${USER_NAME}/homebrew/plugins/${PLUGIN_SLUG}"
STAGE_DIR=".deploy/${PLUGIN_SLUG}"

pnpm run build

rm -rf .deploy
mkdir -p "${STAGE_DIR}/dist"
cp plugin.json package.json main.py "${STAGE_DIR}/"
# Inject debug flag for dev deploy (not present in source plugin.json for store submission)
node -e 'const fs=require("fs"),p=JSON.parse(fs.readFileSync(process.argv[1]));if(!p.flags.includes("debug"))p.flags.push("debug");fs.writeFileSync(process.argv[1],JSON.stringify(p,null,2)+"\n")' "${STAGE_DIR}/plugin.json"
rsync -a dist/ "${STAGE_DIR}/dist/"
if [[ -d assets ]]; then mkdir -p "${STAGE_DIR}/assets" && rsync -a assets/ "${STAGE_DIR}/assets/"; fi
if [[ -d i18n ]]; then mkdir -p "${STAGE_DIR}/i18n" && rsync -a i18n/ "${STAGE_DIR}/i18n/"; fi

# Ensure the remote plugin directory is owned by the remote user before rsync
bash scripts/deck/fix-deck-perms.sh "${HOST}" "${USER_NAME}" "${PLUGIN_SLUG}"

# Upload files (--no-perms avoids overwriting root-set permissions)
rsync -az --delete --no-perms --omit-dir-times "${STAGE_DIR}/" "${USER_NAME}@${HOST}:${PLUGIN_DIR}/"

# Verify dist/index.js landed
ssh "${USER_NAME}@${HOST}" "ls '${PLUGIN_DIR}/dist/index.js' || echo '[deploy] ERROR: dist/index.js not found!'"

if [[ "$HARD" == "1" ]]; then
  ssh "${USER_NAME}@${HOST}" "killall steam >/dev/null 2>&1 || true"
  echo "[deploy] Hard reload requested: Steam terminated."
else
  echo "[deploy] Soft deploy complete. Decky debug mode should reload the plugin automatically."
fi

echo "[deploy] Runtime synced to ${USER_NAME}@${HOST}:${PLUGIN_DIR}"
