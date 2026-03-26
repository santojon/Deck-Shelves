#!/usr/bin/env bash
set -euo pipefail

HOST="${1:-${DECK_HOST:-}}"
USER_NAME="${2:-${DECK_USER:-deck}}"
if [[ -z "$HOST" ]]; then
  echo "Usage: $0 <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi

# Ensure plugin development folder exists and is writable by the deck user
ssh "${USER_NAME}@${HOST}" "mkdir -p \"/home/${USER_NAME}/dev-plugins\" && chown -R ${USER_NAME}:${USER_NAME} \"/home/${USER_NAME}/dev-plugins\" 2>/dev/null && chmod -R u+rwX \"/home/${USER_NAME}/dev-plugins\" 2>/dev/null" || \
  ssh -t "${USER_NAME}@${HOST}" "sudo chown -R ${USER_NAME}:${USER_NAME} '/home/${USER_NAME}/dev-plugins' && sudo chmod -R u+rwX '/home/${USER_NAME}/dev-plugins'"

echo "[fix-perms] /home/${USER_NAME}/dev-plugins ownership/perms fixed"
