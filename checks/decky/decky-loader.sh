check_name="Decky Loader"
check_version="API v1"

checks=(
  "plugin.json:api_version_is_1"
  "plugin.json:has_name_field"
  "plugin.json:has_author_field"
  "main.py:exists"
  "main.py:has_plugin_class"
  "dist/index.js:output_exists_after_build"
  "shims:decky_api_shim"
  "shims:decky_ui_shim"
)

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if python3 -c "import json; d=json.load(open('$root/plugin.json')); assert d.get('api_version')==1" 2>/dev/null; then
    echo "  ✅ plugin.json api_version == 1"
    ((pass++))
  else
    echo "  ❌ plugin.json api_version != 1"
    ((fail++))
  fi

  if python3 -c "import json; d=json.load(open('$root/plugin.json')); assert d.get('name')" 2>/dev/null; then
    echo "  ✅ plugin.json has name"
    ((pass++))
  else
    echo "  ❌ plugin.json missing name"
    ((fail++))
  fi

  if python3 -c "import json; d=json.load(open('$root/plugin.json')); assert d.get('author')" 2>/dev/null; then
    echo "  ✅ plugin.json has author"
    ((pass++))
  else
    echo "  ❌ plugin.json missing author"
    ((fail++))
  fi

  if [[ -f "$root/main.py" ]]; then
    echo "  ✅ main.py exists"
    ((pass++))
  else
    echo "  ❌ main.py missing"
    ((fail++))
  fi

  if grep -q "class Plugin" "$root/main.py" 2>/dev/null; then
    echo "  ✅ main.py has Plugin class"
    ((pass++))
  else
    echo "  ❌ main.py missing Plugin class"
    ((fail++))
  fi

  if [[ -f "$root/src/shims/decky-api.ts" ]]; then
    echo "  ✅ decky-api shim exists"
    ((pass++))
  else
    echo "  ❌ decky-api shim missing"
    ((fail++))
  fi

  if [[ -f "$root/src/shims/decky-ui.ts" ]]; then
    echo "  ✅ decky-ui shim exists"
    ((pass++))
  else
    echo "  ❌ decky-ui shim missing"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
