check_name="CSS Loader Theme"
check_version="Main Menu Hide Tabs"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "main[-_ ]menu.*hide.*tab\|hide[-_ ]tabs.*main[-_ ]menu" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'main menu hide tabs' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'main menu hide tabs' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
