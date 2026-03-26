#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <host> <mode>"
  echo "Modes: mount rows smoke"
  exit 1
fi

HOST="$1"
MODE="$2"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_SCRIPT="/tmp/deck-shelves-cdp-probe.py"

scp "${SCRIPT_DIR}/../devtools/deck/cdp_probe.py" "deck@${HOST}:${REMOTE_SCRIPT}" >/dev/null
ssh "deck@${HOST}" "python3 ${REMOTE_SCRIPT} --mode ${MODE}"
