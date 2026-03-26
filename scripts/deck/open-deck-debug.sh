
#!/usr/bin/env bash
set -euo pipefail
HOST="${DECK_HOST:-${1:-}}"
if [[ -z "$HOST" ]]; then
  echo "Set DECK_HOST or pass the host as first argument." >&2
  exit 1
fi
URL="http://${HOST}:8081"
echo "[open:deck:debug] ${URL}"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
fi
