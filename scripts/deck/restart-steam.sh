
#!/usr/bin/env bash
set -euo pipefail
HOST="${1:-${DECK_HOST:-}}"
USER_NAME="${2:-${DECK_USER:-deck}}"
if [[ -z "$HOST" ]]; then
  echo "Usage: pnpm run restart:steam <deck-host-or-ip> [deck-user]" >&2
  exit 1
fi
ssh "${USER_NAME}@${HOST}" "killall steam >/dev/null 2>&1 || true"
