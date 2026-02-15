#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read_json() {
python3 - "$1" "$2" <<'PY'
import json,sys
p=sys.argv[1]
k=sys.argv[2]
with open(p,'r',encoding='utf-8') as f:
  j=json.load(f)
print(j.get(k,''))
PY
}

PLUGIN_DISPLAY_NAME="$(read_json "${ROOT_DIR}/plugin.json" name)"
PLUGIN_VERSION="$(read_json "${ROOT_DIR}/plugin.json" version)"
PLUGIN_DIR="DeckShelves"

OUT_DIR="${ROOT_DIR}/out"
mkdir -p "${OUT_DIR}"

if [ ! -d "${ROOT_DIR}/dist" ]; then
  echo "dist/ not found. Run scripts/build_dist.sh first."
  exit 1
fi

bash "${ROOT_DIR}/scripts/fix_dist.sh"

STAGE="${OUT_DIR}/${PLUGIN_DIR}"
rm -rf "${STAGE}"
mkdir -p "${STAGE}"

cp -R "${ROOT_DIR}/dist" "${STAGE}/dist"
cp "${ROOT_DIR}/plugin.json" "${STAGE}/plugin.json"
cp "${ROOT_DIR}/main.py" "${STAGE}/main.py"
[ -f "${ROOT_DIR}/settings.py" ] && cp "${ROOT_DIR}/settings.py" "${STAGE}/settings.py"
[ -d "${ROOT_DIR}/assets" ] && cp -R "${ROOT_DIR}/assets" "${STAGE}/assets"
[ -d "${ROOT_DIR}/i18n" ] && cp -R "${ROOT_DIR}/i18n" "${STAGE}/i18n"
[ -d "${ROOT_DIR}/defaults" ] && cp -R "${ROOT_DIR}/defaults" "${STAGE}/defaults"
[ -f "${ROOT_DIR}/LICENSE" ] && cp "${ROOT_DIR}/LICENSE" "${STAGE}/LICENSE"
[ -f "${ROOT_DIR}/README.md" ] && cp "${ROOT_DIR}/README.md" "${STAGE}/README.md"

ZIP_NAME="DeckShelves-v${PLUGIN_VERSION}.zip"
rm -f "${OUT_DIR}/${ZIP_NAME}"

(cd "${OUT_DIR}" && zip -r "${ZIP_NAME}" "${PLUGIN_DIR}" -x "*.DS_Store" "__MACOSX/*")

echo "✅ Created: ${OUT_DIR}/${ZIP_NAME}"
echo "   Display name: ${PLUGIN_DISPLAY_NAME}"
