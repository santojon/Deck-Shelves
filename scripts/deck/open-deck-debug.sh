
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

HOST="${1:-${DECK_HOST:-}}"
CDP_HOST="${DECK_CDP_HOST:-${HOST}}"
CDP_PORT="${DECK_CDP_PORT:-8081}"
if [[ -z "$HOST" ]]; then
  echo "Set DECK_HOST or pass the host as first argument." >&2
  exit 1
fi
URL="http://${CDP_HOST}:${CDP_PORT}"
echo "[open:deck:debug] ${URL}"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
fi
