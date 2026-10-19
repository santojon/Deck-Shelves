check_name="CSS Loader Theme"
check_version="Focus Highlight Color"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # 1. Round Compatibility detection probe: its theme adapter under src/themes,
  # re-exported by the cssLoaderDetect facade.
  local adapter="$src/themes/adapters/focusRoundCompat.ts"
  if grep -q 'isFocusRoundCompatActive' "$adapter" 2>/dev/null; then
    echo "  ✅ isFocusRoundCompatActive() detection present"
    ((pass++))
  else
    echo "  ❌ Missing isFocusRoundCompatActive() probe"
    ((fail++))
  fi

  # 2. Detection uses the unique theme keyframe signature (appportrait_blinker
  # ... _flangrande), not a name-based scan. The patch only ships that
  # keyframe; theme-name matching is unreliable in most CSS Loader builds.
  if grep -q 'appportrait_blinker' "$adapter" 2>/dev/null \
     && grep -q 'flangrande' "$adapter" 2>/dev/null; then
    echo "  ✅ Detection uses unique keyframe signature (appportrait_blinker + flangrande)"
    ((pass++))
  else
    echo "  ❌ Detection signature does not match the Round Compatibility patch"
    ((fail++))
  fi

  # 3. The flag is mirrored onto <html> (the adapter's htmlFlags, applied by
  # the theme registry) so rules can reach the native FocusRing subtree, which
  # lives outside .deck-shelves-root.
  if grep -q 'focus-round-compat' "$adapter" 2>/dev/null \
     && grep -q 'htmlFlags' "$adapter" 2>/dev/null; then
    echo "  ✅ Round Compat flag set on .deck-shelves-root / <html>"
    ((pass++))
  else
    echo "  ❌ Round Compat flag attribute not wired in HomeInject"
    ((fail++))
  fi

  # 4. Suppression rule for focus drop-shadow + Game Cover Shine ::after under
  # Round Compat — lives in the theme adapter (src/themes/adapters) since the
  # adapter split; the base stylesheet no longer carries a root-level rule.
  if grep -q 'data-ds-theme-focus-round-compat="true"' "$src/themes/adapters/focusRoundCompat.ts" "$src/components/shelf/shelfStylesheetTemplate.ts" "$src/components/shelf/shelfStyles.ts" 2>/dev/null; then
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
