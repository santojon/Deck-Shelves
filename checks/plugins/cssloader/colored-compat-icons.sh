check_name="CSS Loader Theme"
check_version="Colored Compatibility Icons"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # Find potential references but ignore our own ds-compat classes
  local matches
  # Only match explicit "compatibility icon" or similarly-named theme tokens;
  # avoid matching generic field names like deck_compatibility_category in code.
  matches=$(grep -RInE "compatibility\\s*icon|compat[-_]icon|colored[-_ ]compat" "$src" 2>/dev/null | grep -v 'ds-compat' || true)
  if [[ -n "$matches" ]]; then
    echo "  ❌ Source references colored compatibility icons (may indicate theme-specific coupling)"
    echo "      $(echo "$matches" | head -3)"
    ((fail++))
  else
    echo "  ✅ No colored compatibility-icon references found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
