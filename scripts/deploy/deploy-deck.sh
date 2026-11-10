#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

HARD=0
RELEASE=0
# --hard restarts the loader and Steam; --release ships the production build without the debug flag.
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --hard) HARD=1; shift ;;
    --release) RELEASE=1; shift ;;
    *) break ;;
  esac
done

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

# Arrays for ssh (macOS OpenSSH rejects the `=` form there); a string for rsync -e.
SSH_OPTS=(-o "StrictHostKeyChecking no" -o "UserKnownHostsFile /dev/null" -o "LogLevel ERROR")
SSH_OPTS_STR="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR"
SSH_ALIVE=(-o "StrictHostKeyChecking no" -o "UserKnownHostsFile /dev/null" -o "LogLevel ERROR" -o "ServerAliveInterval 10" -o "ServerAliveCountMax 6")

# A failed build stops the deploy.
BUILD_LOG="$(mktemp)"
if [[ "$RELEASE" == "1" ]]; then BUILD_CMD="build"; else BUILD_CMD="build:dev"; fi
if ! pnpm run "$BUILD_CMD" > "$BUILD_LOG" 2>&1; then
  grep -E "error|Error" "$BUILD_LOG" | tail -20 || true
  echo "✗ pnpm run $BUILD_CMD failed — deploy aborted" >&2
  rm -f "$BUILD_LOG"
  exit 1
fi
grep -E "built in|error|warning" "$BUILD_LOG" || true
rm -f "$BUILD_LOG"

rm -rf .deploy
mkdir -p "${STAGE_DIR}/dist"
cp plugin.json package.json main.py "${STAGE_DIR}/"
# Every backend module, where main.py looks for it in a repo layout.
mkdir -p "${STAGE_DIR}/src/backend"
for pyf in src/backend/*.py; do
  cp "$pyf" "${STAGE_DIR}/src/backend/"
done
# Dev deploys get the debug flag; the repo's plugin.json never carries it.
if [[ "$RELEASE" != "1" ]]; then
  node -e 'const fs=require("fs"),p=JSON.parse(fs.readFileSync(process.argv[1]));if(!p.flags.includes("debug"))p.flags.push("debug");fs.writeFileSync(process.argv[1],JSON.stringify(p,null,2)+"\n")' "${STAGE_DIR}/plugin.json"
fi
rsync -a dist/ "${STAGE_DIR}/dist/"
if [[ -d assets ]]; then mkdir -p "${STAGE_DIR}/assets" && rsync -a assets/ "${STAGE_DIR}/assets/"; fi
if [[ -d i18n ]]; then mkdir -p "${STAGE_DIR}/i18n" && rsync -a i18n/ "${STAGE_DIR}/i18n/"; fi

# Upload to a temp dir the deck user owns, then move it into the root-owned plugin dir.
TEMP_REMOTE="/tmp/ds_deploy_${PLUGIN_SLUG}"

ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "mkdir -p '${TEMP_REMOTE}'"
rsync -az --delete --no-perms --omit-dir-times \
  -e "ssh ${SSH_OPTS_STR}" \
  "${STAGE_DIR}/" "${USER_NAME}@${HOST}:${TEMP_REMOTE}/"

# sudo -n, then sudo -S with DECK_SUDO_PASS, then a plain copy when deck owns the dir.
MOVE_CMD="mkdir -p '${PLUGIN_DIR}' && rsync -a --delete '${TEMP_REMOTE}/' '${PLUGIN_DIR}/' && rm -rf '${TEMP_REMOTE}'"

MOVED=0
if ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "sudo -n bash -c \"${MOVE_CMD}\"" 2>/dev/null; then
  MOVED=1
  echo "[deploy] Moved with sudo -n (NOPASSWD)"
fi

if [[ "$MOVED" == "0" ]] && [[ -n "$SUDO_PASS" ]]; then
  if ssh "${SSH_OPTS[@]}" "${USER_NAME}@${HOST}" "printf '%s\n' '${SUDO_PASS}' | sudo -S bash -c \"${MOVE_CMD}\" 2>/dev/null"; then
    MOVED=1
    echo "[deploy] Moved with sudo -S"
  fi
fi

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
  # The loader unit only signals its main PID, so kill the whole cgroup before restarting.
  if [[ -n "${SUDO_PASS}" ]]; then
    ssh "${SSH_ALIVE[@]}" "${USER_NAME}@${HOST}" \
      "test -f '${PLUGIN_DIR}/dist/index.js' || echo '[deploy] WARN: index.js missing'; \
       printf '%s\n' '${SUDO_PASS}' | sudo -S bash -c 'systemctl kill plugin_loader.service; sleep 2; systemctl kill -s KILL plugin_loader.service; systemctl restart plugin_loader.service' 2>/dev/null; \
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
