check_name="TypeScript / Node"
check_version="Build Toolchain"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0

  if [[ -f "$root/tsconfig.json" ]]; then
    echo "  ✅ tsconfig.json exists"
    ((pass++))
  else
    echo "  ❌ tsconfig.json missing"
    ((fail++))
  fi

  if [[ -f "$root/package.json" ]]; then
    echo "  ✅ package.json exists"
    ((pass++))
  else
    echo "  ❌ package.json missing"
    ((fail++))
  fi

  if [[ -f "$root/pnpm-lock.yaml" ]]; then
    echo "  ✅ pnpm-lock.yaml exists (lockfile)"
    ((pass++))
  else
    echo "  ❌ pnpm-lock.yaml missing"
    ((fail++))
  fi

  if command -v node &>/dev/null; then
    local node_ver
    node_ver=$(node --version 2>/dev/null)
    echo "  ✅ Node.js $node_ver"
    ((pass++))
  else
    echo "  ❌ Node.js not found"
    ((fail++))
  fi

  if command -v pnpm &>/dev/null; then
    local pnpm_ver
    pnpm_ver=$(pnpm --version 2>/dev/null)
    echo "  ✅ pnpm $pnpm_ver"
    ((pass++))
  else
    echo "  ❌ pnpm not found"
    ((fail++))
  fi

  if [[ -d "$root/node_modules" ]]; then
    echo "  ✅ node_modules installed"
    ((pass++))
  else
    echo "  ❌ node_modules missing (run pnpm install)"
    ((fail++))
  fi

  if [[ -f "$root/vite.plugin.config.ts" ]]; then
    echo "  ✅ Vite config exists"
    ((pass++))
  else
    echo "  ❌ Vite config missing"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
