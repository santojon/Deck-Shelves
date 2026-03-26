#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <host>"
  exit 1
fi

HOST="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[smoke] running mount check"
bash "${SCRIPT_DIR}/deck-diag.sh" "${HOST}" mount

echo "[smoke] running rows check"
bash "${SCRIPT_DIR}/deck-diag.sh" "${HOST}" rows

echo "[smoke] running smoke assertions"
bash "${SCRIPT_DIR}/deck-diag.sh" "${HOST}" smoke

echo "[smoke] PASS"
