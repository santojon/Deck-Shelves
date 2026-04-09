check_name="CSS Loader Theme"
check_version="Delly Footer"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "delly\s*footer\|dellyfooter" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'Delly Footer' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'Delly Footer' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
