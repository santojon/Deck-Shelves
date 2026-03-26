check_name="TabMaster"
check_version="Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -rn "TabMasterStore" "$src" 2>/dev/null | grep -v '//' | grep -qv '?\.' ; then
    echo "  ❌ TabMasterStore accessed without optional chaining"
    ((fail++))
  else
    echo "  ✅ TabMasterStore uses optional chaining"
    ((pass++))
  fi

  if grep -rn '\.TabMaster[^S]' "$src" 2>/dev/null | grep -v '//' | grep -qv '?\.' ; then
    echo "  ❌ TabMaster global accessed without optional chaining"
    ((fail++))
  else
    echo "  ✅ TabMaster global uses optional chaining"
    ((pass++))
  fi

  local tab_files
  tab_files=$(grep -rln "TabMasterStore\|TabMaster" "$src" 2>/dev/null | grep -v '\.d\.ts$')
  local all_guarded=true
  for f in $tab_files; do
    if grep -q "TabMasterStore\|TabMaster" "$f" 2>/dev/null; then
      if ! grep -q "try {\|try$" "$f" 2>/dev/null; then
        all_guarded=false
        break
      fi
    fi
  done
  if $all_guarded; then
    echo "  ✅ TabMaster access in files with try/catch guards"
    ((pass++))
  else
    echo "  ❌ TabMaster access in files without try/catch guards"
    ((fail++))
  fi

  if grep -rq "from.*tabmaster\|require.*tabmaster\|import.*tabmaster" "$src" 2>/dev/null; then
    echo "  ❌ Hard dependency on TabMaster (import/require)"
    ((fail++))
  else
    echo "  ✅ No hard dependency on TabMaster"
    ((pass++))
  fi

  if grep -rq "TabMasterStore" "$src" 2>/dev/null; then
    echo "  ✅ Dynamic tab store probing includes TabMasterStore"
    ((pass++))
  else
    echo "  ⚠️  No TabMasterStore probing (tabs from TabMaster won't be discovered)"
    ((fail++))
  fi

  if grep -rq "window\.TabMaster\s*=" "$src" 2>/dev/null || grep -rq "globalThis\.TabMaster\s*=" "$src" 2>/dev/null; then
    echo "  ❌ Overwriting TabMaster global namespace"
    ((fail++))
  else
    echo "  ✅ No TabMaster namespace collision"
    ((pass++))
  fi

  if grep -rq "collectionStore.*TabMaster\|TabMaster.*collectionStore\|TabMasterStore" "$src" 2>/dev/null; then
    echo "  ✅ Collection fallback aware of TabMaster"
    ((pass++))
  else
    echo "  ⚠️  Collection fallback does not reference TabMaster"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
