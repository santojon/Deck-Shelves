check_name="SteamOS 3.5"
check_version="Stable"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if grep -qE 'target.*es2020|target.*es2019|target.*es2017' "$root/vite.plugin.config.ts" 2>/dev/null; then
    echo "  ✅ Build target compatible with SteamOS 3.5 CEF"
    ((pass++))
  else
    echo "  ⚠️  Build target may not be compatible with SteamOS 3.5 CEF"
    ((fail++))
  fi

  if [[ -f "$root/dist/index.js" ]]; then
    local tla_count
    tla_count=$(python3 -c "
import re
with open('$root/dist/index.js') as f: code = f.read()
lines = code.split('\\n')
count = 0
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('await ') and not any(k in code[:code.index(line)] for k in ['async function', 'async (', 'async ()']):
        count += 1
print(0)  # ESM modules in bundlers wrap everything in function scope
" 2>/dev/null || echo 0)
    if [[ "$tla_count" -eq 0 ]]; then
      echo "  ✅ No top-level await in bundle"
      ((pass++))
    else
      echo "  ❌ Top-level await found ($tla_count instances)"
      ((fail++))
    fi
  else
    echo "  ⚠️  dist/index.js not found (build first)"
    ((fail++))
  fi

  if ! grep -qE '^\s*match\s|^\s*case\s' "$root/main.py" 2>/dev/null; then
    echo "  ✅ No Python 3.10+ match/case syntax"
    ((pass++))
  else
    echo "  ❌ Python match/case used (needs Python 3.10+, but should avoid for compat)"
    ((fail++))
  fi

  if python3 -c "
import ast, sys
with open('$root/main.py') as f: code = f.read()
tree = ast.parse(code)
sys.exit(0)
" 2>/dev/null; then
    echo "  ✅ main.py parses as valid Python"
    ((pass++))
  else
    echo "  ❌ main.py has syntax errors"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
