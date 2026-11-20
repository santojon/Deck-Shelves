check_name="CSS Loader"
check_version="ArtHero Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if [[ -f "$src/core/cssLoaderDetect.ts" ]]; then
    echo "  ✅ cssLoaderDetect helper present"
    ((pass++))
  else
    echo "  ❌ src/core/cssLoaderDetect.ts missing"
    ((fail++))
  fi

  if grep -q 'isCssLoaderActive' "$src/core/cssLoaderDetect.ts" 2>/dev/null \
     && grep -q 'isArtHeroActive' "$src/core/cssLoaderDetect.ts" 2>/dev/null; then
    echo "  ✅ Detection helper exports isCssLoaderActive + isArtHeroActive"
    ((pass++))
  else
    echo "  ❌ Detection helper missing required exports"
    ((fail++))
  fi

  if grep -q 'replaceInjecting' "$src/components/HomeInject.tsx" 2>/dev/null \
     && grep -q 'shelfHeroBackground' "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ HeroBackground render gated by replaceInjecting (no duplicate hero)"
    ((pass++))
  else
    echo "  ❌ HeroBackground render gate missing replaceInjecting check"
    ((fail++))
  fi

  if grep -q 'data-ds-recents-slot' "$src/components/home/ShelvesContainer.tsx" 2>/dev/null; then
    echo "  ✅ First ds-shelf promoted to recents slot when CSS Loader active"
    ((pass++))
  else
    echo "  ❌ Recents-slot promotion missing — themes can't style first shelf"
    ((fail++))
  fi

  if grep -q 'classList.add(' "$src/components/home/ShelvesContainer.tsx" 2>/dev/null \
     && ! grep -q "classList.remove(.*'ds-" "$src/components/home/ShelvesContainer.tsx" 2>/dev/null; then
    echo "  ✅ Class promotion is additive (does not strip ds-*)"
    ((pass++))
  else
    echo "  ❌ Class promotion may remove ds-* classes — breaks plugin styling"
    ((fail++))
  fi

  if grep -q 'getNativeRecentsClassName' "$src/components/home/ShelvesContainer.tsx" 2>/dev/null; then
    echo "  ✅ Native recents class read from runtime DOM (no hardcoded token)"
    ((pass++))
  else
    echo "  ❌ Native recents class assignment may be hardcoded"
    ((fail++))
  fi

  if grep -rq "css-loader-style" "$src/themes" "$src/core/cssLoaderDetect.ts" 2>/dev/null; then
    echo "  ✅ Detection probes <style class=\"css-loader-style\"> tags"
    ((pass++))
  else
    echo "  ❌ Detection does not look at css-loader-style tags"
    ((fail++))
  fi

  if grep -q "heroToken" "$src/themes/adapters/artHero.ts" 2>/dev/null \
     && grep -q "mask-image" "$src/themes/adapters/artHero.ts" 2>/dev/null; then
    echo "  ✅ ArtHero detected by structural signature (heroInner + mask-image)"
    ((pass++))
  else
    echo "  ❌ ArtHero detection lacks structural signature — name-based detection is unreliable"
    ((fail++))
  fi

  if grep -q 'if (!hideRecentsSetting && !forceCssLoaderThemes) return' "$src/components/home/ShelvesContainer.tsx" 2>/dev/null; then
    echo "  ✅ Invariant 1: promotion requires hideRecentsSetting"
    ((pass++))
  else
    echo "  ❌ Invariant 1 broken: promotion may run with native recents visible"
    ((fail++))
  fi

  if grep -q '.ds-shelf\[data-shelfid="\${CSS.escape(firstVisibleId)}' "$src/components/home/ShelvesContainer.tsx" 2>/dev/null; then
    echo "  ✅ Invariant 2: promotion targets only the first visible shelf"
    ((pass++))
  else
    echo "  ❌ Invariant 2 broken: promotion may target multiple shelves"
    ((fail++))
  fi

  if grep -q 'if (!isCssLoaderActive()) return' "$src/components/home/ShelvesContainer.tsx" 2>/dev/null; then
    echo "  ✅ Invariant 3: promotion requires CSS Loader active"
    ((pass++))
  else
    echo "  ❌ Invariant 3 broken: promotion may run without CSS Loader"
    ((fail++))
  fi

  if grep -q 'shelfHeroBackground: settings.hideRecents === true' "$src/components/home/homeInjectHelpers.ts" 2>/dev/null; then
    echo "  ✅ HeroBackground only renders when hideRecents is true"
    ((pass++))
  else
    echo "  ❌ HeroBackground render gate may not require hideRecents"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
