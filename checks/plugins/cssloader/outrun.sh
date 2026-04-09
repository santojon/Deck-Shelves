check_name="CSS Loader Theme"
check_version="Outrun"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "outrun" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'outrun' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'outrun' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
