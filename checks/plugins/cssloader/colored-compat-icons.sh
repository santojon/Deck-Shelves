check_name="CSS Loader Theme"
check_version="Colored Compatibility Icons"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # Find potential references but ignore our own ds-compat classes and our
  # own feature flag names (hide_compat_icons / hideCompatIcons / HideCompatIcons
  # are the user-facing toggle keys, not theme-specific coupling).
  local matches
  matches=$(grep -RInE "compatibility\\s*icon|compat[-_]icon|colored[-_ ]compat" "$src" 2>/dev/null \
    | grep -v 'ds-compat' \
    | grep -vE 'hide_compat_icons|hideCompatIcons|HideCompatIcons' \
    || true)
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
