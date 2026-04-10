check_name="Internationalization"
check_version="i18n"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  local i18n_dir="$root/i18n"

  if [[ ! -d "$i18n_dir" ]]; then
    echo "  ❌ i18n/ directory missing"
    echo ""
    echo "  Result: 0 passed, 1 failed"
    return 1
  fi

  if [[ ! -f "$i18n_dir/en-US.json" ]]; then
    echo "  ❌ en-US.json base locale missing"
    echo ""
    echo "  Result: 0 passed, 1 failed"
    return 1
  fi

  echo "  ✅ i18n/ directory exists"
  ((pass++))

  echo "  ✅ en-US.json base locale exists"
  ((pass++))

  local json_ok=true
  for f in "$i18n_dir"/*.json; do
    local name
    name=$(basename "$f")
    if ! python3 -c "import json; json.load(open('$f'))" 2>/dev/null; then
      echo "  ❌ $name is not valid JSON"
      json_ok=false
      ((fail++))
    fi
  done
  if $json_ok; then
    echo "  ✅ All locale files are valid JSON"
    ((pass++))
  fi

  local base_keys
  base_keys=$(python3 -c "import json; print('\n'.join(sorted(json.load(open('$i18n_dir/en-US.json')).keys())))" 2>/dev/null)
  local base_count
  base_count=$(echo "$base_keys" | wc -l | tr -d ' ')

  echo "  ✅ Base locale has $base_count keys"
  ((pass++))

  local all_consistent=true
  for f in "$i18n_dir"/*.json; do
    local name
    name=$(basename "$f")
    [[ "$name" == "en-US.json" ]] && continue

    local locale_keys
    locale_keys=$(python3 -c "import json; print('\n'.join(sorted(json.load(open('$f')).keys())))" 2>/dev/null)

    local missing
    missing=$(comm -23 <(echo "$base_keys") <(echo "$locale_keys"))
    local extra
    extra=$(comm -13 <(echo "$base_keys") <(echo "$locale_keys"))

    if [[ -n "$missing" ]]; then
      echo "  ❌ $name missing keys: $(echo "$missing" | tr '\n' ', ')"
      all_consistent=false
      ((fail++))
    fi
    if [[ -n "$extra" ]]; then
      echo "  ⚠️  $name has extra keys: $(echo "$extra" | tr '\n' ', ')"
    fi
  done

  if $all_consistent; then
    echo "  ✅ All locales have consistent keys"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
