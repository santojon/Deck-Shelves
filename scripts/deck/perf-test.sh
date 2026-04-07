#!/usr/bin/env bash
# Deck Shelves — On-device performance & sleep test
#
# Monitors battery drain, CPU load, and auto-sleep inhibitors on the Steam Deck
# while the plugin is running. Samples are collected via SSH every 30 seconds.
#
# Usage:
#   pnpm run deck:perf              # default 5 minutes
#   pnpm run deck:perf -- 10        # 10 minutes
#   DURATION=15 pnpm run deck:perf  # 15 minutes
#
# Requirements:
#   - .env with DECK_HOST / DECK_USER / DECK_SUDO_PASS
#   - SSH key auth or password agent configured
#
# Output: tabular report + pass/fail summary to stdout.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Load .env
if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

DURATION="${1:-${DURATION:-5}}"    # minutes
INTERVAL=30                         # seconds between samples
HOST="${DECK_HOST:-}"
USER_NAME="${DECK_USER:-deck}"

if [[ -z "$HOST" ]]; then
  echo "ERROR: DECK_HOST not set. Add it to .env or set the environment variable." >&2
  exit 1
fi

if ! [[ "$DURATION" =~ ^[0-9]+$ ]] || [[ "$DURATION" -lt 1 ]]; then
  echo "ERROR: Duration must be a positive integer (minutes). Got: $DURATION" >&2
  exit 1
fi

TOTAL_SAMPLES=$(( (DURATION * 60) / INTERVAL ))
SSH_CMD="ssh -o ConnectTimeout=10 -o BatchMode=yes ${USER_NAME}@${HOST}"

# ─── helpers ──────────────────────────────────────────────────────────────────

# Run a remote command, return stdout (never abort on non-zero)
remote() { $SSH_CMD "$@" 2>/dev/null || true; }

# Collect a snapshot: battery%, drain rate, cpu%, sleep inhibitors
collect_sample() {
  $SSH_CMD bash -s <<'EOF' 2>/dev/null
set -euo pipefail

# --- Battery ---
BAT_DIR=$(ls -d /sys/class/power_supply/BAT* 2>/dev/null | head -1)
if [[ -n "$BAT_DIR" ]]; then
  capacity=$(cat "$BAT_DIR/capacity" 2>/dev/null || echo "N/A")
  status=$(cat "$BAT_DIR/status" 2>/dev/null || echo "N/A")
  # Charge rate in µA (negative = discharging)
  current_ua=$(cat "$BAT_DIR/current_now" 2>/dev/null || echo "0")
  voltage_uv=$(cat "$BAT_DIR/voltage_now" 2>/dev/null || echo "0")
  # Power in mW: P = U*I / 10^6 (µV * µA → µW → mW)
  if [[ "$current_ua" != "0" && "$voltage_uv" != "0" ]]; then
    power_mw=$(( (voltage_uv / 1000) * (current_ua / 1000) / 1000000 ))
    power_mw=${power_mw#-}  # abs
  else
    power_mw="N/A"
  fi
else
  capacity="N/A"; status="N/A"; power_mw="N/A"
fi

# --- CPU (1-second window) ---
read -r c1 u1 n1 s1 i1 _ < /proc/stat
sleep 1
read -r c2 u2 n2 s2 i2 _ < /proc/stat
idle_delta=$(( i2 - i1 ))
total_delta=$(( (u2+n2+s2+i2) - (u1+n1+s1+i1) ))
if [[ $total_delta -gt 0 ]]; then
  cpu_pct=$(( 100 * (total_delta - idle_delta) / total_delta ))
else
  cpu_pct=0
fi

# --- Sleep inhibitors (systemd-inhibit) ---
inhibitors=$(systemd-inhibit --list --no-legend 2>/dev/null | grep -i "idle\|sleep\|handle-lid" || true)
inhibitor_count=$(echo "$inhibitors" | grep -c . || echo 0)
# Flag any inhibitor from our plugin specifically
ds_inhibit=$(echo "$inhibitors" | grep -i "deck.shelves\|deck-shelves" || true)

# --- Decky/plugin process (CPU by pid) ---
decky_cpu=$(ps aux 2>/dev/null | grep -i "decky\|plugin_loader" | grep -v grep | awk '{sum+=$3} END {printf "%.1f", sum}')
decky_cpu="${decky_cpu:-0}"

echo "capacity=$capacity status=$status power_mw=$power_mw cpu_pct=$cpu_pct inhibitor_count=$inhibitor_count ds_inhibit=$([ -n "$ds_inhibit" ] && echo YES || echo NO) decky_cpu=$decky_cpu"
EOF
}

# ─── pre-flight ───────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Deck Shelves — Performance & Sleep Test"
echo "  Host    : ${USER_NAME}@${HOST}"
echo "  Duration: ${DURATION} min  (${TOTAL_SAMPLES} samples @ ${INTERVAL}s)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Verify connection
if ! remote "echo ping" | grep -q ping; then
  echo "ERROR: Cannot connect to ${HOST}. Check DECK_HOST / SSH keys." >&2
  exit 1
fi
echo "✔ SSH connection OK"

# Check plugin is loaded
plugin_loaded=$(remote "ls ~/homebrew/plugins/deck-shelves/ 2>/dev/null | head -1")
if [[ -n "$plugin_loaded" ]]; then
  echo "✔ Plugin directory found"
else
  echo "⚠  Plugin directory not found — results may reflect baseline only"
fi
echo ""

# ─── sampling loop ────────────────────────────────────────────────────────────

printf "%-6s %-8s %-12s %-10s %-8s %-12s %-10s %-10s\n" \
  "T(s)" "Bat%" "Bat.Status" "Power(mW)" "CPU%" "Decky.CPU%" "Inhibitors" "DS.Inhibit"
printf "%-6s %-8s %-12s %-10s %-8s %-12s %-10s %-10s\n" \
  "------" "--------" "------------" "----------" "--------" "------------" "----------" "----------"

declare -a BAT_SAMPLES=()
declare -a CPU_SAMPLES=()
declare -a POWER_SAMPLES=()
DS_INHIBIT_DETECTED=0
elapsed=0

for (( i=0; i<TOTAL_SAMPLES; i++ )); do
  raw=$(collect_sample)

  capacity=$(echo "$raw" | grep -oP 'capacity=\K[^ ]+')
  status=$(echo "$raw"   | grep -oP 'status=\K[^ ]+')
  power_mw=$(echo "$raw" | grep -oP 'power_mw=\K[^ ]+')
  cpu_pct=$(echo "$raw"  | grep -oP 'cpu_pct=\K[^ ]+')
  inhibs=$(echo "$raw"   | grep -oP 'inhibitor_count=\K[^ ]+')
  ds_inh=$(echo "$raw"   | grep -oP 'ds_inhibit=\K[^ ]+')
  dk_cpu=$(echo "$raw"   | grep -oP 'decky_cpu=\K[^ ]+')

  [[ "$ds_inh" == "YES" ]] && DS_INHIBIT_DETECTED=1

  printf "%-6s %-8s %-12s %-10s %-8s %-12s %-10s %-10s\n" \
    "${elapsed}" "${capacity}%" "${status}" "${power_mw}" "${cpu_pct}%" "${dk_cpu}%" "${inhibs}" "${ds_inh}"

  [[ "$capacity" != "N/A" ]] && BAT_SAMPLES+=("$capacity")
  [[ "$cpu_pct"  != "N/A" ]] && CPU_SAMPLES+=("$cpu_pct")
  [[ "$power_mw" != "N/A" ]] && POWER_SAMPLES+=("$power_mw")

  elapsed=$(( elapsed + INTERVAL ))
  [[ $i -lt $((TOTAL_SAMPLES - 1)) ]] && sleep "$INTERVAL"
done

# ─── summary ─────────────────────────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"

# Battery drain
if [[ ${#BAT_SAMPLES[@]} -ge 2 ]]; then
  first_bat="${BAT_SAMPLES[0]}"
  last_bat="${BAT_SAMPLES[-1]}"
  drain=$(( first_bat - last_bat ))
  drain_per_hr=$(( drain * 60 / DURATION ))
  echo "  Battery  : ${first_bat}% → ${last_bat}%  (drain: ${drain}% in ${DURATION}min ≈ ${drain_per_hr}%/hr)"
else
  echo "  Battery  : insufficient samples"
fi

# Avg CPU
if [[ ${#CPU_SAMPLES[@]} -gt 0 ]]; then
  total_cpu=0
  for v in "${CPU_SAMPLES[@]}"; do total_cpu=$(( total_cpu + v )); done
  avg_cpu=$(( total_cpu / ${#CPU_SAMPLES[@]} ))
  echo "  Avg CPU  : ${avg_cpu}%"
fi

# Avg power
if [[ ${#POWER_SAMPLES[@]} -gt 0 ]]; then
  total_pwr=0
  for v in "${POWER_SAMPLES[@]}"; do total_pwr=$(( total_pwr + v )); done
  avg_pwr=$(( total_pwr / ${#POWER_SAMPLES[@]} ))
  echo "  Avg Power: ${avg_pwr} mW"
fi

echo ""
echo "─── Sleep / Auto-lock ────────────────────────────────────────────"
if [[ $DS_INHIBIT_DETECTED -eq 1 ]]; then
  echo "  ❌ FAIL  Plugin holds a sleep/idle inhibitor — screen may never auto-lock!"
  RESULT=1
else
  echo "  ✔  PASS  No sleep inhibitor from Deck Shelves detected"
  RESULT=0
fi

# Drain rate threshold: warn if > 25%/hr while idle on home screen
if [[ ${#BAT_SAMPLES[@]} -ge 2 ]]; then
  if [[ $drain_per_hr -gt 25 ]]; then
    echo "  ⚠  WARN  Battery drain ${drain_per_hr}%/hr exceeds 25%/hr threshold for idle home screen"
    RESULT=1
  else
    echo "  ✔  PASS  Battery drain ${drain_per_hr}%/hr is within acceptable range"
  fi
fi

echo ""
if [[ $RESULT -eq 0 ]]; then
  echo "  ✅ All checks passed"
else
  echo "  ❌ One or more checks failed — see above"
fi
echo "═══════════════════════════════════════════════════════════════════"
echo ""
exit $RESULT
