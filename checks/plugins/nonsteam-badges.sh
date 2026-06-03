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

  # 2) Ensure no hard import/require on an external nonsteam module. Imports
  # that originate in (or resolve to) our own integrations/ directory are
  # intentional (registry/nonsteambadges modules live there, mirroring the
  # TabMaster integration), so exclude lines coming from those files AND
  # lines whose import target is '.../integrations'.
  if grep -rni "from.*nonsteam\|require.*nonsteam\|import.*nonsteam" "$src" 2>/dev/null \
      | grep -v "integrations/" \
      | grep -vE "from ['\"][^'\"]*integrations['\"]" \
      | grep -q .; then
    echo "  ❌ Hard dependency on nonsteam module (import/require outside integrations/)"
    ((fail++))
  else
    echo "  ✅ No hard dependency on nonsteam module outside integrations/"
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

  # 4) Check for guarded access to shortcuts/shortcutsStore (should be optional-chained / in try/catch).
  # Match actual runtime access only — the previous pattern (bare `shortcuts`)
  # tripped on documentation comments that mention "non-Steam shortcuts"
  # without any real store access (e.g. `src/steam/dedupe.ts`).
  local sc_files
  sc_files=$(grep -rln "shortcutsStore\|\.shortcuts\.vdf\|shortcutCache\|m_mapShortcuts" "$src" 2>/dev/null | grep -v '\.d\.ts$') || true
  local all_guarded=true
  for f in $sc_files; do
    if ! grep -q "try {\|try$" "$f" 2>/dev/null; then
      all_guarded=false
      break
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
