check_name="CSS Loader Theme"
check_version="Outrun"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  # Only flag refs outside comment lines — doc comments mentioning Outrun
  # (e.g. CSS pattern shared with Round/ArtHero) aren't theme coupling.
  # Same comment-exclude grammar as checks/plugins/tabmaster.sh.
  local code_hits
  code_hits=$(grep -Riln "outrun" "$src" 2>/dev/null | while IFS= read -r f; do
    if grep -iv '^\s*[/*]' "$f" 2>/dev/null | grep -iq "outrun"; then echo "$f"; fi
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
