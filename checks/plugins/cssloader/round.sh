check_name="Round"
check_version="CSS Loader Theme"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # Round theme applies large border-radius to UI elements.
  # Our cards must adapt to the theme's radius via detection or CSS variable.

  # 1. Border-radius detection from native Steam cards
  if grep -rq 'detectNativeCardRadius' "$src" 2>/dev/null; then
    echo "  ✅ Runtime border-radius detection from native Steam cards"
    ((pass++))
  else
    echo "  ❌ No native card radius detection — Round theme radius won't be inherited"
    ((fail++))
  fi

  # 2. CSS variable --ds-card-radius for theme override
  if grep -rq '\-\-ds-card-radius' "$src" 2>/dev/null; then
    echo "  ✅ --ds-card-radius CSS variable allows theme override"
    ((pass++))
  else
    echo "  ❌ Missing --ds-card-radius — cannot adapt to Round theme"
    ((fail++))
  fi

  # 3. Card art uses border-radius from variable (not hardcoded 0)
  if grep -rq 'border-radius.*var(--ds-card-radius' "$src" 2>/dev/null; then
    echo "  ✅ Card art border-radius reads from CSS variable"
    ((pass++))
  else
    echo "  ❌ Card art border-radius is hardcoded — won't match Round theme"
    ((fail++))
  fi

  # 4. overflow:hidden on card containers (prevents content bleeding past radius)
  if grep -rq "overflow.*hidden" "$src/components/DeckRow.tsx" 2>/dev/null; then
    echo "  ✅ Card containers use overflow:hidden (content clipped to border-radius)"
    ((pass++))
  else
    echo "  ❌ Missing overflow:hidden — content may bleed past rounded corners"
    ((fail++))
  fi

  # 5. No hardcoded borderRadius: 0 that would override theme
  local hardcoded_zero
  hardcoded_zero=$(grep -rn 'borderRadius.*:\s*0[^.]' "$src/components/DeckRow.tsx" 2>/dev/null | grep -v 'var(' | grep -v '//' | head -3)
  if [[ -z "$hardcoded_zero" ]]; then
    echo "  ✅ No hardcoded borderRadius: 0 overriding theme"
    ((pass++))
  else
    echo "  ⚠️  Hardcoded borderRadius: 0 found — may override Round theme:"
    echo "      $(echo "$hardcoded_zero" | head -2)"
    ((fail++))
  fi

  # 6. Detection queries multiple selector patterns (for theme compatibility)
  local selector_count
  selector_count=$(grep -c 'appportrait\|GameCard\|libraryhome\|appportraitlaunchable' "$src/components/DeckRow.tsx" 2>/dev/null || echo "0")
  if [[ "$selector_count" -ge 3 ]]; then
    echo "  ✅ Radius detection uses $selector_count selector variants for broad theme support"
    ((pass++))
  else
    echo "  ⚠️  Only $selector_count selector variants — may miss some theme configurations"
    ((fail++))
  fi

  # 7. Cached radius avoids repeated DOM queries
  if grep -rq 'cachedCardRadius' "$src" 2>/dev/null; then
    echo "  ✅ Detected radius is cached (no repeated DOM queries)"
    ((pass++))
  else
    echo "  ⚠️  Radius not cached — may cause layout thrashing"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
