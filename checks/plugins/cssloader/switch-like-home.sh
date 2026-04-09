check_name="CSS Loader Theme"
check_version="Switch-Like Home"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "switch[-_ ]like\s*home\|switchlikehome" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'switch-like home' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'switch-like home' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
