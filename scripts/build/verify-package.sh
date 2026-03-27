#!/usr/bin/env bash
set -euo pipefail

ZIP_PATH="${1:-}"
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ -z "$ZIP_PATH" ]]; then
  ZIP_PATH="$(ls Deck-Shelves-v*.zip 2>/dev/null | head -n1 || true)"
fi

if [[ -z "$ZIP_PATH" || ! -f "$ZIP_PATH" ]]; then
  echo "Usage: verify-package.sh <path-to-zip> (or run from repo with Deck-Shelves-v*.zip present)" >&2
  exit 2
fi

TMPDIR="$(mktemp -d)"
cleanup() { rm -rf "$TMPDIR"; }
trap cleanup EXIT

unzip -q "$ZIP_PATH" -d "$TMPDIR"
PKG_DIR="$TMPDIR/Deck Shelves"

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
check_file "assets/icon.png"

# Ensure main.py is executable inside the package
if [[ -x "$PKG_DIR/main.py" ]]; then
  echo "[verify] main.py is executable"
else
  echo "[verify] main.py is NOT executable" >&2
  fail=1
fi

# Compare plugin.json and package.json verbatim
if ! diff -u plugin.json "$PKG_DIR/plugin.json" >/dev/null 2>&1; then
  echo "[verify] plugin.json in ZIP differs from repo version" >&2
  diff -u plugin.json "$PKG_DIR/plugin.json" || true
  fail=1
else
  echo "[verify] plugin.json matches repo"
fi

if ! diff -u package.json "$PKG_DIR/package.json" >/dev/null 2>&1; then
  echo "[verify] package.json in ZIP differs from repo version" >&2
  diff -u package.json "$PKG_DIR/package.json" || true
  fail=1
else
  echo "[verify] package.json matches repo"
fi

if [[ $fail -ne 0 ]]; then
  echo "[verify] Package verification failed" >&2
  exit 3
fi

echo "[verify] Package OK: $ZIP_PATH"
exit 0
