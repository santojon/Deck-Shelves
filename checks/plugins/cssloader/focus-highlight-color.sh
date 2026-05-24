check_name="CSS Loader Theme"
check_version="Focus Highlight Color"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # 1. Round Compatibility detection probe lives in cssLoaderDetect.
  if grep -q 'isFocusRoundCompatActive' "$src/core/cssLoaderDetect.ts" 2>/dev/null; then
    echo "  ✅ isFocusRoundCompatActive() detection present"
    ((pass++))
  else
    echo "  ❌ Missing isFocusRoundCompatActive() probe"
    ((fail++))
  fi

  # 2. Detection uses the unique theme keyframe signature (appportrait_blinker
  # ... _flangrande), not a name-based scan. The patch only ships that
  # keyframe; theme-name matching is unreliable in most CSS Loader builds.
  if grep -q 'appportrait_blinker' "$src/core/cssLoaderDetect.ts" 2>/dev/null \
     && grep -q 'flangrande' "$src/core/cssLoaderDetect.ts" 2>/dev/null; then
    echo "  ✅ Detection uses unique keyframe signature (appportrait_blinker + flangrande)"
    ((pass++))
  else
    echo "  ❌ Detection signature does not match the Round Compatibility patch"
    ((fail++))
  fi

  # 3. HomeInject mirrors the flag onto <html> so rules can reach the native
  # FocusRing subtree (which lives outside .deck-shelves-root).
  if grep -q 'data-ds-theme-focus-round-compat' "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ Round Compat flag set on .deck-shelves-root / <html>"
    ((pass++))
  else
    echo "  ❌ Round Compat flag attribute not wired in HomeInject"
    ((fail++))
  fi

  # 4. Suppression rule for our own focus drop-shadow + Game Cover Shine ::after
  # under the Round Compat flag — keeps DS cards visually in sync with the
  # theme's "no focus indicator" mode.
  if grep -q 'data-ds-theme-focus-round-compat="true"' "$src/components/shelf/shelfStyles.ts" 2>/dev/null; then
    echo "  ✅ Round Compat suppression rule present in shelfStyles"
    ((pass++))
  else
    echo "  ❌ Missing Round Compat suppression rule in shelfStyles"
    ((fail++))
  fi

  # 5. Theme variables (--flangrande-*) are only READ, never overwritten. Even
  # when not explicitly referenced in source, the theme's animation runs on
  # the native FocusRing — DS does NOT set these variables.
  if grep -rqi 'flangrande.*:[^=]*=\|--flangrande[^"]*"\s*:' "$src" 2>/dev/null; then
    echo "  ❌ Source writes to flangrande theme variables (coupling)"
    ((fail++))
  else
    echo "  ✅ Theme variables read-only (no flangrande writes)"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
