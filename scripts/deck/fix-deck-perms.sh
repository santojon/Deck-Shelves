#!/usr/bin/env bash
set -euo pipefail

# Load .env from project root if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

HOST="${1:-${DECK_HOST:-}}"
USER_NAME="${2:-${DECK_USER:-deck}}"
PLUGIN_SLUG="${3:-deck-shelves}"
SUDO_PASS="${DECK_SUDO_PASS:-}"

if [[ -z "$HOST" ]]; then
  echo "Usage: $0 <deck-host-or-ip> [deck-user] [plugin-slug]" >&2
  exit 1
fi

REMOTE_PLUGIN_DIR="/home/${USER_NAME}/homebrew/plugins/${PLUGIN_SLUG}"

# Fix ownership of only our plugin directory using sudo -S (non-interactive).
# Pipe the password via stdin to avoid TTY requirement.
if [[ -n "$SUDO_PASS" ]]; then
  ssh "${USER_NAME}@${HOST}" \
    "printf '%s\n' '${SUDO_PASS}' | sudo -S bash -c \"mkdir -p '${REMOTE_PLUGIN_DIR}' && chown -R ${USER_NAME}:${USER_NAME} '${REMOTE_PLUGIN_DIR}' && chmod -R u+rwX '${REMOTE_PLUGIN_DIR}'\" 2>/dev/null || true"
else
  ssh "${USER_NAME}@${HOST}" \
    "mkdir -p '${REMOTE_PLUGIN_DIR}' && chown -R ${USER_NAME}:${USER_NAME} '${REMOTE_PLUGIN_DIR}' 2>/dev/null || true && chmod -R u+rwX '${REMOTE_PLUGIN_DIR}' 2>/dev/null || true"
fi

echo "[fix-perms] ${REMOTE_PLUGIN_DIR} ownership/perms fixed"
