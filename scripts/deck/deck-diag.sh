#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

HOST="${1:-${DECK_HOST:-}}"
MODE="${2:-}"

if [[ -z "$HOST" || -z "$MODE" ]]; then
  echo "Usage: $0 [host] <mode>"
  echo "Modes: mount rows smoke"
  echo "HOST defaults to DECK_HOST from .env"
  exit 1
fi

USER_NAME="${DECK_USER:-deck}"
REMOTE_SCRIPT="/tmp/deck-shelves-cdp-probe.py"

scp "${SCRIPT_DIR}/../devtools/deck/cdp_probe.py" "${USER_NAME}@${HOST}:${REMOTE_SCRIPT}" >/dev/null
ssh "${USER_NAME}@${HOST}" "python3 ${REMOTE_SCRIPT} --mode ${MODE}"
