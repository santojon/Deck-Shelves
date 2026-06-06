#!/usr/bin/env bash
# On-device stress test — drives gamepad nav via CDP to scroll shelves continuously.
# Usage: `perf-stress-scroll.sh [minutes]` (default 5). Needs .env DECK_HOST/DECK_CDP_PORT + plugin live on home.
# Pair with `perf-test.sh --compare` to measure CPU/battery impact under sustained load.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  set -a; source "${PROJECT_ROOT}/.env"; set +a
fi

DURATION_MIN="${1:-${DURATION:-5}}"
HOST="${DECK_HOST:-}"
PORT="${DECK_CDP_PORT:-8081}"

if [[ -z "$HOST" ]]; then
  echo "ERROR: DECK_HOST not set in .env." >&2
  exit 1
fi

WS=$(curl -sS --max-time 5 "http://${HOST}:${PORT}/json" 2>/dev/null \
  | python3 -c "
import json, sys
try:
  for t in json.load(sys.stdin):
    if t.get('title') == 'SharedJSContext':
      print(t['webSocketDebuggerUrl']); break
except Exception:
  pass
")

if [[ -z "$WS" ]]; then
  echo "ERROR: SharedJSContext not reachable at ${HOST}:${PORT}." >&2
  exit 1
fi

echo "Stress target:  ${HOST}:${PORT}"
echo "Duration:       ${DURATION_MIN} min"
echo "WebSocket:      ${WS}"
echo ""

DURATION_S=$(( DURATION_MIN * 60 ))

# Minimal CDP helper — evaluates JS and prints the returned value.
cdp_eval() {
  local expr="$1"
  python3 - "$WS" "$expr" <<'PY'
import sys, json
from websocket import create_connection
ws_url, expr = sys.argv[1], sys.argv[2]
ws = create_connection(ws_url, timeout=20)
ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
ws.recv()
ws.send(json.dumps({"id": 2, "method": "Runtime.evaluate",
                    "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
while True:
  msg = json.loads(ws.recv())
  if msg.get("id") == 2:
    r = msg.get("result", {}).get("result", {})
    if "value" in r:
      v = r["value"]
      print(json.dumps(v) if isinstance(v, (dict, list)) else v)
    break
ws.close()
PY
}

# Run the stress loop inside the device — one round-trip only, no CDP
# traffic in the hot loop. DIR_RIGHT=12, DIR_LEFT=11, DIR_DOWN=10.
cdp_eval "(async () => {
  const ctrl = globalThis.FocusNavController
    ?? globalThis.GamepadNavTree?.m_context?.m_controller;
  if (!ctrl?.DispatchVirtualButtonClick) return 'FocusNavController unavailable';
  const deadline = Date.now() + ${DURATION_S} * 1000;
  let clicks = 0, directionChanges = 0;
  let dir = 12; // RIGHT
  const rowSteps = 12;
  while (Date.now() < deadline) {
    for (let i = 0; i < rowSteps && Date.now() < deadline; i++) {
      ctrl.DispatchVirtualButtonClick(dir, true);
      clicks++;
      await new Promise(r => setTimeout(r, 120));
    }
    ctrl.DispatchVirtualButtonClick(10, true); // DOWN to next shelf
    clicks++;
    directionChanges++;
    dir = dir === 12 ? 11 : 12; // zig-zag
    await new Promise(r => setTimeout(r, 220));
  }
  return { clicks, directionChanges, durationS: ${DURATION_S} };
})()"

echo ""
echo "Stress run complete."
