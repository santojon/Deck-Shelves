check_name="CSS Loader Theme"
check_version="Switch-Like Banners"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -Riq "switch[-_ ]like\s*banner\|switchlikebanner\|switch[-_ ]banners" "$src" 2>/dev/null; then
    echo "  ❌ Source references 'switch-like banners' (may indicate theme-specific coupling)"
    ((fail++))
  else
    echo "  ✅ No 'switch-like banners' references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
