check_name="CSS Loader Theme"
check_version="Center Home"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "center[-_ ]home\|centerhome" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'center home' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'center home' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
