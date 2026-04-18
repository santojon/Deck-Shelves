#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

HOST="${1:-${DECK_HOST:-}}"
USER_NAME="${2:-${DECK_USER:-deck}}"
if [[ -z "$HOST" ]]; then
  echo "Usage: pnpm run upload:deckzip <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi

ZIP="$(bash scripts/build/package.sh | sed -n 's/^\[package\] Created installable archive: //p' | tail -n1)"
if [[ -z "$ZIP" || ! -f "$ZIP" ]]; then
  VERSION="$(node -p 'require("./package.json").version')"
  SLUG="$(node -p 'require("./package.json").name')"
  ZIP="${SLUG}-v${VERSION}.zip"
fi

REMOTE_PATH="/home/${USER_NAME}/Downloads/${ZIP}"
ssh "${USER_NAME}@${HOST}" "rm -f '${REMOTE_PATH}'"
rsync -az "${ZIP}" "${USER_NAME}@${HOST}:${REMOTE_PATH}"

echo "[upload:deckzip] Uploaded ${ZIP} to ${USER_NAME}@${HOST}:${REMOTE_PATH}"
