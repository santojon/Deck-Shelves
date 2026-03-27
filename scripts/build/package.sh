
#!/usr/bin/env bash
set -euo pipefail

SLUG="$(node -p 'require("./package.json").name')"
VERSION="$(node -p 'require("./package.json").version')"
STAGE_ROOT="build/package"
PLUGIN_DIR="${STAGE_ROOT}/${SLUG}"
ZIP="${SLUG}-v${VERSION}.zip"

# Build in development mode to avoid minification
pnpm run build

rm -rf build "$ZIP"
mkdir -p "$PLUGIN_DIR/dist"

# Copy and sanitize plugin.json: remove "debug" from flags but keep the flags field
node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('plugin.json'));p.flags = (Array.isArray(p.flags)?p.flags:[]).filter(f=>f!=='debug'); if(!Array.isArray(p.flags)) p.flags=[]; fs.writeFileSync(require('path').resolve(process.cwd(),'${PLUGIN_DIR}','plugin.json'), JSON.stringify(p,null,2));"
cp package.json "${PLUGIN_DIR}/package.json"

# Copy backend and docs (do not include README or assets in package)
cp main.py "$PLUGIN_DIR/main.py"
cp LICENSE "$PLUGIN_DIR/LICENSE"

# Ensure staging files are owned by the current user (avoid root-owned files)
chown -R "$(id -un)":"$(id -gn)" "$PLUGIN_DIR" || true

# Ensure backend and other relevant files are writable and directories are traversable
chmod -R u+rwX "$PLUGIN_DIR"
# Ensure the Python backend is explicitly executable
if [[ -f "$PLUGIN_DIR/main.py" ]]; then
  chmod u+x "$PLUGIN_DIR/main.py"
fi

# Copy built frontend (non-minified build expected from development mode)
rsync -a dist/ "$PLUGIN_DIR/dist/"

# Do not include assets/ in the release package (assets are intentionally excluded)

# Copy i18n
if [[ -d i18n ]]; then mkdir -p "$PLUGIN_DIR/i18n" && rsync -a i18n/ "$PLUGIN_DIR/i18n/"; fi

# Do not include source files in release package (single bundled index.js desired)

(
  cd "$STAGE_ROOT"
  zip -qr "../../$ZIP" "$SLUG"
)
echo "[package] Created installable archive: $ZIP"

# Verify package integrity and permissions
if ! bash "$(dirname "$0")/verify-package.sh" "$(pwd)/$ZIP"; then
  echo "[package] Package verification failed!" >&2
  exit 1
fi
