check_name="SteamOS 3.8"
check_version="Preview/Beta"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if grep -qE 'target.*es20' "$root/vite.plugin.config.ts" 2>/dev/null; then
    echo "  ✅ Modern ES target"
    ((pass++))
  else
    echo "  ⚠️  Check build target compatibility"
    ((fail++))
  fi

  if grep -qE 'chunkFileNames|splitChunks|manualChunks' "$root/vite.plugin.config.ts" 2>/dev/null; then
    echo "  ✅ Chunk splitting configured"
    ((pass++))
  else
    echo "  ✅ Single bundle (no chunk splitting needed)"
    ((pass++))
  fi

  if grep -rq 'from "@decky/api"\|from .@decky/api.' "$root/src/" 2>/dev/null; then
    echo "  ✅ Uses @decky/api (v3 API)"
    ((pass++))
  else
    echo "  ❌ Not using @decky/api"
    ((fail++))
  fi

  if ! grep -rqE 'import.*ServerAPI.*from|import.*{.*ServerAPI' "$root/src/" 2>/dev/null; then
    echo "  ✅ No legacy ServerAPI imports"
    ((pass++))
  else
    echo "  ❌ Legacy ServerAPI imports found"
    ((fail++))
  fi

  if [[ -f "$root/src/runtime/diagnostics.ts" ]]; then
    echo "  ✅ Diagnostics module for cross-version debugging"
    ((pass++))
  else
    echo "  ⚠️  No diagnostics module"
    ((pass++))
  fi

  if grep -q "DECKY_PLUGIN_SETTINGS_DIR" "$root/main.py" 2>/dev/null; then
    echo "  ✅ Settings use DECKY_PLUGIN_SETTINGS_DIR"
    ((pass++))
  else
    echo "  ❌ Settings not using Decky standard paths"
    ((fail++))
  fi

  local unsafe_paths=0
  for pattern in '"/etc/' '"/var/' '"/usr/' '"/opt/'; do
    if grep -q "$pattern" "$root/main.py" 2>/dev/null; then
      echo "  ❌ Accesses system path: $pattern"
      ((unsafe_paths++))
    fi
  done
  if [[ $unsafe_paths -eq 0 ]]; then
    echo "  ✅ No system path access from backend"
    ((pass++))
  else
    ((fail += unsafe_paths))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
