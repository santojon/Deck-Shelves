#!/usr/bin/env bash
# Full validation flow: typecheck → build → tests → package → compat → deploy → uitests → perf.
# Device steps (deploy onward) skipped when build fails; every other step runs and is recorded.
# Usage: `pnpm validate:full` or `pnpm validate:full:stress`.

set -uo pipefail   # no -e: we handle exit codes ourselves

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
STRESS=0
[[ "${1:-}" == "--stress" ]] && STRESS=1

TS="$(date '+%Y-%m-%d_%H-%M-%S')"
TMP="${ROOT}/reports/local/.tmp_${TS}"
REPORT_DIR="${ROOT}/reports/local"
mkdir -p "${TMP}" "${REPORT_DIR}"

if [[ -f "${ROOT}/.env" ]]; then
  set -a; source "${ROOT}/.env"; set +a
fi

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; RESET='\033[0m'; BOLD='\033[1m'

declare -a STEP_NAMES=()
declare -a STEP_STATUS=()
declare -a STEP_LOG=()
declare -a STEP_DURATION_MS=()
_now_ms() { python3 -c 'import time; print(int(time.time()*1000))'; }

# Always generate the report — fires via EXIT trap regardless of what happened.
_report_generated=0
_generate_report() {
  # Run everything in a subshell with errexit+nounset OFF so no edge-case
  # (empty arrays, missing vars, early abort) can prevent the report from
  # being written and the path from being printed.
  (
    set +eu
    [[ "$_report_generated" == "1" ]] && exit 0
    _report_generated=1

    local report_path="${REPORT_DIR}/${TS}.html"
    mkdir -p "${REPORT_DIR}"

    # Write each array to its own file (one element per line) — NUL bytes
    # cannot survive $() subshell expansion in bash, so file-based I/O is the
    # only reliable approach for arrays that may contain spaces or special chars.
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
    try:
        lines = open(p).read().splitlines()
        return [l for l in lines]  # preserve empty strings
    except: return []
names, statuses, logs, durs = read('${_nf}'), read('${_sf}'), read('${_lf}'), read('${_df}')
durations_ms = [int(d) if d.isdigit() else 0 for d in durs]
json.dump({'names': names, 'statuses': statuses, 'logs': logs, 'durations_ms': durations_ms}, open('${steps_json}', 'w'))
" 2>/dev/null || echo '{"names":[],"statuses":[],"logs":[],"durations_ms":[]}' > "${steps_json}"
    rm -f "${_nf}" "${_sf}" "${_lf}" "${_df}" 2>/dev/null || true

    python3 "${SCRIPT_DIR}/report.py" \
      --ts "${TS}" --stress "${STRESS}" --subdir "local" \
      --tmp "${TMP}" --out "${report_path}" --root "${ROOT}" \
      --steps-json "${steps_json}" \
      || echo -e "  ${YELLOW}warn: report.py failed — check ${report_path}${RESET}"
    rm -f "${steps_json}" 2>/dev/null || true

    # Refresh per-scope aggregates so this run shows up in `reports/local/index.html`.
    # `--scope-only` skips top-level shells (gitignored, regenerated via `pnpm reports:rebuild`).
    python3 "${SCRIPT_DIR}/report.py" --rebuild --scope-only --root "${ROOT}" \
      || echo -e "  ${YELLOW}warn: aggregate rebuild failed${RESET}"

    echo -e "\n${BOLD}Report:${RESET} file://${report_path}"
  ) || true
}
trap '_generate_report; rm -rf "${TMP}" 2>/dev/null || true' EXIT INT TERM

run_step() {
  local key="$1" label="$2"; shift 2
  local log="${TMP}/${key}.log"
  STEP_NAMES+=("$label")
  STEP_LOG+=("$log")
  echo -e "${BOLD}▶ ${label}${RESET}"
  local _start _end
  _start=$(_now_ms)
  if "$@" >"$log" 2>&1; then
    _end=$(_now_ms); STEP_DURATION_MS+=("$((_end - _start))")
    echo -e "  ${GREEN}✓ PASS${RESET} ($(( (_end - _start) / 1000 ))s)"
    STEP_STATUS+=("pass")
    return 0
  else
    _end=$(_now_ms); STEP_DURATION_MS+=("$((_end - _start))")
    echo -e "  ${RED}✗ FAIL${RESET} ($(( (_end - _start) / 1000 ))s)"
    tail -20 "$log" | sed 's/^/    /'
    STEP_STATUS+=("fail")
    return 1
  fi
}

# Like run_step but treats device-unavailability errors as skip, not fail.
_NO_DEVICE_PATTERNS='Connection refused|Connection timed out|No route to host|ssh: connect to host|Network is unreachable|No target matching|timed out after|host key verification|Could not resolve hostname|Operation timed out'
run_device_step() {
  local key="$1" label="$2"; shift 2
  local log="${TMP}/${key}.log"
  STEP_NAMES+=("$label")
  STEP_LOG+=("$log")
  echo -e "${BOLD}▶ ${label}${RESET}"
  local _start _end
  _start=$(_now_ms)
  if "$@" >"$log" 2>&1; then
    _end=$(_now_ms); STEP_DURATION_MS+=("$((_end - _start))")
    echo -e "  ${GREEN}✓ PASS${RESET} ($(( (_end - _start) / 1000 ))s)"
    STEP_STATUS+=("pass")
    return 0
  else
    _end=$(_now_ms); STEP_DURATION_MS+=("$((_end - _start))")
    if grep -qE "${_NO_DEVICE_PATTERNS}" "$log" 2>/dev/null; then
      echo -e "  ${YELLOW}– SKIP (device unreachable)${RESET} ($(( (_end - _start) / 1000 ))s)"
      STEP_STATUS+=("skip")
    else
      echo -e "  ${RED}✗ FAIL${RESET} ($(( (_end - _start) / 1000 ))s)"
      tail -20 "$log" | sed 's/^/    /'
      STEP_STATUS+=("fail")
    fi
    return 1
  fi
}

skip_step() {
  local label="$1" reason="${2:-}"
  echo -e "  ${YELLOW}– SKIP: ${label}${RESET}"
  local log="${TMP}/skip_${#STEP_NAMES[@]}.log"
  [[ -n "$reason" ]] && printf '%s\n' "$reason" > "$log" || log=""
  STEP_NAMES+=("$label")
  STEP_STATUS+=("skip")
  STEP_LOG+=("$log")
  STEP_DURATION_MS+=("0")
}

BUILD_OK=1   # 1 = ok, 0 = build failed → device steps skipped

# ─── 1. Typecheck ─────────────────────────────────────────────────────────────
run_step "typecheck" "TypeScript typecheck" \
  pnpm --dir "${ROOT}" typecheck || true

# ─── 2. Build (production) ───────────────────────────────────────────────────
run_step "build" "Build (production)" \
  pnpm --dir "${ROOT}" build:release || BUILD_OK=0

# ─── 3. Unit tests ────────────────────────────────────────────────────────────
run_step "tests" "Unit tests (vitest)" \
  pnpm --dir "${ROOT}" test || true

# ─── 4. Package + verify ─────────────────────────────────────────────────────
run_step "package" "Package (.zip)" \
  bash "${ROOT}/scripts/build/package.sh" || true
run_step "verify_pkg" "Verify package" \
  bash "${ROOT}/scripts/build/verify-package.sh" || true

# ─── 5. Compat validation ────────────────────────────────────────────────────
run_step "compat" "Compat validation" \
  pnpm --dir "${ROOT}" validate:compat || true

# ── Device availability check (recorded as a step) ───────────────────────────
DEVICE_OK=0
_dev_log="${TMP}/device_check.log"
if [[ "$BUILD_OK" == "0" ]]; then
  printf 'Skipped — build failed, device check not attempted.\n' > "${_dev_log}"
  STEP_NAMES+=("Device availability"); STEP_STATUS+=("skip"); STEP_LOG+=("${_dev_log}")
  echo -e "  ${YELLOW}– SKIP: Device availability (build failed)${RESET}"
else
  echo -e "${BOLD}▶ Device availability${RESET}"
  _host="${DECK_HOST:-}"
  if [[ -z "$_host" ]]; then
    printf 'DECK_HOST is not set in .env — device steps will be skipped.\n' > "${_dev_log}"
    STEP_NAMES+=("Device availability"); STEP_STATUS+=("skip"); STEP_LOG+=("${_dev_log}")
    echo -e "  ${YELLOW}– SKIP (DECK_HOST not set)${RESET}"
  elif ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
           -o ConnectTimeout=5 -o BatchMode=yes \
           "${DECK_USER:-deck}@${_host}" "exit 0" >> "${_dev_log}" 2>&1; then
    printf 'Device reachable at %s.\n' "${_host}" >> "${_dev_log}"
    STEP_NAMES+=("Device availability"); STEP_STATUS+=("pass"); STEP_LOG+=("${_dev_log}")
    echo -e "  ${GREEN}✓ Device reachable${RESET}"
    DEVICE_OK=1
  else
    printf 'Could not reach device at %s (SSH ConnectTimeout=5).\nDevice steps will be skipped.\n' "${_host}" > "${_dev_log}"
    STEP_NAMES+=("Device availability"); STEP_STATUS+=("skip"); STEP_LOG+=("${_dev_log}")
    echo -e "  ${YELLOW}– SKIP (device unreachable at ${_host})${RESET}"
  fi
fi

# ── Device steps — skipped when device unreachable ───────────────────────────
if [[ "$DEVICE_OK" == "0" ]]; then
  skip_step "Deploy hard"         "Device not available — skipped."
  skip_step "UI tests"            "Device not available — skipped."
  skip_step "Performance benchmark" "Device not available — skipped."
else
  # ─── 6. Deploy ──────────────────────────────────────────────────────────────
  DEPLOY_OK=1
  if [[ "$STRESS" == "1" ]]; then
    run_device_step "deploy" "Deploy hard (stress fixture)" \
      env DS_QA_STRESS_FIXTURE=1 bash "${ROOT}/scripts/deploy/deploy-deck.sh" --hard || DEPLOY_OK=0
  else
    run_device_step "deploy" "Deploy hard" \
      bash "${ROOT}/scripts/deploy/deploy-deck.sh" --hard || DEPLOY_OK=0
  fi
  if [[ "$DEPLOY_OK" == "1" ]]; then
    echo "  waiting 25 s for Steam to restart…"
    sleep 25
  fi

  # ─── 7. UI tests ────────────────────────────────────────────────────────────
  if [[ "$STRESS" == "1" ]]; then
    run_device_step "uitests" "UI tests (all suites + stress)" \
      python3 -m deckprobe.uitests.run \
        --host "${DECK_HOST:-}" --port "${DECK_CDP_PORT:-8081}" \
        --out "${TMP}/uitest-screenshots" || true
  else
    run_device_step "uitests" "UI tests (all suites)" \
      python3 -m deckprobe.uitests.run \
        --host "${DECK_HOST:-}" --port "${DECK_CDP_PORT:-8081}" \
        --out "${TMP}/uitest-screenshots" \
        --only "perf,home,qam_shelves,qam_smart,qam_global_toggles,crash_protection,context_menu" || true
  fi

  # ─── 8. Perf bench ──────────────────────────────────────────────────────────
  run_device_step "perf" "Performance benchmark (perf:bench)" \
    python3 deckprobe/perf-bench.py || true
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
PASSED=$(printf '%s\n' "${STEP_STATUS[@]}" | grep -c "^pass$" || true)
FAILED=$(printf '%s\n' "${STEP_STATUS[@]}" | grep -c "^fail$" || true)
SKIPPED=$(printf '%s\n' "${STEP_STATUS[@]}" | grep -c "^skip$" || true)
TOTAL=${#STEP_STATUS[@]}

echo ""
if [[ "$FAILED" == "0" ]]; then
  echo -e "${GREEN}${BOLD}ALL PASS${RESET} — ${PASSED}/${TOTAL} steps passed, ${SKIPPED} skipped"
else
  echo -e "${RED}${BOLD}FAILED${RESET} — ${FAILED} failed, ${PASSED} passed, ${SKIPPED} skipped"
fi

# Report is generated by the EXIT trap (always runs).
[[ "$FAILED" == "0" ]] && exit 0 || exit 1
