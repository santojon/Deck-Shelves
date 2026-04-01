check_name="Non-Steam Badges"
check_version="Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # 1) Ensure optional chaining when accessing possible globals
  if grep -rn "\.NonSteamBadge[^S]\|\.NonSteamBadges[^S]" "$src" 2>/dev/null | grep -v '//' | grep -qv '\?\.' ; then
    echo "  ❌ NonSteamBadge(s) global accessed without optional chaining"
    ((fail++))
  else
    echo "  ✅ NonSteamBadge(s) global uses optional chaining"
    ((pass++))
  fi

  # 2) Ensure no hard import/require on a hypothetical nonsteam module
  if grep -rqi "from.*nonsteam\|require.*nonsteam\|import.*nonsteam" "$src" 2>/dev/null; then
    echo "  ❌ Hard dependency on nonsteam module (import/require)"
    ((fail++))
  else
    echo "  ✅ No hard dependency on nonsteam module"
    ((pass++))
  fi

  # 3) Ensure we don't overwrite global namespace accidentally
  if grep -rq "window\.NonSteamBadges\s*=\|globalThis\.NonSteamBadges\s*=" "$src" 2>/dev/null; then
    echo "  ❌ Overwriting NonSteamBadges global namespace"
    ((fail++))
  else
    echo "  ✅ No NonSteamBadges namespace collision"
    ((pass++))
  fi

  # 4) Check for guarded access to shortcuts/shortcutsStore (should be optional-chained / in try/catch)
  local sc_files
  sc_files=$(grep -rln "shortcutsStore\|shortcuts\.vdf\|shortcuts" "$src" 2>/dev/null | grep -v '\.d\.ts$') || true
  local all_guarded=true
  for f in $sc_files; do
    if grep -q "shortcutsStore\|shortcuts" "$f" 2>/dev/null; then
      if ! grep -q "try {\|try$" "$f" 2>/dev/null; then
        all_guarded=false
        break
      fi
    fi
  done
  if $all_guarded; then
    echo "  ✅ Shortcuts/shortcutsStore access is guarded by try/catch"
    ((pass++))
  else
    echo "  ❌ Shortcuts/shortcutsStore access found without try/catch guards"
    ((fail++))
  fi

  # 5) Check dynamic probing includes shortcuts-like stores
  if grep -rq "shortcutsStore\|ShortcutsStore\|shortcuts" "$src" 2>/dev/null; then
    echo "  ✅ Dynamic probing includes shortcuts/shortcutsStore"
    ((pass++))
  else
    echo "  ⚠️  No shortcuts probing found (non-steam shortcuts may not be discovered)"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
