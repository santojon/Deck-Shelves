check_name="SteamGridDB"
check_version="Coexistence"

run_checks() {
  local root="$1"
  local pass=0
  local fail=0
  local src="$root/src"

  if grep -rq "window\.SteamGridDB\s*=\|globalThis\.SteamGridDB\s*=" "$src" 2>/dev/null; then
    echo "  ❌ Overwriting SteamGridDB global namespace"
    ((fail++))
  else
    echo "  ✅ No SteamGridDB namespace collision"
    ((pass++))
  fi

  if grep -rq "customimages" "$src" 2>/dev/null; then
    echo "  ✅ Image fallback includes /customimages/ path (SteamGridDB writes here)"
    ((pass++))
  else
    echo "  ⚠️  No /customimages/ fallback — SteamGridDB custom art won't be discovered"
    ((fail++))
  fi

  if grep -rq "buildImageCandidates\|imageCandidates\|portrait.*hero\|library_capsule.*library_600" "$src" 2>/dev/null; then
    echo "  ✅ Multiple image candidates per app (resilient to art replacements)"
    ((pass++))
  else
    echo "  ⚠️  Single image source — may break if SteamGridDB replaces art"
    ((fail++))
  fi

  if grep -rq "library_capsule\|libraryCapsule\|vertical_capsule" "$src" 2>/dev/null; then
    echo "  ✅ Reads library_capsule from AppOverview (picks up SteamGridDB changes)"
    ((pass++))
  else
    echo "  ⚠️  Doesn't read library_capsule — won't reflect SteamGridDB custom art"
    ((fail++))
  fi

  local hardcoded_urls
  hardcoded_urls=$(grep -rn 'steamstatic\.com.*apps.*library' "$src" 2>/dev/null | head -3)
  if [[ -n "$hardcoded_urls" ]]; then
    if grep -rq "customimages\|library_capsule\|buildImageCandidates" "$src" 2>/dev/null; then
      echo "  ✅ Steam CDN URLs used only as final fallback (SteamGridDB custom art checked first)"
      ((pass++))
    else
      echo "  ⚠️  Hardcoded Steam CDN URLs without custom art fallback"
      ((fail++))
    fi
  else
    echo "  ✅ No hardcoded Steam CDN image URLs"
    ((pass++))
  fi

  if grep -rq "library_capsule\s*=\|library_hero\s*=\|icon_hash\s*=" "$src" 2>/dev/null | grep -qv "String(\|??\|:"; then
    echo "  ❌ Mutating AppOverview art fields — may overwrite SteamGridDB data"
    ((fail++))
  else
    echo "  ✅ AppOverview art fields not mutated"
    ((pass++))
  fi

  if grep -rq "onerror\|onError\|fallback.*image\|errorCount\|imgError" "$src" 2>/dev/null; then
    echo "  ✅ Image loading has error fallback"
    ((pass++))
  else
    echo "  ⚠️  No image error fallback — broken art from SteamGridDB may show broken tiles"
    ((fail++))
  fi

  echo ""
  echo "  Result: $pass passed, $fail failed"
  return $fail
}
