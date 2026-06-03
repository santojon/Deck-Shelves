#!/usr/bin/env bash
# Orchestrated dependency upgrade flow for Deck Shelves.
#
# Modes (first arg):
#   check       — list outdated dependencies; no writes
#   pnpm        — upgrade pnpm itself + the `packageManager` pin
#   safe        — `pnpm update` (stays within current semver ranges)
#   major       — `pnpm update --latest` for prod AND dev deps (may break)
#   verify      — typecheck + test + build (sanity check after an update)
#   all         — pnpm + safe + verify, prompting before each destructive step
#
# Examples:
#   bash scripts/devtools/update.sh check
#   bash scripts/devtools/update.sh all
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

# Pretty prefixes — kept short so log lines stay scannable.
_blue()  { printf "\033[34m▶\033[0m %s\n" "$1"; }
_green() { printf "\033[32m✓\033[0m %s\n" "$1"; }
_amber() { printf "\033[33m⚠\033[0m %s\n" "$1"; }
_red()   { printf "\033[31m✗\033[0m %s\n" "$1" >&2; }

confirm() {
  # Non-interactive (CI, piped) skips the prompt and proceeds.
  if [[ ! -t 0 ]] || [[ "${YES:-0}" == "1" ]]; then return 0; fi
  read -r -p "$1 [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]]
}

cmd_check() {
  _blue "Checking outdated dependencies (semver-safe + major candidates)…"
  pnpm outdated || true   # pnpm outdated returns non-zero when stale; ignore for the check pass
}

cmd_pnpm() {
  local current
  current="$(pnpm -v 2>/dev/null || echo unknown)"
  _blue "Current pnpm: $current"
  if command -v corepack >/dev/null 2>&1; then
    _blue "Upgrading pnpm via corepack…"
    corepack use pnpm@latest
  else
    _amber "corepack not available — falling back to npm install -g pnpm@latest"
    confirm "Install latest pnpm globally via npm?" || { _amber "Skipped pnpm upgrade"; return 0; }
    npm install -g pnpm@latest
  fi
  local new
  new="$(pnpm -v 2>/dev/null || echo unknown)"
  _green "pnpm now at: $new"

  # Sync the package.json packageManager pin so contributors get the same
  # version on first `corepack enable`.
  if [[ "$new" != "unknown" ]] && [[ -f package.json ]]; then
    if grep -q '"packageManager"' package.json; then
      _blue "Updating packageManager pin in package.json…"
      node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); p.packageManager='pnpm@'+'$new'; fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');"
      _green "packageManager pinned to pnpm@$new"
    fi
  fi
}

cmd_safe() {
  _blue "Applying semver-safe updates (no major bumps)…"
  pnpm update
  pnpm install
  _green "Safe update done"
}

cmd_major() {
  _blue "Applying major updates (may include breaking changes)…"
  confirm "This will move dependencies to their latest major versions. Continue?" || { _amber "Skipped major update"; return 0; }
  pnpm update --latest
  pnpm install
  _green "Major update done"
}

cmd_verify() {
  _blue "Running typecheck…"
  pnpm run typecheck
  _blue "Running tests…"
  pnpm test --run
  _blue "Running production build…"
  pnpm run build:release
  _green "Verification passed"
}

cmd_all() {
  cmd_check
  echo
  confirm "Upgrade pnpm itself before updating packages?" && cmd_pnpm || _amber "Skipped pnpm upgrade"
  echo
  cmd_safe
  echo
  confirm "Run major-version updates too?" && cmd_major || _amber "Skipped major bumps (re-run with --major to apply later)"
  echo
  cmd_verify
}

main() {
  local mode="${1:-help}"
  case "$mode" in
    check)   cmd_check ;;
    pnpm)    cmd_pnpm ;;
    safe)    cmd_safe ;;
    major)   cmd_major ;;
    verify)  cmd_verify ;;
    all)     cmd_all ;;
    help|--help|-h|"")
      cat <<EOF
Usage: bash scripts/devtools/update.sh <mode>

Modes:
  check      List outdated dependencies (read-only).
  pnpm       Upgrade pnpm itself + sync the package.json pin.
  safe       Apply semver-safe updates (no major bumps).
  major      Apply latest updates including majors (asks first).
  verify     typecheck + test + build (sanity check post-update).
  all        Run check, optionally upgrade pnpm, apply safe updates,
             optionally apply majors, then verify.

Env vars:
  YES=1      Skip every confirmation prompt (CI-friendly).
EOF
      ;;
    *)
      _red "Unknown mode: $mode"
      exit 2
      ;;
  esac
}

main "$@"
