check_name="CheatDeck"
check_version="Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -rqi "CheatDeck\|cheatdeck\|cheat_deck" "$src" 2>/dev/null; then
    local refs
    refs=$(grep -rcli "CheatDeck\|cheatdeck\|cheat_deck" "$src" 2>/dev/null | wc -l | tr -d ' ')
    if grep -rq "window\.CheatDeck\s*=\|globalThis\.CheatDeck\s*=" "$src" 2>/dev/null; then
      echo "  ❌ Overwriting CheatDeck global namespace"
      ((fail++))
    else
      echo "  ✅ References CheatDeck without overwriting ($refs files)"
      ((pass++))
    fi
  else
    echo "  ✅ No CheatDeck namespace collision (no references)"
    ((pass++))
  fi

  local high_z
  high_z=$(grep -roE 'zIndex\s*[:=]\s*"?[0-9]+' "$src" 2>/dev/null | grep -oE '[0-9]+$' | awk '$1 > 999' | head -3)
  if [[ -z "$high_z" ]]; then
    echo "  ✅ No high z-index values that would cover CheatDeck overlay"
    ((pass++))
  else
    echo "  ⚠️  z-index values > 999 ($high_z) may conflict with CheatDeck overlay"
    ((fail++))
  fi

  if grep -rq 'ROOT_ID\s*=\s*"deck-shelves-' "$src" 2>/dev/null; then
    echo "  ✅ DOM mount uses unique 'deck-shelves-' prefixed ID"
    ((pass++))
  else
    echo "  ❌ DOM mount ID not namespaced — may conflict with CheatDeck"
    ((fail++))
  fi

  local global_listeners
  global_listeners=$(grep -rn 'addEventListener.*keydown\|addEventListener.*gamepad\|addEventListener.*button' "$src" 2>/dev/null | grep -i 'window\|document\|globalThis' | grep -v 'deck-shelves' | head -3)
  if [[ -z "$global_listeners" ]]; then
    echo "  ✅ No global-level input event listeners"
    ((pass++))
  else
    echo "  ⚠️  Global event listeners found — may intercept CheatDeck input"
    echo "      $global_listeners"
    ((fail++))
  fi

  if grep -rn '\.Apps\.' "$src" 2>/dev/null | grep -v '//' | grep -qv '?\.' ; then
    echo "  ⚠️  Apps API accessed without optional chaining"
    ((fail++))
  else
    echo "  ✅ Apps API uses safe access patterns"
    ((pass++))
  fi

  local body_observers
  body_observers=$(grep -rn 'MutationObserver' "$src" 2>/dev/null | grep -i 'document\.body\|document\.documentElement' | head -3)
  if [[ -z "$body_observers" ]]; then
    echo "  ✅ MutationObservers are scoped (not on document.body)"
    ((pass++))
  else
    echo "  ⚠️  MutationObserver on document body — may conflict with CheatDeck reactivity"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
