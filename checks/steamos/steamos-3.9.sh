check_name="SteamOS 3.9"
check_version="Stable"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if grep -qE 'target.*es20' "$root/vite.plugin.config.ts" 2>/dev/null; then
    echo "  ✅ Modern ES target (ES2020+)"
    ((pass++))
  else
    echo "  ❌ Build target may not be ES2020+ (required for 3.9)"
    ((fail++))
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
    echo "  ❌ Legacy ServerAPI imports found (incompatible with 3.9)"
    ((fail++))
  fi

  if grep -rqE 'typeof.*\?\.|\?\.' "$root/src/" 2>/dev/null; then
    echo "  ✅ Duck-typing / optional chaining used for API detection"
    ((pass++))
  else
    echo "  ⚠️  No duck-typing patterns detected (recommended for 3.9 API changes)"
    ((pass++))
  fi

  if grep -rqE 'FocusNavController|GamepadNavTree|GamepadUI' "$root/src/" 2>/dev/null; then
    echo "  ✅ FocusNavController/GamepadUI pattern referenced"
    ((pass++))
  else
    echo "  ⚠️  No FocusNavController reference (check navPatches.ts if applicable)"
    ((pass++))
  fi

  if grep -rqE 'vgp_' "$root/src/" 2>/dev/null; then
    echo "  ✅ vgp_* event patterns used"
    ((pass++))
  else
    echo "  ⚠️  No vgp_* events detected (may be needed for gamepad nav in 3.9)"
    ((pass++))
  fi

  if grep -rqE 'afterPatch|findInReactTree|findModuleChild' "$root/src/" 2>/dev/null; then
    echo "  ✅ Decky patcher utilities used (afterPatch/findInReactTree)"
    ((pass++))
  else
    echo "  ⚠️  No afterPatch/findInReactTree usage"
    ((pass++))
  fi

  if grep -q "DECKY_PLUGIN_SETTINGS_DIR" "$root/main.py" 2>/dev/null; then
    echo "  ✅ Settings use DECKY_PLUGIN_SETTINGS_DIR"
    ((pass++))
  else
    echo "  ❌ Settings not using Decky standard paths"
    ((fail++))
  fi

  if grep -qE 'match |case ' "$root/main.py" 2>/dev/null; then
    echo "  ✅ Python 3.10+ match/case syntax available"
    ((pass++))
  else
    echo "  ✅ No match/case usage (not required)"
    ((pass++))
  fi

  local hardcoded_versions=0
  # Only flag string comparisons using a SteamOS version — excludes SVG/JSX attrs and comments
  if grep -rE '(===|!==|==|!=|>=|<=)\s*["'"'"']3\.[5-9]["'"'"']|["'"'"']3\.[5-9]["'"'"']\s*(===|!==|==|!=|>=|<=)' "$root/src/" 2>/dev/null | grep -qvE '^\s*//' ; then
    echo "  ❌ Hardcoded SteamOS version comparisons found in src/"
    ((hardcoded_versions++))
    ((fail++))
  fi
  if [[ $hardcoded_versions -eq 0 ]]; then
    echo "  ✅ No hardcoded SteamOS version comparisons"
    ((pass++))
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
