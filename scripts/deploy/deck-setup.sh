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
  echo "Usage: pnpm run deck:setup <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi

PLUGIN_NAME="Deck Shelves"
PLUGIN_SLUG="deck-shelves"
REMOTE_BASE="/home/${USER_NAME}/homebrew/plugins"
DEV_BASE="/home/${USER_NAME}/dev-plugins"
DEV_DIR="${DEV_BASE}/${PLUGIN_SLUG}"
DISPLAY_DIR="${REMOTE_BASE}/${PLUGIN_NAME}"
SLUG_DIR="${REMOTE_BASE}/${PLUGIN_SLUG}"

q() {
  printf "%q" "$1"
}

REMOTE_CMD="
set -euo pipefail;
remove_if_plain_dir() {
  local p=\"\$1\";
  if [ -e \"\$p\" ] && [ ! -L \"\$p\" ]; then
    rm -rf \"\$p\" 2>/dev/null || sudo rm -rf \"\$p\";
  fi
};
ensure_link() {
  local target=\"\$1\";
  local link=\"\$2\";
  ln -sfn \"\$target\" \"\$link\" 2>/dev/null || sudo ln -sfn \"\$target\" \"\$link\";
};
fix_ownership() {
  chown -R $(q "$USER_NAME"):$(q "$USER_NAME") $(q "$DEV_BASE") 2>/dev/null || sudo chown -R $(q "$USER_NAME"):$(q "$USER_NAME") $(q "$DEV_BASE");
};
mkdir -p $(q "$DEV_BASE") $(q "$DEV_DIR") $(q "$REMOTE_BASE");
if [ $(q "$HARD") = 1 ]; then
  rm -rf $(q "$DEV_DIR") 2>/dev/null || sudo rm -rf $(q "$DEV_DIR");
  mkdir -p $(q "$DEV_DIR");
fi;
remove_if_plain_dir $(q "$DISPLAY_DIR");
remove_if_plain_dir $(q "$SLUG_DIR");
ensure_link $(q "$DEV_DIR") $(q "$DISPLAY_DIR");
ensure_link $(q "$DEV_DIR") $(q "$SLUG_DIR");
fix_ownership;
"

ssh -tt "${USER_NAME}@${HOST}" "bash -lc $(q "$REMOTE_CMD")"

echo "[deck:setup] Using ${DEV_DIR} as runtime source"
echo "[deck:setup] Symlinks ensured: ${DISPLAY_DIR} and ${SLUG_DIR}"
