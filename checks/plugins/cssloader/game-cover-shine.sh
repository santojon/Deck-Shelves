check_name="CSS Loader Theme"
check_version="Game Cover Shine Animation Color"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -q 'useNativeCardClassInjection' "$src/components/shelf/GameCard.tsx" 2>/dev/null; then
    echo "  ✅ Native card class promoted onto .ds-card (shine reaches DS cards)"
    ((pass++))
  else
    echo "  ❌ Missing native card class promotion — shine won't reach DS cards"
    ((fail++))
  fi

  # Forcing ::after opacity turns the theme's focus animation into a static stripe.
  local _shine_files="$src/components/shelf/shelfStylesheetTemplate.ts $src/components/shelf/shelfStyles.ts $src/themes/adapters/focusRoundCompat.ts"
  if grep -qs '::after' $_shine_files \
     && ! grep -qs '\.ds-card::after\s*{[^}]*opacity:\s*1' $_shine_files; then
    echo "  ✅ ::after opacity left to the theme (no forced opacity 1)"
    ((pass++))
  else
    echo "  ❌ ::after opacity may be force-overridden — breaks shine animation"
    ((fail++))
  fi

  if grep -qs 'data-ds-theme-focus-round-compat="true"' $_shine_files \
     && grep -qs '\.ds-card.*::after' $_shine_files; then
    echo "  ✅ Shine ::after suppressed under Round Compat flag"
    ((pass++))
  else
    echo "  ❌ Missing Round Compat suppression for shine ::after"
    ((fail++))
  fi

  if grep -rqi 'flangrande-game-cover-shine-color\s*:[^"]*=\|--flangrande-game-cover-shine-color[^"]*"\s*:' "$src" 2>/dev/null; then
    echo "  ❌ Source writes to --flangrande-game-cover-shine-color (coupling)"
    ((fail++))
  else
    echo "  ✅ Theme variable read-only"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
