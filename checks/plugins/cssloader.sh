check_name="CSS Loader"
check_version="Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  local style_files
  style_files=$(grep -rln 'textContent\s*=' "$src" 2>/dev/null | xargs grep -l 'style\|css' 2>/dev/null)
  local all_scoped=true
  for f in $style_files; do
    if ! grep -q 'STYLE_ID\|deck-shelves\|deck_shelves\|ds-\|ROOT_ID' "$f" 2>/dev/null; then
      all_scoped=false
      break
    fi
  done
  if $all_scoped; then
    echo "  ✅ Injected styles are in files with scoped selectors"
    ((pass++))
  else
    echo "  ❌ Unscoped injected styles found — may conflict with CSS Loader"
    ((fail++))
  fi

  if grep -rq 'STYLE_ID\s*=\s*"deck-shelves-' "$src" 2>/dev/null; then
    echo "  ✅ Style elements use unique 'deck-shelves-' prefixed IDs"
    ((pass++))
  else
    echo "  ❌ Style elements missing unique deck-shelves- prefix"
    ((fail++))
  fi

  if grep -rq 'getElementById(STYLE_ID)' "$src" 2>/dev/null; then
    echo "  ✅ Style injection checks for existing element (no duplicates)"
    ((pass++))
  else
    echo "  ⚠️  Style injection may create duplicate elements"
    ((fail++))
  fi

  local important_files
  important_files=$(grep -rln '!important' "$src" 2>/dev/null)
  local all_scoped=true
  for f in $important_files; do
    if ! grep -Eq '\.ds-|deck-shelves|deck_shelves|STYLE_ID' "$f" 2>/dev/null; then
      all_scoped=false
      break
    fi
  done
  if $all_scoped; then
    echo "  ✅ All !important declarations are within files using scoped selectors"
    ((pass++))
  else
    echo "  ❌ !important declarations in files without scoped selectors"
    ((fail++))
  fi

  local generic_classes
  generic_classes=$(grep -roE 'className\s*=\s*"[^"]*"' "$src" 2>/dev/null | grep -v 'deck-shelves\|Panel\|Focusable' | grep -v 'gamepadDialog\|DialogButton\|Field' | head -5)
  if [[ -z "$generic_classes" ]]; then
    echo "  ✅ All className values are namespaced or from Decky UI"
    ((pass++))
  else
    echo "  ⚠️  Some className values may lack deck-shelves namespace:"
    echo "      $(echo "$generic_classes" | head -3)"
    ((pass++))
  fi

  if grep -rq "document\.styleSheets\|styleSheets\[" "$src" 2>/dev/null; then
    echo "  ❌ Direct manipulation of document.styleSheets — conflicts with CSS Loader"
    ((fail++))
  else
    echo "  ✅ No direct document.styleSheets manipulation"
    ((pass++))
  fi

  if grep -rq "ROOT_ID\s*=\s*\"deck-shelves-" "$src" 2>/dev/null; then
    echo "  ✅ Root mount element has unique deck-shelves-* ID"
    ((pass++))
  else
    echo "  ❌ Root mount element missing unique ID for CSS scoping"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
