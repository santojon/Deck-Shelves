check_name="SteamOS 3.7"
check_version="Stable"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if [[ -f "$root/src/runtime/platform.ts" ]]; then
    echo "  ✅ Platform abstraction layer exists"
    ((pass++))
  else
    echo "  ❌ Platform abstraction missing (needed for 3.7 differences)"
    ((fail++))
  fi

  if find "$root/src" -name "*.tsx" -exec grep -l "ErrorBoundary\|componentDidCatch\|getDerivedStateFromError" {} + >/dev/null 2>&1; then
    echo "  ✅ Error boundary pattern found"
    ((pass++))
  else
    echo "  ⚠️  No error boundary found (recommended for 3.7+)"
    ((pass++))
  fi

  local hardcoded_classes=0
  for f in "$root/src/components/"*.tsx "$root/src/components/"*.ts; do
    [[ -f "$f" ]] || continue
    if grep -qE 'querySelector\(.*\.\w+_\w+' "$f" 2>/dev/null; then
      echo "  ⚠️  Hardcoded CSS class selector in $(basename "$f")"
      ((hardcoded_classes++))
    fi
  done
  if [[ $hardcoded_classes -eq 0 ]]; then
    echo "  ✅ No hardcoded obfuscated CSS class selectors in components"
    ((pass++))
  else
    ((fail += hardcoded_classes))
  fi

  if grep -rqE 'isHomeRoute\|library/home\|/library' "$root/src/" 2>/dev/null; then
    echo "  ✅ Home route detection present"
    ((pass++))
  else
    echo "  ⚠️  No route detection found"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
