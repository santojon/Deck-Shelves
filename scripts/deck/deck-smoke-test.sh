#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

HOST="${1:-${DECK_HOST:-}}"
if [[ -z "$HOST" ]]; then
  echo "Usage: $0 [host]  (or set DECK_HOST in .env)" >&2
  exit 1
fi

echo "[smoke] running mount check"
bash "${SCRIPT_DIR}/deck-diag.sh" "${HOST}" mount

echo "[smoke] running rows check"
bash "${SCRIPT_DIR}/deck-diag.sh" "${HOST}" rows

echo "[smoke] running smoke assertions"
bash "${SCRIPT_DIR}/deck-diag.sh" "${HOST}" smoke

echo "[smoke] PASS"
