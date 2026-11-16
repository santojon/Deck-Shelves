check_name="CSS Loader Theme"
check_version="Switch-Like Home"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # The theme's own adapter and its tests are the only sanctioned place for the name.
  if grep -Riq "switch[-_ ]like\s*home\|switchlikehome" "$src" --exclude-dir=__pycache__ --exclude-dir=adapters --exclude-dir=test 2>/dev/null; then
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
