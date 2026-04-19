#!/usr/bin/env bash
set -euo pipefail

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
  echo "Usage: pnpm run deck:setup <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi

PLUGIN_SLUG="deck-shelves"
REMOTE_BASE="/home/${USER_NAME}/homebrew/plugins"
SLUG_DIR="${REMOTE_BASE}/${PLUGIN_SLUG}"

q() {
  printf "%q" "$1"
}

REMOTE_CMD="
set -euo pipefail;
remove_if_plain_dir() {
  local p=\"\$1\";
  if [ -e \"\$p\" ] && [ ! -L \"\$p\" ]; then
    rm -rf \"\$p\" 2>/dev/null || true;
  fi
};
fix_ownership() {
  chown -R $(q "$USER_NAME"):$(q "$USER_NAME") $(q "$REMOTE_BASE") 2>/dev/null || true;
};
mkdir -p $(q "$SLUG_DIR") $(q "$REMOTE_BASE");
if [ $(q "$HARD") = 1 ]; then
  rm -rf $(q "$SLUG_DIR") 2>/dev/null || true;
  mkdir -p $(q "$SLUG_DIR");
fi;
remove_if_plain_dir $(q "$SLUG_DIR");
fix_ownership;
"

ssh -tt "${USER_NAME}@${HOST}" "bash -lc $(q "$REMOTE_CMD")"

echo "[deck:setup] Using ${SLUG_DIR} as runtime plugin directory"
