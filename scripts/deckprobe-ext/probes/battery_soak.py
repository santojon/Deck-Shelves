#!/usr/bin/env python3
"""
Deck Shelves — long idle-Home battery soak on the device (run from the dev machine).

Two halves of N minutes each, Deck unplugged, nothing touched in between:
    A — as deployed (loader + standalone host if present) — the number users get;
    B — plugin-free: both hosts stopped, Steam relaunched.
Each half records the battery energy consumed (sysfs `energy_now`, falling back to
`charge_now × voltage_now`), the average draw, the renderer CPU, and — every
sample — the backlight level and whether the plugin's own screensaver/showcase
overlay is on screen, so a dimmed screen or an attract mode never hides inside
the average. The order is A then B so the device ends plugin-free only briefly;
both hosts are started again at the end.

Usage:
    python3 scripts/deckprobe-ext/probes/battery_soak.py                # 30 min per half
    python3 scripts/deckprobe-ext/probes/battery_soak.py --minutes=10 --sample=30
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


# energy_now(µWh) | charge_now(µAh) | voltage_now(µV) | current_now(µA) | AC | backlight | steamwebhelper ticks | uptime | CLK_TCK
SAMPLE = (
    "B=/sys/class/power_supply/BAT1; for f in energy_now charge_now voltage_now current_now; do cat $B/$f 2>/dev/null || echo 0; done; "
    "cat /sys/class/power_supply/ACAD/online 2>/dev/null || echo ?; cat /sys/class/backlight/*/brightness 2>/dev/null | head -1 || echo ?; "
    "for p in $(pgrep -f steamwebhelper); do awk '{print $14+$15}' /proc/$p/stat 2>/dev/null; done | awk '{s+=$1} END {print s+0}'; awk '{print $1}' /proc/uptime; getconf CLK_TCK"
)


def read_sample(env: dict) -> dict:
    v = ssh(env, SAMPLE).split()
    f = lambda i: float(v[i]) if i < len(v) and v[i] not in ("?", "") else 0.0  # noqa: E731
    energy_wh = f(0) / 1e6 if f(0) > 0 else (f(1) * f(2)) / 1e12
    return {"energyWh": round(energy_wh, 4), "watts": round(f(3) * f(2) / 1e12, 3), "ac": v[4] if len(v) > 4 else "?", "backlight": v[5] if len(v) > 5 else "?", "ticks": f(6), "uptime": f(7), "tck": f(8) or 100.0}


def overlay_state(host: str, port: int) -> str:
    try:
        b = cdp.open_session(host, port, "Big Picture")
        try:
            return b.evaluate("(() => { const ss = document.querySelector('[class*=screensaver], [data-ds-screensaver], [class*=showcase]'); const idle = !!document.getElementById('deck-shelves-home-root') && document.getElementById('deck-shelves-home-root').classList.contains('ds-idle'); return (ss ? 'overlay:' + String(ss.className).slice(0,20) : 'home') + (idle ? ' idle-paused' : ''); })()", timeout=15)
        finally:
            b.close()
    except Exception as e:
        return "cdp-err " + str(e)[:30]


def relaunch_steam(env: dict) -> None:
    old = ssh(env, "pgrep -xo steam || true")
    ssh(env, "killall steam || true")
    t0 = time.time()
    while time.time() - t0 < 150:
        pid = ssh(env, "pgrep -xo steam || true")
        if pid and pid != old:
            return
        time.sleep(3)


def half(name: str, env: dict, host: str, port: int, minutes: int, sample_s: int) -> dict:
    print(f"=== {name}: settling 90 s, then {minutes} min …", flush=True)
    time.sleep(90)
    start = read_sample(env)
    samples = []
    t0 = time.time()
    while time.time() - t0 < minutes * 60:
        time.sleep(sample_s)
        s = read_sample(env)
        s["overlay"] = overlay_state(host, port)
        s["t"] = round(time.time() - t0)
        samples.append(s)
        print(f"  {name} t={s['t']:4d}s {s['watts']:.2f} W  backlight={s['backlight']} ac={s['ac']} {s['overlay']}", flush=True)
    end = read_sample(env)
    used_wh = round(start["energyWh"] - end["energyWh"], 4)
    hours = (end["uptime"] - start["uptime"]) / 3600
    cpu = round(100.0 * (end["ticks"] - start["ticks"]) / end["tck"] / max(end["uptime"] - start["uptime"], 1), 2)
    avg_w = round(sum(s["watts"] for s in samples) / max(len(samples), 1), 3)
    rec = {"name": name, "minutes": minutes, "energyUsedWh": used_wh, "avgWFromEnergy": round(used_wh / hours, 3) if hours > 0 else None, "avgWSampled": avg_w, "rendererCpuPct": cpu,
           "backlightSeen": sorted({s["backlight"] for s in samples}), "overlaySeen": sorted({s["overlay"] for s in samples}), "acSeen": sorted({s["ac"] for s in samples}), "samples": samples}
    print(f"RESULT {name}: {used_wh} Wh in {minutes} min → {rec['avgWFromEnergy']} W (sampled {avg_w} W), renderer CPU {cpu} %, backlight {rec['backlightSeen']}, overlays {rec['overlaySeen']}", flush=True)
    return rec


def stop_loader(env: dict) -> None:
    sudo(env, "systemctl kill plugin_loader.service; sleep 2; systemctl kill -s KILL plugin_loader.service; systemctl stop plugin_loader.service")


# --single=hubonly: one half with the loader stopped and only the standalone host
# injecting — the plugin alone, without the other loader plugins — then restore.
def single_hub_only(env: dict, host: str, port: int, minutes: int, sample_s: int) -> None:
    print("hub-only: stopping the loader, relaunching Steam …", flush=True)
    stop_loader(env)
    ssh(env, "systemctl --user restart shelveshub.service")
    relaunch_steam(env)
    rec = half("C-hub-only-plugin", env, host, port, minutes, sample_s)
    print("restoring the loader, relaunching Steam …", flush=True)
    sudo(env, "systemctl start plugin_loader.service")
    relaunch_steam(env)
    out = ROOT / "site" / "reports" / "perf" / "battery-soak-latest.json"
    data = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    data["hubOnlyPlugin"] = rec
    if data.get("pluginFree", {}).get("avgWFromEnergy") is not None:
        data["deltaWPluginOnly"] = round((rec["avgWFromEnergy"] or 0) - data["pluginFree"]["avgWFromEnergy"], 3)
        print(f"RESULT delta (plugin alone via hub − plugin-free): {data['deltaWPluginOnly']} W")
    out.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    minutes = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--minutes=")), "30"))
    sample_s = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--sample=")), "60"))
    env = load_env()
    host, port = cdp.load_env()
    if "--single=hubonly" in sys.argv:
        single_hub_only(env, host, port, minutes, sample_s)
        return
    hub = ssh(env, "systemctl --user is-active shelveshub.service 2>/dev/null") == "active"
    print(f"hosts: loader={ssh(env, 'systemctl is-active plugin_loader.service')} hub={'active' if hub else 'inactive'}")
    a = half("A-with-plugin", env, host, port, minutes, sample_s)
    print("stopping both hosts, relaunching Steam …", flush=True)
    if hub:
        ssh(env, "systemctl --user stop shelveshub.service")
    stop_loader(env)
    relaunch_steam(env)
    b = half("B-plugin-free", env, host, port, minutes, sample_s)
    print("restoring hosts, relaunching Steam …", flush=True)
    sudo(env, "systemctl start plugin_loader.service")
    if hub:
        ssh(env, "systemctl --user start shelveshub.service")
    relaunch_steam(env)
    delta_w = round((a["avgWFromEnergy"] or 0) - (b["avgWFromEnergy"] or 0), 3)
    print(f"RESULT delta (plugin stack − plugin-free): {delta_w} W over {minutes} min halves")
    out_dir = ROOT / "site" / "reports" / "perf"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "battery-soak-latest.json").write_text(json.dumps({"recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S"), "minutesPerHalf": minutes, "standaloneHostAlsoActive": hub, "withPlugin": a, "pluginFree": b, "deltaW": delta_w}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
