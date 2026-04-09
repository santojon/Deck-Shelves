check_name="CSS Loader Theme"
check_version="Fullscreen Menus"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "fullscreen[-_ ]menu\|fullscreenmenu" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'Fullscreen Menus' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'Fullscreen Menus' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
