check_name="Build Output"
check_version="Vite/ESM"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if [[ -f "$root/dist/index.js" ]]; then
    echo "  ✅ dist/index.js exists"
    ((pass++))
  else
    echo "  ❌ dist/index.js missing (run build first)"
    ((fail++))
    echo ""
    echo "  Result: $pass passed, $fail failed"
    return $fail
  fi

  local size
  size=$(wc -c < "$root/dist/index.js" 2>/dev/null | tr -d ' ')
  if [[ "$size" -gt 0 ]]; then
    echo "  ✅ dist/index.js is non-empty ($size bytes)"
    ((pass++))
  else
    echo "  ❌ dist/index.js is empty"
    ((fail++))
  fi

  if [[ "$size" -lt 2621440 ]]; then
    echo "  ✅ dist/index.js size under 2.5MB"
    ((pass++))
  else
    echo "  ❌ dist/index.js too large (>2.5MB)"
    ((fail++))
  fi

  if grep -q "export" "$root/dist/index.js" 2>/dev/null; then
    echo "  ✅ dist/index.js has ESM exports"
    ((pass++))
  else
    echo "  ❌ dist/index.js missing ESM exports"
    ((fail++))
  fi

  local nm_refs
  nm_refs=$(grep -c "require.*node_modules\|from.*node_modules" "$root/dist/index.js" 2>/dev/null || true)
  if [[ "$nm_refs" -eq 0 ]]; then
    echo "  ✅ No node_modules imports in bundle"
    ((pass++))
  else
    echo "  ⚠️  node_modules import references found in bundle ($nm_refs)"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
