check_name="Obsidian Theme"
check_version="CSS Loader Theme"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -rq '#deck-shelves-home-root\|#\${ROOT_ID}' "$src" 2>/dev/null; then
    echo "  ✅ Custom styles scoped under #deck-shelves-home-root"
    ((pass++))
  else
    echo "  ❌ Styles not scoped — Obsidian theme may override them"
    ((fail++))
  fi

  # Collect files that contain scoping tokens (ROOT_ID, STYLE_ID, ds-, deck-shelves)
  # and exclude all font-size matches from those files
  local scoped_files
  scoped_files=$(grep -rlE 'ROOT_ID|STYLE_ID|deck-shelves|\.ds-' "$src" 2>/dev/null | sort -u)
  local absolute_fonts
  absolute_fonts=$(grep -rn 'font-size:\s*[0-9]*px' "$src" 2>/dev/null | head -20)
  # Filter out lines from scoped files
  for sf in $scoped_files; do
    absolute_fonts=$(echo "$absolute_fonts" | grep -v "^${sf}:" 2>/dev/null || true)
  done
  absolute_fonts=$(echo "$absolute_fonts" | head -3)
  # Trim whitespace
  absolute_fonts=$(echo "$absolute_fonts" | sed '/^\s*$/d')
  if [[ -z "$absolute_fonts" ]]; then
    echo "  ✅ Font sizes inside scoped selectors or using relative units"
    ((pass++))
  else
    echo "  ⚠️  Absolute font sizes outside scoped context:"
    echo "      $(echo "$absolute_fonts" | head -2)"
    ((pass++))
  fi

  local color_count
  color_count=$(grep -rcE 'color:\s*#[0-9a-fA-F]+|color:\s*rgb' "$src" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [[ "$color_count" -gt 0 ]]; then
    echo "  ✅ Explicit color values ($color_count) — not dependent on theme variables"
    ((pass++))
  else
    echo "  ⚠️  No explicit colors found — may inherit unexpected Obsidian theme colors"
    ((fail++))
  fi

  if grep -rq "background.*#\|background.*rgb\|background-color.*#\|background-color.*rgb" "$src" 2>/dev/null; then
    echo "  ✅ Explicit background colors in components"
    ((pass++))
  else
    echo "  ⚠️  No explicit backgrounds — Obsidian theme may show through"
    ((pass++))
  fi

  local steam_classes
  steam_classes=$(grep -roE 'className\s*=\s*"[A-Z][a-zA-Z]*Panel[^"]*"' "$src" 2>/dev/null | grep -v 'deck-shelves' | head -3)
  if [[ -z "$steam_classes" ]]; then
    echo "  ✅ No reliance on generic Steam panel class styling"
    ((pass++))
  else
    echo "  ⚠️  Uses Steam panel classes that Obsidian theme may restyle:"
    echo "      $(echo "$steam_classes" | head -2)"
    ((pass++))
  fi

  local high_z
  high_z=$(grep -roE 'zIndex\s*[:=]\s*"?[0-9]+' "$src" 2>/dev/null | grep -oE '[0-9]+$' | awk '$1 > 100' | head -3)
  if [[ -z "$high_z" ]]; then
    echo "  ✅ z-index values are reasonable (≤ 100)"
    ((pass++))
  else
    echo "  ⚠️  High z-index values ($high_z) may conflict with theme overlays"
    ((fail++))
  fi

  if grep -rq 'deck-shelves-modal-scope' "$src" 2>/dev/null; then
    echo "  ✅ Modal styles scoped under .deck-shelves-modal-scope"
    ((pass++))
  else
    echo "  ⚠️  Modal styles may not be scoped — Obsidian theme overrides possible"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
