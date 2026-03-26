check_name="Decky Store"
check_version="Publishing"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if python3 -c "import json; d=json.load(open('$root/plugin.json')); assert len(d.get('publish',{}).get('tags',[]))>0" 2>/dev/null; then
    echo "  ✅ plugin.json has publish tags"
    ((pass++))
  else
    echo "  ❌ plugin.json missing publish tags"
    ((fail++))
  fi

  if python3 -c "import json; d=json.load(open('$root/plugin.json')); assert d.get('publish',{}).get('description','')" 2>/dev/null; then
    echo "  ✅ plugin.json has publish description"
    ((pass++))
  else
    echo "  ❌ plugin.json missing publish description"
    ((fail++))
  fi

  if [[ -f "$root/LICENSE" ]]; then
    echo "  ✅ LICENSE file exists"
    ((pass++))
  else
    echo "  ❌ LICENSE file missing"
    ((fail++))
  fi

  if [[ -f "$root/README.md" ]]; then
    echo "  ✅ README.md exists"
    ((pass++))
  else
    echo "  ❌ README.md missing"
    ((fail++))
  fi

  if [[ -d "$root/assets" ]]; then
    echo "  ✅ assets/ directory exists"
    ((pass++))
  else
    echo "  ❌ assets/ directory missing"
    ((fail++))
  fi

  if python3 -c "import json; d=json.load(open('$root/package.json')); v=d.get('version',''); assert v and v!='0.0.0'" 2>/dev/null; then
    echo "  ✅ package.json has version"
    ((pass++))
  else
    echo "  ❌ package.json missing or invalid version"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
