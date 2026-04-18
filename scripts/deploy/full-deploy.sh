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
  echo "Error: HOST not set. Pass as argument or set DECK_HOST in .env." >&2
  exit 1
fi

echo "Installing dependencies..."
pnpm install

echo "Building plugin..."
pnpm run build

echo "Deploying to $HOST..."
pnpm run deploy:deck:hard "$HOST"

echo "Deployment completed successfully!"