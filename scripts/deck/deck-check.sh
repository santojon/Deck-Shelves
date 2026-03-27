
#!/usr/bin/env bash
set -euo pipefail
HOST="${DECK_HOST:-${1:-}}"
USER_NAME="${DECK_USER:-${2:-deck}}"
if [[ -z "$HOST" ]]; then
  echo "Set DECK_HOST or pass the host as first argument." >&2
  exit 1
fi
ssh "${USER_NAME}@${HOST}" 'echo connected to $(hostname); uname -a; echo; ls -ld ~/homebrew ~/homebrew/plugins 2>/dev/null || true'
