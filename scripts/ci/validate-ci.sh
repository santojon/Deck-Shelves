#!/usr/bin/env bash
# CI validation (no device). Runs: typecheck → build → tests → package → compat.
# Routes to reports/release/ when running against a version tag (GITHUB_REF=refs/tags/v*),
# otherwise reports/ci/. Usage: `bash scripts/ci/validate-ci.sh` or `pnpm validate:ci`.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Auto-route release-tag runs to reports/release/ so the CI dashboard
# bucketises them correctly. Override via REPORT_SCOPE if needed.
SCOPE="${REPORT_SCOPE:-ci}"
if [[ -z "${REPORT_SCOPE:-}" && "${GITHUB_REF:-}" == refs/tags/v* ]]; then
  SCOPE="release"
fi

TS="$(date '+%Y-%m-%d_%H-%M-%S')"
REPORT_DIR="${ROOT}/reports/${SCOPE}"
TMP="${REPORT_DIR}/.tmp_${TS}"
mkdir -p "${TMP}" "${REPORT_DIR}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'; BOLD='\033[1m'

declare -a STEP_NAMES=() STEP_STATUS=() STEP_LOG=() STEP_DURATION_MS=()
_now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }
# Elapsed ms guarded against an empty _now_ms read (a transient python3
# spawn failure) — otherwise `$((end-start))` returns the raw end
# timestamp (~1.7e12) and corrupts the duration charts. See validate.sh.
_elapsed_ms() {
  local s="$1" e="$2"
  [[ "$s" =~ ^[0-9]+$ && "$e" =~ ^[0-9]+$ && "$e" -ge "$s" ]] || { echo 0; return; }
  echo "$((e - s))"
}

_report_generated=0
_generate_report() {
  (
    set +eu
    [[ "$_report_generated" == "1" ]] && exit 0
    _report_generated=1
    local report_path="${REPORT_DIR}/${TS}.html"
    mkdir -p "${REPORT_DIR}"
    local steps_json="${REPORT_DIR}/.tmp_steps_${TS}.json"
    local _nf="${steps_json}.names" _sf="${steps_json}.status" _lf="${steps_json}.logs" _df="${steps_json}.durations"
    : > "${_nf}"; : > "${_sf}"; : > "${_lf}"; : > "${_df}"
    for _v in "${STEP_NAMES[@]+"${STEP_NAMES[@]}"}";       do printf '%s\n' "${_v}" >> "${_nf}"; done
    for _v in "${STEP_STATUS[@]+"${STEP_STATUS[@]}"}";     do printf '%s\n' "${_v}" >> "${_sf}"; done
    for _v in "${STEP_LOG[@]+"${STEP_LOG[@]}"}";           do printf '%s\n' "${_v}" >> "${_lf}"; done
    for _v in "${STEP_DURATION_MS[@]+"${STEP_DURATION_MS[@]}"}"; do printf '%s\n' "${_v}" >> "${_df}"; done
    python3 -c "
import json
def read(p):
    try: return open(p).read().splitlines()
    except: return []
names, statuses, logs, durs = read('${_nf}'), read('${_sf}'), read('${_lf}'), read('${_df}')
durations_ms = [int(d) if d.isdigit() else 0 for d in durs]
json.dump({'names': names, 'statuses': statuses, 'logs': logs, 'durations_ms': durations_ms}, open('${steps_json}', 'w'))
" 2>/dev/null || echo '{"names":[],"statuses":[],"logs":[],"durations_ms":[]}' > "${steps_json}"
    rm -f "${_nf}" "${_sf}" "${_lf}" "${_df}" 2>/dev/null || true
    python3 "${SCRIPT_DIR}/report.py" \
      --ts "${TS}" --stress "0" --subdir "${SCOPE}" \
      --tmp "${TMP}" --out "${report_path}" --root "${ROOT}" \
      --steps-json "${steps_json}" \
      || echo -e "  ${YELLOW}warn: report.py failed${RESET}"
    rm -f "${steps_json}" 2>/dev/null || true

    # Refresh per-scope aggregates so the new run shows up in the manifest.
    # `--scope-only` skips top-level shells (gitignored, fetched client-side).
    python3 "${SCRIPT_DIR}/report.py" --rebuild --scope-only --root "${ROOT}" \
      || echo -e "  ${YELLOW}warn: aggregate rebuild failed${RESET}"

    echo -e "\n${BOLD}Report:${RESET} file://${report_path}"
  ) || true
}
trap '_generate_report; rm -rf "${TMP}" 2>/dev/null || true' EXIT INT TERM

run_step() {
  local key="$1" label="$2"; shift 2
  local log="${TMP}/${key}.log"
  STEP_NAMES+=("$label"); STEP_LOG+=("$log")
  echo -e "${BOLD}▶ ${label}${RESET}"
  local _start _end _dur
  _start=$(_now_ms)
  if "$@" >"$log" 2>&1; then
    _end=$(_now_ms); _dur=$(_elapsed_ms "$_start" "$_end"); STEP_DURATION_MS+=("$_dur")
    echo -e "  ${GREEN}✓ PASS${RESET} ($((_dur / 1000))s)"; STEP_STATUS+=("pass"); return 0
  else
    _end=$(_now_ms); _dur=$(_elapsed_ms "$_start" "$_end"); STEP_DURATION_MS+=("$_dur")
    echo -e "  ${RED}✗ FAIL${RESET} ($((_dur / 1000))s)"; tail -20 "$log" | sed 's/^/    /'
    STEP_STATUS+=("fail"); return 1
  fi
}

BUILD_OK=1

run_step "typecheck" "TypeScript typecheck"   pnpm --dir "${ROOT}" typecheck        || true
run_step "build"     "Build (production)"     pnpm --dir "${ROOT}" build:release   || BUILD_OK=0
run_step "tests"     "Unit tests (vitest)"    pnpm --dir "${ROOT}" test             || true
run_step "package"   "Package (.zip)"         bash "${ROOT}/scripts/build/package.sh"        || true
run_step "verify"    "Verify package"         bash "${ROOT}/scripts/build/verify-package.sh" || true
run_step "compat"    "Compat validation"      pnpm --dir "${ROOT}" validate:compat  || true

PASSED=$(printf '%s\n' "${STEP_STATUS[@]}" | grep -c "^pass$" || true)
FAILED=$(printf '%s\n' "${STEP_STATUS[@]}" | grep -c "^fail$" || true)
TOTAL=${#STEP_STATUS[@]}

echo ""
if [[ "$FAILED" == "0" ]]; then
  echo -e "${GREEN}${BOLD}ALL PASS${RESET} — ${PASSED}/${TOTAL}"
else
  echo -e "${RED}${BOLD}FAILED${RESET} — ${FAILED} failed, ${PASSED} passed"
fi
[[ "$FAILED" == "0" ]] && exit 0 || exit 1
