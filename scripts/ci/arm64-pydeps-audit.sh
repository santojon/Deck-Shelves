#!/bin/bash
# ARM64 backend dependency audit: every runtime Python dependency must resolve a
# Linux aarch64 wheel, so the Deck Shelves backend installs on an ARM64 device
# (Steam Frame / ARM SteamOS) without a compiler. `pip download --platform` fetches
# wheels for the target platform from any host, so this runs on an x86 CI runner.
# Usage: arm64-pydeps-audit.sh [requirements.txt]
set -euo pipefail

req="${1:-requirements.txt}"
[[ -f "$req" ]] || { echo "arm64-pydeps-audit: no $req — nothing to audit"; exit 0; }
grep -qE '^[[:space:]]*[^#[:space:]]' "$req" || { echo "arm64-pydeps-audit: $req has no deps — OK"; exit 0; }

tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
echo "arm64-pydeps-audit: resolving linux/aarch64 wheels for $req"
# cp311 manylinux2014 is the broad baseline; --no-deps keeps it to the declared deps.
if python3 -m pip download --only-binary=:all: --no-deps \
    --platform manylinux2014_aarch64 --python-version 311 --implementation cp --abi cp311 \
    -r "$req" -d "$tmp"; then
  echo "arm64-pydeps-audit OK: every dependency has a linux/aarch64 wheel:"
  ls -1 "$tmp" | sed 's/^/  /'
else
  echo "::error::arm64-pydeps-audit: a runtime dependency has NO linux/aarch64 wheel — classify it (pure-python? source-buildable? x86-only?) before shipping ARM64."
  exit 1
fi
