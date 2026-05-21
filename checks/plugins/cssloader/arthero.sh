check_name="CSS Loader"
check_version="ArtHero Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # 1. Detection helper present.
  if [[ -f "$src/core/cssLoaderDetect.ts" ]]; then
    echo "  ✅ cssLoaderDetect helper present"
    ((pass++))
  else
    echo "  ❌ src/core/cssLoaderDetect.ts missing"
    ((fail++))
  fi

  # 2. Helper exposes the two probes used by the rest of the codebase.
  if grep -q 'export function isCssLoaderActive' "$src/core/cssLoaderDetect.ts" 2>/dev/null \
     && grep -q 'export function isArtHeroActive' "$src/core/cssLoaderDetect.ts" 2>/dev/null; then
    echo "  ✅ Detection helper exports isCssLoaderActive + isArtHeroActive"
    ((pass++))
  else
    echo "  ❌ Detection helper missing required exports"
    ((fail++))
  fi

  # 3. HeroBackground rendering is gated at the parent (HomeInject) — when
  # the recents-replace overlay is injecting, the parent doesn't pass
  # `shelfHeroBackground=true`, so our hero isn't rendered alongside the
  # native one. With the overlay OFF, the native hero element is hidden, so
  # ArtHero's CSS doesn't paint anything and we can safely render our hero
  # (it inherits the native hero classes via discovery, so ArtHero's
  # mask-image rule still applies to ours).
  if grep -q 'replaceInjecting' "$src/components/HomeInject.tsx" 2>/dev/null \
     && grep -q 'shelfHeroBackground' "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ HeroBackground render gated by replaceInjecting (no duplicate hero)"
    ((pass++))
  else
    echo "  ❌ HeroBackground render gate missing replaceInjecting check"
    ((fail++))
  fi

  # 4. HomeInject promotes the first ds-shelf into the recents slot when CSS Loader is active.
  if grep -q 'data-ds-recents-slot' "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ First ds-shelf promoted to recents slot when CSS Loader active"
    ((pass++))
  else
    echo "  ❌ Recents-slot promotion missing — themes can't style first shelf"
    ((fail++))
  fi

  # 5. The class promotion is additive (must not strip ds-* classes).
  if grep -q 'classList.add(' "$src/components/HomeInject.tsx" 2>/dev/null \
     && ! grep -q "classList.remove\(.*'ds-" "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ Class promotion is additive (does not strip ds-*)"
    ((pass++))
  else
    echo "  ❌ Class promotion may remove ds-* classes — breaks plugin styling"
    ((fail++))
  fi

  # 6. Discovery uses the previous sibling, not a hardcoded class token.
  if grep -q 'getNativeRecentsClassName' "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ Native recents class read from runtime DOM (no hardcoded token)"
    ((pass++))
  else
    echo "  ❌ Native recents class assignment may be hardcoded"
    ((fail++))
  fi

  # 7. ArtHero detection probes css-loader-style tags (the public CSS Loader marker).
  if grep -q "css-loader-style" "$src/core/cssLoaderDetect.ts" 2>/dev/null; then
    echo "  ✅ Detection probes <style class=\"css-loader-style\"> tags"
    ((pass++))
  else
    echo "  ❌ Detection does not look at css-loader-style tags"
    ((fail++))
  fi

  # 7b. ArtHero detection uses the structural signature (heroInner + mask-image
  # rule) rather than relying on theme-name attributes — those don't exist in
  # most CSS Loader builds. Verified live on a Deck running the ArtHero theme.
  if grep -q "heroToken" "$src/core/cssLoaderDetect.ts" 2>/dev/null \
     && grep -q "mask-image" "$src/core/cssLoaderDetect.ts" 2>/dev/null; then
    echo "  ✅ ArtHero detected by structural signature (heroInner + mask-image)"
    ((pass++))
  else
    echo "  ❌ ArtHero detection lacks structural signature — name-based detection is unreliable"
    ((fail++))
  fi

  # 8. INVARIANT 1: Promotion is gated on hideRecentsSetting (hero-wrapper themes
  # must NOT leak into shelves while native recents are visible). The guard
  # also allows the `forceCssLoaderThemes` opt-in, so the grep matches the
  # full early-return rather than a `hideRecentsSetting`-only fragment.
  if grep -q 'INVARIANT 1' "$src/components/HomeInject.tsx" 2>/dev/null \
     && grep -q 'if (!hideRecentsSetting && !forceCssLoaderThemes) return' "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ Invariant 1: promotion requires hideRecentsSetting"
    ((pass++))
  else
    echo "  ❌ Invariant 1 broken: promotion may run with native recents visible"
    ((fail++))
  fi

  # 9. INVARIANT 2: Promotion is scoped to the FIRST visible shelf only via the
  # data-shelfid selector — never to all .ds-shelf nor to the second/third shelf.
  if grep -q 'INVARIANT 2' "$src/components/HomeInject.tsx" 2>/dev/null \
     && grep -q '.ds-shelf\[data-shelfid="\${CSS.escape(firstVisibleId)}' "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ Invariant 2: promotion targets only the first visible shelf"
    ((pass++))
  else
    echo "  ❌ Invariant 2 broken: promotion may target multiple shelves"
    ((fail++))
  fi

  # 10. INVARIANT 3: Promotion gated on isCssLoaderActive — without a theme
  # there's no value in adding the wrapper class, and the no-op risks ds-card
  # cascading rules from leaking into hero-wrapper-styled selectors.
  if grep -q 'INVARIANT 3' "$src/components/HomeInject.tsx" 2>/dev/null \
     && grep -q 'if (!isCssLoaderActive()) return' "$src/components/HomeInject.tsx" 2>/dev/null; then
    echo "  ✅ Invariant 3: promotion requires CSS Loader active"
    ((pass++))
  else
    echo "  ❌ Invariant 3 broken: promotion may run without CSS Loader"
    ((fail++))
  fi

  # 11. HeroBackground render gated on hideRecents in the parent (HomeInject)
  # — universal-card themes don't fight a stacked hero on every render.
  if grep -q 'shelfHeroBackground={settings.hideRecents === true' "$src/components/HomeInject.tsx" 2>/dev/null; then
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
