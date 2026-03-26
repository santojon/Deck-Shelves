check_name="UnifiDeck"
check_version="Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -rn "UnifiDeckStore\|UnifyDeckStore" "$src" 2>/dev/null | grep -v '//' | grep -qv '?\.' ; then
    echo "  ❌ UnifiDeckStore accessed without optional chaining"
    ((fail++))
  else
    echo "  ✅ UnifiDeckStore uses optional chaining"
    ((pass++))
  fi

  if grep -rn '\.UnifiDeck[^S]\|\.UnifyDeck[^S]' "$src" 2>/dev/null | grep -v '//' | grep -qv '?\.' ; then
    echo "  ❌ UnifiDeck global accessed without optional chaining"
    ((fail++))
  else
    echo "  ✅ UnifiDeck global uses optional chaining"
    ((pass++))
  fi

  local uni_files
  uni_files=$(grep -rln "UnifiDeckStore\|UnifyDeckStore\|UnifiDeck\|UnifyDeck" "$src" 2>/dev/null | grep -v '\.d\.ts$')
  local all_guarded=true
  for f in $uni_files; do
    if grep -q "UnifiDeckStore\|UnifyDeckStore" "$f" 2>/dev/null; then
      if ! grep -q "try {\|try$" "$f" 2>/dev/null; then
        all_guarded=false
        break
      fi
    fi
  done
  if $all_guarded; then
    echo "  ✅ UnifiDeck access in files with try/catch guards"
    ((pass++))
  else
    echo "  ❌ UnifiDeck access in files without try/catch guards"
    ((fail++))
  fi

  if grep -rqi "from.*unifideck\|require.*unifideck\|import.*unifideck\|from.*unifydeck\|require.*unifydeck\|import.*unifydeck" "$src" 2>/dev/null; then
    echo "  ❌ Hard dependency on UnifiDeck (import/require)"
    ((fail++))
  else
    echo "  ✅ No hard dependency on UnifiDeck"
    ((pass++))
  fi

  local has_unifi has_unify
  has_unifi=$(grep -rc "UnifiDeck" "$src" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  has_unify=$(grep -rc "UnifyDeck" "$src" 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
  if [[ "$has_unifi" -gt 0 ]] && [[ "$has_unify" -gt 0 ]]; then
    echo "  ✅ Handles both UnifiDeck and UnifyDeck spellings"
    ((pass++))
  elif [[ "$has_unifi" -gt 0 ]] || [[ "$has_unify" -gt 0 ]]; then
    echo "  ⚠️  Only one spelling variant handled (UnifiDeck=$has_unifi, UnifyDeck=$has_unify)"
    ((fail++))
  else
    echo "  ⚠️  No UnifiDeck/UnifyDeck probing found"
    ((fail++))
  fi

  if grep -rq "window\.UnifiDeck\s*=\|window\.UnifyDeck\s*=\|globalThis\.UnifiDeck\s*=\|globalThis\.UnifyDeck\s*=" "$src" 2>/dev/null; then
    echo "  ❌ Overwriting UnifiDeck global namespace"
    ((fail++))
  else
    echo "  ✅ No UnifiDeck namespace collision"
    ((pass++))
  fi

  if grep -rq "UnifiDeckStore\|UnifyDeckStore" "$src" 2>/dev/null; then
    echo "  ✅ Dynamic collection store probing includes UnifiDeck"
    ((pass++))
  else
    echo "  ⚠️  No UnifiDeck store probing (collections from UnifiDeck won't be discovered)"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
