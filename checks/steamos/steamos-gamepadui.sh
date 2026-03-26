check_name="SteamOS GamepadUI"
check_version="3.5–3.8"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  local shims_dir="$root/src/shims"
  if [[ -d "$shims_dir" ]]; then
    echo "  ✅ shims/ directory exists"
    ((pass++))
  else
    echo "  ❌ shims/ directory missing"
    ((fail++))
    echo ""
    echo "  Result: $pass passed, $fail failed"
    return $fail
  fi

  local required_shims=("react.ts" "react-dom.ts" "react-dom-client.ts" "react-jsx-runtime.ts")
  for shim in "${required_shims[@]}"; do
    if [[ -f "$shims_dir/$shim" ]]; then
      echo "  ✅ shim: $shim"
      ((pass++))
    else
      echo "  ❌ shim missing: $shim"
      ((fail++))
    fi
  done

  if grep -qE "external|alias.*react|shims/react" "$root/vite.plugin.config.ts" 2>/dev/null; then
    echo "  ✅ Vite config isolates React (shims or externals)"
    ((pass++))
  else
    echo "  ❌ Vite config may bundle React (should shim or externalize)"
    ((fail++))
  fi

  if grep -q "es" "$root/vite.plugin.config.ts" 2>/dev/null; then
    echo "  ✅ Vite config targets ES module format"
    ((pass++))
  else
    echo "  ❌ Vite config not targeting ES modules"
    ((fail++))
  fi

  local dom_issues=0
  for f in "$root/src/components/"*.tsx "$root/src/components/"*.ts; do
    [[ -f "$f" ]] || continue
    if grep -qE "document\.(getElementById|querySelector|createElement)" "$f" 2>/dev/null; then
      echo "  ⚠️  Direct DOM access in $(basename "$f")"
      ((dom_issues++))
    fi
  done
  if [[ $dom_issues -eq 0 ]]; then
    echo "  ✅ No direct DOM manipulation in components"
    ((pass++))
  else
    ((fail += dom_issues))
  fi

  if [[ -f "$root/src/runtime/platform.ts" ]]; then
    echo "  ✅ Platform abstraction layer exists"
    ((pass++))
  else
    echo "  ❌ Platform abstraction missing"
    ((fail++))
  fi

  if [[ -f "$root/src/runtime/diagnostics.ts" ]]; then
    echo "  ✅ Diagnostics module exists"
    ((pass++))
  else
    echo "  ⚠️  Diagnostics module not found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
