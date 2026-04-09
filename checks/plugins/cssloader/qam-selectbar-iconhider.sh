check_name="CSS Loader Theme"
check_version="QAM Select Bar Icon Hider"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "select[-_ ]bar.*icon|icon.*hider.*select[-_ ]bar|qam.*select" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'QAM selectbar icon hider' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'QAM selectbar icon hider' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
