check_name="CSS Loader Theme"
check_version="Outrun"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # Only flag refs outside comments — doc comments mentioning Outrun
  # (e.g. CSS pattern shared with Round/ArtHero) aren't theme coupling.
  # Strip /* */ block comments AND // line comments before scanning so
  # multi-line comments (prose continuation lines that don't start with
  # `/` or `*`) don't false-positive.
  local code_hits
  code_hits=$(grep -Riln "outrun" "$src" 2>/dev/null | while IFS= read -r f; do
    if python3 -c "import sys,re; t=open(sys.argv[1],encoding='utf-8',errors='ignore').read(); t=re.sub(r'/\*.*?\*/','',t,flags=re.S); t=re.sub(r'//[^\n]*','',t); sys.exit(0 if re.search('outrun',t,re.I) else 1)" "$f" 2>/dev/null; then echo "$f"; fi
  done)
  if [ -n "$code_hits" ]; then
    echo "  ❌ Source references 'outrun' outside comments (may indicate theme-specific coupling)"
    echo "     Files: $code_hits"
    ((fail++))
  else
    echo "  ✅ No 'outrun' references in code (comments OK)"
    ((pass++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
