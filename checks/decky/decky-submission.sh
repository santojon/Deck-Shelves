check_name="Decky Store Submission"
check_version="Review Checklist"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if python3 -c "import json; json.load(open('$root/plugin.json'))" 2>/dev/null; then
    echo "  ✅ plugin.json is valid JSON"
    ((pass++))
  else
    echo "  ❌ plugin.json is invalid or missing"
    ((fail++))
  fi

  if python3 -c "
import json, re
d=json.load(open('$root/package.json'))
assert re.match(r'^[a-z0-9@][a-z0-9._-]*$', d['name']), 'invalid name'
assert re.match(r'^\d+\.\d+\.\d+', d['version']), 'invalid version'
" 2>/dev/null; then
    echo "  ✅ package.json name and version conform to npm standard"
    ((pass++))
  else
    echo "  ❌ package.json name/version not npm-compliant"
    ((fail++))
  fi

  if head -1 "$root/pnpm-lock.yaml" 2>/dev/null | grep -q "9.0"; then
    echo "  ✅ pnpm-lock.yaml lockfileVersion: 9.0"
    ((pass++))
  else
    echo "  ❌ pnpm-lock.yaml needs lockfileVersion: 9.0"
    ((fail++))
  fi

  if [[ -f "$root/LICENSE" ]] || [[ -f "$root/LICENSE.MD" ]]; then
    echo "  ✅ LICENSE file present"
    ((pass++))
  else
    echo "  ❌ LICENSE file missing (required for store)"
    ((fail++))
  fi

  if [[ ! -d "$root/backend" ]]; then
    echo "  ✅ No unused backend/ directory"
    ((pass++))
  else
    if [[ -n "$(ls -A "$root/backend" 2>/dev/null)" ]]; then
      echo "  ⚠️  backend/ directory exists — verify it is needed"
      ((pass++))
    else
      echo "  ❌ Empty backend/ directory (remove it)"
      ((fail++))
    fi
  fi

  if [[ ! -d "$root/defaults" ]]; then
    echo "  ✅ No unused defaults/ directory"
    ((pass++))
  else
    if [[ -f "$root/defaults/defaults.txt" ]] && [[ $(ls "$root/defaults" | wc -l) -eq 1 ]]; then
      echo "  ❌ defaults/ has only defaults.txt (remove it)"
      ((fail++))
    else
      echo "  ⚠️  defaults/ directory exists — verify it is needed"
      ((pass++))
    fi
  fi

  local suspicious=0
  for f in "$root/src/"*.ts "$root/src/"*.tsx "$root/src/components/"*.tsx "$root/src/runtime/"*.ts; do
    [[ -f "$f" ]] || continue
    if grep -qE 'fetch\(|XMLHttpRequest|eval\(' "$f" 2>/dev/null; then
      echo "  ⚠️  Potential remote code in $(basename "$f")"
      ((suspicious++))
    fi
  done
  if [[ $suspicious -eq 0 ]]; then
    echo "  ✅ No remote code execution patterns in source"
    ((pass++))
  else
    echo "  ⚠️  $suspicious file(s) with potential remote code — review needed"
    ((pass++))
  fi

  if [[ -f "$root/dist/index.js" ]]; then
    local line_count
    line_count=$(wc -l < "$root/dist/index.js" | tr -d ' ')
    if [[ "$line_count" -gt 5 ]]; then
      echo "  ✅ Built output is not heavily obfuscated ($line_count lines)"
      ((pass++))
    else
      echo "  ⚠️  Built output may be too minified ($line_count lines) — check case-by-case"
      ((pass++))
    fi
  else
    echo "  ⚠️  dist/index.js not found — build first"
    ((fail++))
  fi

  if ! grep -qE 'git\+ssh://|git@|file:' "$root/package.json" 2>/dev/null; then
    echo "  ✅ No private/local dependencies"
    ((pass++))
  else
    echo "  ⚠️  Private or local dependencies found"
    ((fail++))
  fi

  echo "  ✅ assets/icon.png not required (store uses publish.image)"
  ((pass++))

  if python3 -c "
import json
d=json.load(open('$root/plugin.json'))
flags=d.get('flags',[])
" 2>/dev/null; then
    local has_debug
    has_debug=$(python3 -c "import json; d=json.load(open('$root/plugin.json')); print('yes' if 'debug' in d.get('flags',[]) else 'no')" 2>/dev/null)
    if [[ "$has_debug" == "no" ]]; then
      echo "  ✅ No debug flag in plugin.json"
      ((pass++))
    else
      echo "  ⚠️  plugin.json has debug flag (removed during packaging)"
      ((pass++))
    fi
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
