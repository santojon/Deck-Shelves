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

  # Locales are split into i18n/<locale>/<area>.json and merged at runtime; en-US is the base.
  if [[ ! -d "$i18n_dir/en-US" ]]; then
    echo "  ❌ en-US base locale directory missing"
    echo ""
    echo "  Result: 0 passed, 1 failed"
    return 1
  fi

  echo "  ✅ i18n/ directory exists"
  ((pass++))

  echo "  ✅ en-US base locale exists"
  ((pass++))

  local json_ok=true
  for f in "$i18n_dir"/*/*.json; do
    [[ -e "$f" ]] || continue
    if ! python3 -c "import json; json.load(open('$f'))" 2>/dev/null; then
      echo "  ❌ ${f#"$i18n_dir/"} is not valid JSON"
      json_ok=false
      ((fail++))
    fi
  done
  if $json_ok; then
    echo "  ✅ All locale slice files are valid JSON"
    ((pass++))
  fi

  # Key parity across locales is checked by scripts/build/validate.mjs.

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
