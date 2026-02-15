    #!/usr/bin/env bash
    set -euo pipefail

    # Usage:
    #   DECK_HOST=steamdeck.local scripts/install_deck.sh
    # or:
    #   DECK_HOST=192.168.0.50 DECK_USER=deck scripts/install_deck.sh
    #
    # Requires:
    #   - SSH access to the Deck (ssh-key recommended)
    #   - Decky Loader installed
    #
    DECK_HOST="${DECK_HOST:-steamdeck.local}"
    DECK_USER="${DECK_USER:-deck}"

    ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    "${ROOT_DIR}/scripts/build_dist.sh"
    "${ROOT_DIR}/scripts/package_zip.sh"

    PLUGIN_NAME="$(python3 - <<'PY'
import json
print(json.load(open("plugin.json","r",encoding="utf-8"))["name"])
PY
    )"
    ZIP_PATH="${ROOT_DIR}/out/${PLUGIN_NAME}.zip"

    echo "➡️  Copying ${ZIP_PATH} to ${DECK_USER}@${DECK_HOST} ..."
    scp "${ZIP_PATH}" "${DECK_USER}@${DECK_HOST}:/tmp/${PLUGIN_NAME}.zip"

    echo "➡️  Installing on Decky plugins folder ..."
    ssh "${DECK_USER}@${DECK_HOST}" "mkdir -p ~/homebrew/plugins && unzip -o /tmp/${PLUGIN_NAME}.zip -d ~/homebrew/plugins"

    # Try to restart Decky (best effort; command can vary)
    echo "➡️  Restarting Decky (best effort) ..."
    ssh "${DECK_USER}@${DECK_HOST}" "systemctl --user restart plugin_loader.service 2>/dev/null || true; systemctl --user restart decky.service 2>/dev/null || true"

    echo "✅ Installed. Open Decky and enable the plugin."
