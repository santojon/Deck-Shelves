check_name="CSS Loader Theme"
check_version="Center Home"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # Filter out approved detection (theme's own --center-home-padding var —
  # same pattern SLH/ArtHero use). Flag only hardcoded class names / style imports.
  local hits
  hits="$(grep -Rin "center[-_ ]home\|centerhome" "$src" 2>/dev/null \
    | grep -v -- '--center-home-padding' \
    | grep -v '^\s*//' \
    | grep -v '^\s*\*')" || true

  if [[ -n "$hits" ]]; then
    echo "  ❌ Source references 'center home' outside CSS-property detection (theme-specific coupling)"
    echo "$hits" | head -5 | sed 's/^/      /'
    ((fail++))
  else
    echo "  ✅ No unsafe 'center home' coupling (CSS custom-property detection is allowed)"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
