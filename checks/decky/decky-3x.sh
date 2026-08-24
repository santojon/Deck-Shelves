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

  # No real @decky/api npm dependency — the host-neutral `@host/api` alias
  # (vite/tsconfig) resolves to src/shims/host-api.ts, which talks to Decky's
  # real runtime globals (DFL / deckyFrontendLib / the loader's secret connect
  # init) directly. Verify that wiring instead of a package.json entry.
  if grep -q 'DFL\|deckyFrontendLib' "$root/src/shims/host-api.ts" 2>/dev/null; then
    echo "  ✅ host-api shim talks to Decky's runtime API (DFL)"
    ((pass++))
  else
    echo "  ❌ host-api shim missing Decky runtime API wiring"
    ((fail++))
  fi

  if grep -q 'DFL\|deckyFrontendLib' "$root/src/shims/host-ui.ts" 2>/dev/null; then
    echo "  ✅ host-ui shim talks to Decky's runtime UI (DFL)"
    ((pass++))
  else
    echo "  ❌ host-ui shim missing Decky runtime UI wiring"
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

  # The loader module is imported (try/except) in the host-abstraction module
  # `plugin_host.py`, not main.py — so the same backend also runs on a neutral
  # host. Scan the backend .py files rather than main.py alone.
  if grep -q "import decky" "$root"/*.py "$root"/src/backend/*.py 2>/dev/null; then
    echo "  ✅ Uses 'import decky' (v3 style)"
    ((pass++))
  else
    echo "  ⚠️  Not using 'import decky' — check backend imports"
    ((fail++))
  fi

  if ! grep -q "from decky_plugin" "$root"/*.py "$root"/src/backend/*.py 2>/dev/null; then
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
