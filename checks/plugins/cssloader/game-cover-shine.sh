check_name="CSS Loader Theme"
check_version="Game Cover Shine Animation Color"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # 1. The shine animation lives on `.appportrait_LibraryItemBox` :focus ::after.
  # After CSS Loader's webpack-aware injection, it targets the hashed form of
  # `nativeCard`, which our `.ds-card` inherits via `resolveNativeCardClass`
  # — so the shine reaches DS cards automatically. Just verify the native
  # class promotion is wired (the same one ArtHero compat relies on).
  if grep -q 'resolveNativeCardClass' "$src/components/shelf/GameCard.tsx" 2>/dev/null; then
    echo "  ✅ Native card class promoted onto .ds-card (shine reaches DS cards)"
    ((pass++))
  else
    echo "  ❌ Missing native card class promotion — shine won't reach DS cards"
    ((fail++))
  fi

  # 2. Our `.ds-card::after` opacity is NOT forced — the theme relies on
  # opacity 0 default + opacity 0.8 on :focus to drive the animation. A
  # forced opacity 1 would make the shine gradient static-visible on every
  # card (purple stripe artifact).
  if grep -q '::after' "$src/components/shelf/shelfStyles.ts" 2>/dev/null \
     && ! grep -q '.ds-card::after\s*{[^}]*opacity:\s*1' "$src/components/shelf/shelfStyles.ts" 2>/dev/null; then
    echo "  ✅ ::after opacity left to the theme (no forced opacity 1)"
    ((pass++))
  else
    echo "  ❌ ::after opacity may be force-overridden — breaks shine animation"
    ((fail++))
  fi

  # 3. Under Round Compat (Focus Highlight Color), the shine ::after is
  # suppressed so the focus visual disappears entirely (matches the theme's
  # behavior on native cards under the same patch).
  if grep -q 'data-ds-theme-focus-round-compat="true"' "$src/components/shelf/shelfStyles.ts" 2>/dev/null \
     && grep -q '\.ds-card.*::after' "$src/components/shelf/shelfStyles.ts" 2>/dev/null; then
    echo "  ✅ Shine ::after suppressed under Round Compat flag"
    ((pass++))
  else
    echo "  ❌ Missing Round Compat suppression for shine ::after"
    ((fail++))
  fi

  # 4. The shine uses --flangrande-game-cover-shine-color from the theme;
  # ensure source never writes to it (the theme is the sole owner).
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
