
#!/usr/bin/env bash
set -euo pipefail

NAME="Deck Shelves"
VERSION="$(node -p "require('./package.json').version")"
STAGE_ROOT="build/package"
PLUGIN_DIR="${STAGE_ROOT}/${NAME}"
ZIP="Deck-Shelves-v${VERSION}.zip"

# Build in development mode to avoid minification
pnpm run build

rm -rf build "$ZIP"
mkdir -p "$PLUGIN_DIR/dist"

# Copy plugin.json and package.json verbatim (do not alter)
cp plugin.json "${PLUGIN_DIR}/plugin.json"
cp package.json "${PLUGIN_DIR}/package.json"

# Copy backend and docs
cp main.py "$PLUGIN_DIR/main.py"
cp README.md "$PLUGIN_DIR/README.md"
cp LICENSE "$PLUGIN_DIR/LICENSE"

# Ensure backend is executable
chmod +x "$PLUGIN_DIR/main.py"

# Copy built frontend (non-minified build expected from development mode)
rsync -a dist/ "$PLUGIN_DIR/dist/"

# Copy assets but exclude screenshots to keep bundle smaller
if [[ -d assets ]]; then
  mkdir -p "$PLUGIN_DIR/assets" && rsync -a --exclude 'screenshots/' assets/ "$PLUGIN_DIR/assets/"
fi

# Copy i18n
if [[ -d i18n ]]; then mkdir -p "$PLUGIN_DIR/i18n" && rsync -a i18n/ "$PLUGIN_DIR/i18n/"; fi

# Do not include source files in release package (single bundled index.js desired)

(
  cd "$STAGE_ROOT"
  zip -qr "../../$ZIP" "$NAME"
)
echo "[package] Created installable archive: $ZIP"

# Verify package integrity and permissions
if ! bash "$(dirname "$0")/verify-package.sh" "$(pwd)/$ZIP"; then
  echo "[package] Package verification failed!" >&2
  exit 1
fi
