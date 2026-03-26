#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECKS_DIR="$ROOT_DIR/checks"

total_pass=0
total_fail=0
results=()

echo "╔══════════════════════════════════════════════╗"
echo "║     Deck Shelves — Compatibility Checks      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

while IFS= read -r check_file; do
  [[ -f "$check_file" ]] || continue

  check_name=""
  check_version=""

  source "$check_file"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $check_name ($check_version)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  set +e
  run_checks "$ROOT_DIR"
  fail_count=$?
  set -e

  if [[ $fail_count -eq 0 ]]; then
    results+=("✅ $check_name ($check_version)")
  else
    results+=("❌ $check_name ($check_version) — $fail_count issue(s)")
    ((total_fail += fail_count))
  fi

  unset -f run_checks
  unset check_name check_version
done < <(find "$CHECKS_DIR" -name '*.sh' -type f | sort)

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║                   Summary                    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

for r in "${results[@]}"; do
  echo "  $r"
done

echo ""
if [[ $total_fail -eq 0 ]]; then
  echo "  🎉 All compatibility checks passed!"
  exit 0
else
  echo "  ⚠️  $total_fail total issue(s) found"
  exit 1
fi
