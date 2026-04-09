check_name="CSS Loader Theme"
check_version="Top Bar Transparency"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "top[-_ ]bar.*transparent\|topbar.*transpar" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'top bar transparency' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'top bar transparency' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
