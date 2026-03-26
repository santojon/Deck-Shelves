check_name="SteamOS 3.6"
check_version="Beta"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if grep -qE 'SP_REACT|window\.' "$root/src/shims/react.ts" 2>/dev/null; then
    echo "  ✅ React shim uses GamepadUI shared React"
    ((pass++))
  else
    echo "  ❌ React shim should use SP_REACT / window global"
    ((fail++))
  fi

  if grep -qE "formats.*es|format.*es" "$root/vite.plugin.config.ts" 2>/dev/null; then
    echo "  ✅ ESM output format"
    ((pass++))
  else
    echo "  ❌ Not using ESM output format"
    ((fail++))
  fi

  if ! grep -rqE 'window\.location\s*=' "$root/src/" 2>/dev/null; then
    echo "  ✅ No direct window.location manipulation"
    ((pass++))
  else
    echo "  ❌ Direct window.location manipulation found"
    ((fail++))
  fi

  if grep -rq 'SP_REACTDOM' "$root/src/shims/" 2>/dev/null; then
    echo "  ✅ SP_REACTDOM used as shim fallback (backward compat)"
    ((pass++))
  elif ! grep -rq 'SP_REACTDOM' "$root/src/" 2>/dev/null; then
    echo "  ✅ No SP_REACTDOM usage"
    ((pass++))
  else
    echo "  ⚠️  SP_REACTDOM used outside shims"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
