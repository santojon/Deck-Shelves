#!/usr/bin/env python3
"""
Deck Shelves — idle-Home CPU A/B (battery-cost proxy), measured on the device.

Samples the CPU time of Steam's renderer processes (steamwebhelper, split by
process type) over a window while the Home sits idle, in two states that both
start from a fresh Steam launch landed on the Home:
    B — plugin absent: the plugin loader is stopped, THEN Steam is restarted, so
        no plugin code is injected at all (stopping the loader alone leaves the
        already-injected frontend running in the renderer — not a baseline);
    A — plugin running: loader started again, Steam restarted once more.
Needs sudo. A true on-battery A/B additionally needs the Deck unplugged — the
AC state is reported so that's never left implicit.

Usage:
    python3 scripts/deckprobe-ext/probes/idle_cpu.py                # 120 s per half
    python3 scripts/deckprobe-ext/probes/idle_cpu.py --window=300 --settle=45
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from deckprobe.lib import cdp  # noqa: E402


def load_env() -> dict:
    env = {}
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def ssh(env: dict, cmd: str, timeout: int = 60) -> str:
    target = f"{env.get('DECK_USER', 'deck')}@{env['DECK_HOST']}"
    out = subprocess.run(["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=10", target, cmd], capture_output=True, text=True, timeout=timeout)
    return out.stdout.strip()


def sudo(env: dict, cmd: str, timeout: int = 60) -> str:
    pw = env.get("DECK_SUDO_PASS", "")
    return ssh(env, f"printf '%s\\n' '{pw}' | sudo -S bash -c {json.dumps(cmd)} 2>/dev/null", timeout)


# One line per steamwebhelper process: "<type> <utime+stime ticks>", then uptime and CLK_TCK.
TICKS = (
    "for p in $(pgrep -f steamwebhelper); do t=$(tr '\\0' ' ' < /proc/$p/cmdline 2>/dev/null | grep -oE -- '--type=[a-z-]+' | head -1); "
    "echo \"${t:-main} $(awk '{print $14+$15}' /proc/$p/stat 2>/dev/null)\"; done; echo \"__uptime $(awk '{print $1}' /proc/uptime)\"; echo \"__tck $(getconf CLK_TCK)\""
)


def sample(env: dict) -> tuple[dict[str, float], float, float]:
    by_type: dict[str, float] = {}
    uptime = tck = 0.0
    for line in ssh(env, TICKS).splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        if parts[0] == "__uptime":
            uptime = float(parts[1])
        elif parts[0] == "__tck":
            tck = float(parts[1])
        else:
            by_type[parts[0].replace("--type=", "")] = by_type.get(parts[0].replace("--type=", ""), 0.0) + float(parts[1])
    return by_type, uptime, tck


# Battery draw in watts (sysfs reports µW, or µA × µV on some kernels); None on AC / unavailable.
POWER = "cat /sys/class/power_supply/BAT1/power_now 2>/dev/null || echo; cat /sys/class/power_supply/BAT1/current_now 2>/dev/null || echo; cat /sys/class/power_supply/BAT1/voltage_now 2>/dev/null || echo"


def battery_watts(env: dict) -> float | None:
    parts = ssh(env, POWER).split("\n")
    try:
        if parts[0].strip():
            return abs(int(parts[0])) / 1e6
        if len(parts) > 2 and parts[1].strip() and parts[2].strip():
            return abs(int(parts[1])) * int(parts[2]) / 1e12
    except ValueError:
        pass
    return None


def cpu_percent(env: dict, window: int, on_battery: bool = False) -> dict[str, float]:
    a, u0, tck = sample(env)
    watts: list[float] = []
    if on_battery:
        for _ in range(max(1, window // 10)):
            time.sleep(10)
            w = battery_watts(env)
            if w is not None:
                watts.append(w)
    else:
        time.sleep(window)
    b, u1, _ = sample(env)
    secs = max(u1 - u0, 1e-6)
    out = {k: round(100.0 * (b.get(k, 0.0) - a.get(k, 0.0)) / tck / secs, 2) for k in sorted(set(a) | set(b))}
    out["total"] = round(sum(v for k, v in out.items()), 2)
    if watts:
        out["batteryW"] = round(sum(watts) / len(watts), 2)
    return out


def wait_home(host: str, port: int, timeout: float = 180.0) -> float | None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            bp = cdp.open_session(host, port, "Big Picture")
            try:
                href = bp.evaluate("location.pathname")
            finally:
                bp.close()
            if "/routes/" not in str(href):
                return round(time.time() - t0, 1)
        except Exception:
            pass
        time.sleep(4)
    return None


def relaunch_steam(env: dict, host: str, port: int, settle: int) -> None:
    old = ssh(env, "pgrep -xo steam || true")
    ssh(env, "killall steam || true")
    # The old Steam keeps answering CDP for a few seconds; wait for the new PID first.
    t0 = time.time()
    while time.time() - t0 < 150:
        pid = ssh(env, "pgrep -xo steam || true")
        if pid and pid != old:
            break
        time.sleep(3)
    t = wait_home(host, port)
    print(f"   Steam relaunched (pid {old} -> new) and back on the Home after {t}s; settling {settle}s …")
    time.sleep(settle)


def main() -> None:
    window = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--window=")), "120"))
    settle = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--settle=")), "45"))
    env = load_env()
    host, port = cdp.load_env()
    ac = ssh(env, "cat /sys/class/power_supply/ACAD/online 2>/dev/null; cat /sys/class/power_supply/BAT1/capacity 2>/dev/null").split()
    on_battery = bool(ac) and ac[0] == "0"
    print(f"power: AC online={ac[0] if ac else '?'} battery={ac[1] if len(ac) > 1 else '?'}% ({'on battery — sampling draw too' if on_battery else 'a true battery A/B needs AC online=0'})")
    # A standalone host on the same device would keep injecting the bundle with
    # the loader stopped — "plugin absent" means both hosts down.
    hub_active = ssh(env, "systemctl --user is-active shelveshub.service 2>/dev/null") == "active"
    print(f"B) plugin absent — stopping the loader{' + the standalone host' if hub_active else ''}, relaunching Steam …")
    if hub_active:
        ssh(env, "systemctl --user stop shelveshub.service")
    sudo(env, "systemctl kill plugin_loader.service; sleep 2; systemctl kill -s KILL plugin_loader.service; systemctl stop plugin_loader.service")
    relaunch_steam(env, host, port, settle)
    print(f"   sampling {window}s idle …")
    b = cpu_percent(env, window, on_battery)
    print(f"   steamwebhelper CPU (% of one core, by process type): {b}")
    print(f"A) plugin running — starting the loader{' + the standalone host' if hub_active else ''}, relaunching Steam …")
    sudo(env, "systemctl start plugin_loader.service")
    if hub_active:
        ssh(env, "systemctl --user start shelveshub.service")
    time.sleep(8)
    relaunch_steam(env, host, port, settle)
    print(f"   sampling {window}s idle …")
    a = cpu_percent(env, window, on_battery)
    print(f"   steamwebhelper CPU (% of one core, by process type): {a}")
    delta = round(a["total"] - b["total"], 2)
    print(f"RESULT idle-Home CPU delta attributable to loader+plugin: {delta} pp of one core (window {window}s each)")
    if "batteryW" in a and "batteryW" in b:
        print(f"RESULT battery draw: plugin-free {b['batteryW']} W, with plugin {a['batteryW']} W (delta {round(a['batteryW'] - b['batteryW'], 2)} W)")
    out_dir = ROOT / "site" / "reports" / "perf"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "idle-cpu-latest.json").write_text(json.dumps({
        "recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "windowS": window, "settleS": settle, "acOnline": ac[0] if ac else None,
        "batteryPct": ac[1] if len(ac) > 1 else None, "standaloneHostAlsoActive": hub_active, "withPlugin": a, "withoutPlugin": b, "deltaPp": delta,
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
