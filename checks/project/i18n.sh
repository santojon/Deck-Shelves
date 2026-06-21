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

  # i18n is sliced per locale into i18n/<locale>/<area>.json; the runtime
  # loader merges the areas. en-US is the base locale.
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

  # Merge a locale's area slices into one sorted key list, flagging any
  # cross-area key collision (the loader would silently overwrite).
  local merge_keys
  merge_keys() {
    python3 - "$1" <<'PY'
import json, sys, glob, os
seen = {}
dup = []
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.json"))):
    for k in json.load(open(f)):
        if k in seen:
            dup.append(k)
        seen[k] = True
if dup:
    sys.stderr.write(",".join(sorted(set(dup))))
print("\n".join(sorted(seen)))
PY
  }

  local base_keys
  base_keys=$(merge_keys "$i18n_dir/en-US")
  local base_count
  base_count=$(echo "$base_keys" | grep -c . )

  echo "  ✅ Base locale has $base_count keys"
  ((pass++))

  local all_consistent=true
  for d in "$i18n_dir"/*/; do
    local name
    name=$(basename "$d")
    [[ "$name" == "en-US" ]] && continue

    local dup_keys
    dup_keys=$(merge_keys "$d" 2>&1 1>/dev/null)
    if [[ -n "$dup_keys" ]]; then
      echo "  ❌ $name has duplicate keys across areas: $dup_keys"
      all_consistent=false
      ((fail++))
    fi

    local locale_keys
    locale_keys=$(merge_keys "$d" 2>/dev/null)

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
