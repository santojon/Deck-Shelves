#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-${DECK_HOST:-}}"
USER_NAME="${2:-${DECK_USER:-deck}}"
if [[ -z "$HOST" ]]; then
  echo "Usage: $0 <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi

# Ensure Homebrew plugins folder exists and is writable by the deck user
REMOTE_PLUGINS_DIR="/home/${USER_NAME}/homebrew/plugins"
ssh "${USER_NAME}@${HOST}" "mkdir -p \"${REMOTE_PLUGINS_DIR}\" && chown -R ${USER_NAME}:${USER_NAME} \"${REMOTE_PLUGINS_DIR}\" 2>/dev/null && chmod -R u+rwX \"${REMOTE_PLUGINS_DIR}\" 2>/dev/null" || \
  ssh -t "${USER_NAME}@${HOST}" "chown -R ${USER_NAME}:${USER_NAME} '${REMOTE_PLUGINS_DIR}' || sudo chown -R ${USER_NAME}:${USER_NAME} '${REMOTE_PLUGINS_DIR}'; chmod -R u+rwX '${REMOTE_PLUGINS_DIR}' || sudo chmod -R u+rwX '${REMOTE_PLUGINS_DIR}'"

echo "[fix-perms] ${REMOTE_PLUGINS_DIR} ownership/perms fixed"
