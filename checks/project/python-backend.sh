check_name="Python Backend"
check_version="Decky Python"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if [[ ! -f "$root/main.py" ]]; then
    echo "  ❌ main.py missing"
    echo ""
    echo "  Result: 0 passed, 1 failed"
    return 1
  fi

  if python3 -c "import py_compile; py_compile.compile('$root/main.py', doraise=True)" 2>/dev/null; then
    echo "  ✅ main.py syntax valid"
    ((pass++))
  else
    echo "  ❌ main.py has syntax errors"
    ((fail++))
  fi

  if grep -q "class Plugin" "$root/main.py"; then
    echo "  ✅ Plugin class defined"
    ((pass++))
  else
    echo "  ❌ Plugin class missing"
    ((fail++))
  fi

  if grep -q "async def _main" "$root/main.py"; then
    echo "  ✅ _main lifecycle method found"
    ((pass++))
  else
    echo "  ⚠️  _main lifecycle method not found (optional)"
    ((pass++))
  fi

  if grep -q "async def _unload" "$root/main.py"; then
    echo "  ✅ _unload lifecycle method found"
    ((pass++))
  else
    echo "  ⚠️  _unload lifecycle method not found (optional)"
    ((pass++))
  fi

  local dangerous=0
  for mod in subprocess shutil; do
    if grep -q "import $mod" "$root/main.py"; then
      echo "  ⚠️  Uses $mod (review security)"
      ((dangerous++))
    fi
  done
  if [[ $dangerous -eq 0 ]]; then
    echo "  ✅ No dangerous module imports"
    ((pass++))
  else
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
