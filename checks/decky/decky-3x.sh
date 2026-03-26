check_name="Decky Loader 3.x"
check_version="API v1"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if python3 -c "import json; d=json.load(open('$root/plugin.json')); assert d.get('api_version')==1" 2>/dev/null; then
    echo "  ✅ api_version == 1 (Decky 3.x compatible)"
    ((pass++))
  else
    echo "  ❌ api_version != 1 (Decky 3.x requires api_version 1)"
    ((fail++))
  fi

  if grep -q '"@decky/api"' "$root/package.json" 2>/dev/null; then
    echo "  ✅ Uses @decky/api package"
    ((pass++))
  else
    echo "  ❌ Missing @decky/api dependency"
    ((fail++))
  fi

  if grep -q '"@decky/ui"' "$root/package.json" 2>/dev/null; then
    echo "  ✅ Uses @decky/ui package"
    ((pass++))
  else
    echo "  ❌ Missing @decky/ui dependency"
    ((fail++))
  fi

  if grep -q "async def _main" "$root/main.py" 2>/dev/null; then
    echo "  ✅ Plugin._main lifecycle method"
    ((pass++))
  else
    echo "  ❌ Missing Plugin._main lifecycle method"
    ((fail++))
  fi

  if grep -q "async def _unload" "$root/main.py" 2>/dev/null; then
    echo "  ✅ Plugin._unload lifecycle method"
    ((pass++))
  else
    echo "  ❌ Missing Plugin._unload lifecycle method"
    ((fail++))
  fi

  if grep -q "import decky" "$root/main.py" 2>/dev/null; then
    echo "  ✅ Uses 'import decky' (v3 style)"
    ((pass++))
  else
    echo "  ⚠️  Not using 'import decky' — check backend imports"
    ((fail++))
  fi

  if ! grep -q "from decky_plugin" "$root/main.py" 2>/dev/null; then
    echo "  ✅ No legacy decky_plugin imports"
    ((pass++))
  else
    echo "  ❌ Still using legacy decky_plugin imports (use 'import decky')"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
