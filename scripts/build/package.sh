
#!/usr/bin/env bash
set -euo pipefail

NAME="Deck Shelves"
VERSION="$(node -p "require('./package.json').version")"
STAGE_ROOT="build/package"
PLUGIN_DIR="${STAGE_ROOT}/${NAME}"
ZIP="Deck-Shelves-v${VERSION}.zip"

pnpm run build:release

rm -rf build "$ZIP"
mkdir -p "$PLUGIN_DIR/dist"

python3 -c "
import json
with open('plugin.json') as f: data = json.load(f)
data.pop('flags', None)
with open('${PLUGIN_DIR}/plugin.json', 'w') as f: json.dump(data, f, indent=2)
"

python3 -c "
import json
with open('package.json') as f: data = json.load(f)
out = {k: data[k] for k in ('name','version','description','author','license') if k in data}
with open('${PLUGIN_DIR}/package.json', 'w') as f: json.dump(out, f, indent=2)
"

cp main.py "$PLUGIN_DIR/main.py"
cp README.md "$PLUGIN_DIR/README.md"
cp LICENSE "$PLUGIN_DIR/LICENSE"
rsync -a dist/ "$PLUGIN_DIR/dist/"
if [[ -d assets ]]; then mkdir -p "$PLUGIN_DIR/assets" && rsync -a assets/ "$PLUGIN_DIR/assets/"; fi
if [[ -d i18n ]]; then mkdir -p "$PLUGIN_DIR/i18n" && rsync -a i18n/ "$PLUGIN_DIR/i18n/"; fi

(
  cd "$STAGE_ROOT"
  zip -qr "../../$ZIP" "$NAME"
)

echo "[package] Created installable archive: $ZIP"
