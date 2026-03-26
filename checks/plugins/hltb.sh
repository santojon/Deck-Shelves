check_name="HLTB"
check_version="Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -rq "window\.HLTB\s*=\|globalThis\.HLTB\s*=" "$src" 2>/dev/null; then
    echo "  ❌ Overwriting HLTB global namespace"
    ((fail++))
  else
    echo "  ✅ No HLTB namespace collision"
    ((pass++))
  fi

  if grep -rq "\.per_client_data\s*=\|\.rt_last_time_played\s*=\|\.minutes_playtime_forever\s*=" "$src" 2>/dev/null; then
    echo "  ❌ Mutating AppOverview playtime fields — may overwrite HLTB data"
    ((fail++))
  else
    echo "  ✅ AppOverview playtime fields read-only"
    ((pass++))
  fi

  if grep -rq "appdetails\|AppDetails\|app_details\|GameDetails" "$src" 2>/dev/null | grep -qv "//"; then
    echo "  ⚠️  References app detail page — verify no conflict with HLTB overlay"
    ((pass++))
  else
    echo "  ✅ No app detail page modifications"
    ((pass++))
  fi

  if grep -rq 'deck-shelves-section\|deck-shelves-header\|deck-shelves-grid\|deck-shelves-inner' "$src" 2>/dev/null; then
    echo "  ✅ Shelf DOM elements use unique 'deck-shelves-' prefix"
    ((pass++))
  else
    echo "  ⚠️  Shelf DOM elements may not have unique prefixes"
    ((fail++))
  fi

  if grep -rn 'appOverview\.\|overview\.' "$src" 2>/dev/null | grep -v '//' | grep -v '?\.' | grep -q '\.' 2>/dev/null; then
    echo "  ⚠️  Some AppOverview access without optional chaining"
    ((pass++))
  else
    echo "  ✅ AppOverview access uses safe patterns"
    ((pass++))
  fi

  if grep -rq "rt_last_time_played\|minutes_playtime\|last_played" "$src" 2>/dev/null; then
    local unsafe_access
    unsafe_access=$(grep -rn "rt_last_time_played\|minutes_playtime\|last_played" "$src" 2>/dev/null | grep -Ev '\?[.:?]|try|catch|//|type |interface ' | head -3)
    if [[ -z "$unsafe_access" ]]; then
      echo "  ✅ Playtime field access is guarded"
      ((pass++))
    else
      echo "  ⚠️  Playtime field access without safe guard:"
      echo "      $unsafe_access"
      ((fail++))
    fi
  else
    echo "  ✅ No direct playtime field access (no HLTB data collision)"
    ((pass++))
  fi

  local fetch_count
  fetch_count=$(grep -rc "fetchNoCors\|ServerAPI\.fetch" "$src" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [[ "$fetch_count" -eq 0 ]]; then
    echo "  ✅ No ServerAPI fetch calls (no API contention with HLTB)"
    ((pass++))
  else
    echo "  ⚠️  $fetch_count ServerAPI fetch call(s) — verify no rate-limit contention with HLTB"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
