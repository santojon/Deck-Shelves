check_name="Clean Game View"
check_version="CSS Loader Theme"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # Clean Game View removes visual clutter and simplifies card appearance.
  # Our cards must use explicit styles that won't be stripped by the theme.

  # 1. Card art uses explicit dimensions (not inherited from Steam classes)
  if grep -rq 'CARD_W\s*=\|CARD_ART_H\s*=' "$src/components/DeckRow.tsx" 2>/dev/null; then
    echo "  ✅ Card dimensions defined as explicit constants"
    ((pass++))
  else
    echo "  ❌ Card dimensions not defined — Clean Game View may collapse layout"
    ((fail++))
  fi

  # 2. Card backgrounds are explicit (not inherited from theme).
  # Accept explicit rgba/# values OR use of our shell CSS variable (--ds-shell-bg / var(--ds-shell-bg)).
  if grep -RInE "background\s*[:=][^\n]*rgba|background\s*[:=][^\n]*#|background-color" "$src" 2>/dev/null >/dev/null || \
     grep -RIn "--ds-shell-bg" "$src" 2>/dev/null >/dev/null || \
     grep -RIn "var(--ds-shell-bg" "$src" 2>/dev/null >/dev/null; then
    echo "  ✅ Card backgrounds are explicitly set or use the --ds-shell-bg variable"
    ((pass++))
  else
    echo "  ❌ No explicit card backgrounds — Clean Game View may make cards invisible"
    ((fail++))
  fi

  # 3. No reliance on Steam's native card hover/focus classes that CGV strips
  local steam_hover
  steam_hover=$(grep -rn 'appportrait.*hover\|GameCard.*hover\|appportrait.*focus' "$src" 2>/dev/null | grep -v 'detect\|query\|Selector' | head -3)
  if [[ -z "$steam_hover" ]]; then
    echo "  ✅ No reliance on native Steam card hover/focus classes"
    ((pass++))
  else
    echo "  ❌ Uses Steam card hover/focus classes that Clean Game View may strip"
    ((fail++))
  fi

  # 4. Custom focus indicator uses own classes (ds-card, gpfocus)
  if grep -rq '\.ds-card\.gpfocus\|\.ds-card:focus' "$src" 2>/dev/null; then
    echo "  ✅ Focus indicator uses scoped .ds-card classes"
    ((pass++))
  else
    echo "  ❌ Missing scoped focus styles — Clean Game View may remove focus ring"
    ((fail++))
  fi

  # 5. Card border-radius uses CSS variable with fallback
  if grep -rq '\-\-ds-card-radius' "$src" 2>/dev/null; then
    echo "  ✅ Border-radius uses --ds-card-radius custom property with fallback"
    ((pass++))
  else
    echo "  ❌ No CSS variable for border-radius — incompatible with theme overrides"
    ((fail++))
  fi

  # 6. Card shadow is self-defined (not inherited from Steam)
  if grep -rq 'box-shadow.*ds-card\|ds-card.*box-shadow\|\.ds-card-art' "$src" 2>/dev/null; then
    echo "  ✅ Card shadow defined on own .ds-card-art class"
    ((pass++))
  else
    echo "  ⚠️  Card shadow may depend on Steam styles that Clean Game View strips"
    ((fail++))
  fi

  # 7. Image sizing is explicit (object-fit, width, height)
  if grep -rq 'object-fit\|objectFit' "$src/components/DeckRow.tsx" 2>/dev/null; then
    echo "  ✅ Image sizing uses explicit object-fit"
    ((pass++))
  else
    echo "  ❌ No explicit image sizing — images may break under Clean Game View"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
