#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

SLUG="$(node -p 'require("./package.json").name')"

if [[ -z "$ZIP_PATH" ]]; then
  ZIP_PATH="$(ls ${SLUG}-v*.zip 2>/dev/null | head -n1 || true)"
fi

if [[ -z "$ZIP_PATH" || ! -f "$ZIP_PATH" ]]; then
  echo "Usage: verify-package.sh <path-to-zip> (or run from repo with ${SLUG}-v*.zip present)" >&2
  exit 2
fi

TMPDIR="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

unzip -q "$ZIP_PATH" -d "$TMPDIR"
# Detect top-level directory inside the extracted ZIP (robust to spaces/hyphens/casing)
PKG_DIR="$(find "$TMPDIR" -maxdepth 1 -mindepth 1 -type d | head -n1)"
if [[ -z "$PKG_DIR" ]]; then
  echo "[verify] Could not determine package directory inside ZIP" >&2
  exit 4
fi

fail=0
check_file() {
  if [[ ! -e "$PKG_DIR/$1" ]]; then
    echo "[verify] Missing: $1" >&2
    fail=1
  else
    echo "[verify] Found: $1"
  fi
}

check_file "plugin.json"
check_file "package.json"
check_file "main.py"
check_file "dist/index.js"
check_file "i18n/en-US.json"


# Ensure main.py is executable inside the package
if [[ -x "$PKG_DIR/main.py" ]]; then
  echo "[verify] main.py is executable"
else
  echo "[verify] main.py is NOT executable" >&2
  fail=1
fi

# Ensure packaged plugin.json has a flags field and does not include the debug flag
node -e '
const fs = require("fs");
const p = JSON.parse(fs.readFileSync(process.argv[1]));
const flags = Array.isArray(p.flags) ? p.flags : null;
if (!Array.isArray(flags)) { console.error("[verify] plugin.json.flags missing or not an array"); process.exit(2); }
if (flags.includes("debug")) { console.error("[verify] plugin.json.flags must not include \"debug\""); process.exit(3); }
console.log("[verify] plugin.json flags OK (no debug)");
' "$PKG_DIR/plugin.json"


if ! diff -u package.json "$PKG_DIR/package.json" >/dev/null 2>&1; then
  echo "[verify] package.json in ZIP differs from repo version" >&2
  diff -u package.json "$PKG_DIR/package.json" || true
  fail=1
else
  echo "[verify] package.json matches repo"
fi

# Since README and assets are intentionally excluded from packaged release,
# ensure verification does not require them. Proceed with other checks.
if [[ $fail -ne 0 ]]; then
  echo "[verify] Package verification failed" >&2
  exit 3
fi

echo "[verify] Package OK: $ZIP_PATH"
exit 0
