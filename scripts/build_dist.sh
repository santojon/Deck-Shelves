#!/usr/bin/env bash
set -euo pipefail

# Clean build artifacts (safe on macOS/Linux)
rm -rf dist out .rollup.cache || true
rm -rf node_modules/.vite node_modules/.cache node_modules/.rollup.cache || true
find . -name "*.tsbuildinfo" -delete || true

# Optional full clean (VERY slow): FULL_CLEAN=1 ./scripts/build_dist.sh
if [ "${FULL_CLEAN:-0}" = "1" ]; then
  rm -rf node_modules || true
fi

# Build frontend dist using pnpm if available, otherwise npm.
if command -v pnpm >/dev/null 2>&1; then
  pnpm install
  pnpm run build
else
  npm install
  npm run build
fi

bash scripts/fix_dist.sh
echo "✅ dist built (and patched for Decky)."
