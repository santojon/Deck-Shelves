check_name="Clean Game View"
check_version="CSS Loader Theme"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -rq 'CARD_W\s*=\|CARD_ART_H\s*=' "$src/components/shelf/types.ts" "$src/components/DeckRow.tsx" 2>/dev/null; then
    echo "  ✅ Card dimensions defined as explicit constants"
    ((pass++))
  else
    echo "  ❌ Card dimensions not defined — Clean Game View may collapse layout"
    ((fail++))
  fi

  if grep -RInE "background\s*[:=][^\n]*rgba|background\s*[:=][^\n]*#|background-color" "$src" --exclude-dir=__pycache__ 2>/dev/null >/dev/null || \
     grep -RIn "--ds-shell-bg" "$src" --exclude-dir=__pycache__ 2>/dev/null >/dev/null || \
     grep -RIn "var(--ds-shell-bg" "$src" --exclude-dir=__pycache__ 2>/dev/null >/dev/null; then
    echo "  ✅ Card backgrounds are explicitly set or use the --ds-shell-bg variable"
    ((pass++))
  else
    echo "  ❌ No explicit card backgrounds — Clean Game View may make cards invisible"
    ((fail++))
  fi

  local steam_hover
  steam_hover=$(grep -rn 'appportrait.*hover\|GameCard.*hover\|appportrait.*focus' "$src" --exclude-dir=__pycache__ 2>/dev/null | grep -v 'detect\|query\|Selector' | head -3)
  if [[ -z "$steam_hover" ]]; then
    echo "  ✅ No reliance on native Steam card hover/focus classes"
    ((pass++))
  else
    echo "  ❌ Uses Steam card hover/focus classes that Clean Game View may strip"
    ((fail++))
  fi

  if grep -rq '\.ds-card\.gpfocus\|\.ds-card:focus' "$src" --exclude-dir=__pycache__ 2>/dev/null; then
    echo "  ✅ Focus indicator uses scoped .ds-card classes"
    ((pass++))
  else
    echo "  ❌ Missing scoped focus styles — Clean Game View may remove focus ring"
    ((fail++))
  fi

  if grep -rq '\-\-ds-card-radius' "$src" --exclude-dir=__pycache__ 2>/dev/null; then
    echo "  ✅ Border-radius uses --ds-card-radius custom property with fallback"
    ((pass++))
  else
    echo "  ❌ No CSS variable for border-radius — incompatible with theme overrides"
    ((fail++))
  fi

  if grep -rq 'box-shadow.*ds-card\|ds-card.*box-shadow\|\.ds-card-art' "$src" --exclude-dir=__pycache__ 2>/dev/null; then
    echo "  ✅ Card shadow defined on own .ds-card-art class"
    ((pass++))
  else
    echo "  ⚠️  Card shadow may depend on Steam styles that Clean Game View strips"
    ((fail++))
  fi

  if grep -rq 'object-fit\|objectFit' "$src/components/shelf/" "$src/components/DeckRow.tsx" 2>/dev/null; then
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
