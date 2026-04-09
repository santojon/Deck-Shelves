check_name="CSS Loader Theme"
check_version="QAM Hide Tabs"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "qam.*hide.*tab\|hide[-_ ]tabs.*qam" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'QAM hide tabs' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'QAM hide tabs' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
