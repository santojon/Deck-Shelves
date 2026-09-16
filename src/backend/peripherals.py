"""Bluetooth + audio-output peripherals — read-only, fail-soft, no background poll.

Bluetooth (Linux/BlueZ via `bluetoothctl`): lists paired devices (for the rule
editor's picker) and which are currently connected (for evaluation). Windows /
macOS have no bluetoothctl → empty + unsupported (the rule is inert there).

Audio (Linux via `wpctl`): reports whether the ACTIVE output sink is a
headphone / headset port — this catches the 3.5 mm jack (a port on the internal
device that Steam's frontend API doesn't expose). Bluetooth headphones are
covered by the per-device Bluetooth signal instead.
"""
import re
import subprocess
from typing import Any, Dict, List

_HEADPHONE_RE = re.compile(r"headphone|headset|earbud", re.IGNORECASE)


def _run(cmd: List[str], timeout: float = 3.0) -> str:
    try:
        return subprocess.check_output(cmd, timeout=timeout, stderr=subprocess.DEVNULL).decode("utf-8", "ignore")
    except Exception:
        return ""


def _parse_devices(text: str) -> List[Dict[str, str]]:
    # Lines look like: "Device AA:BB:CC:DD:EE:FF Some Name"
    out: List[Dict[str, str]] = []
    for line in text.splitlines():
        m = re.match(r"\s*Device\s+([0-9A-Fa-f:]{17})\s+(.*)", line)
        if m:
            out.append({"mac": m.group(1).upper(), "name": m.group(2).strip() or m.group(1).upper()})
    return out


def get_bluetooth_state() -> Dict[str, Any]:
    import shutil
    if not shutil.which("bluetoothctl"):
        return {"paired": [], "connected": [], "supported": False}
    paired = _parse_devices(_run(["bluetoothctl", "devices", "Paired"]))
    connected = [d["mac"] for d in _parse_devices(_run(["bluetoothctl", "devices", "Connected"]))]
    return {"paired": paired, "connected": connected, "supported": True}


def _default_sink_is_headphones(status: str) -> bool:
    in_sinks = False
    for raw in status.splitlines():
        content = raw.lstrip(" │├└─\t")  # drop wpctl's tree-drawing prefix
        if content.startswith("Sinks:"):
            in_sinks = True
            continue
        if not in_sinks:
            continue
        if content.startswith(("Sources:", "Filters:", "Streams:")):
            break  # next top-level section ends the sink list
        if content.startswith("*"):  # the default sink is flagged with '*'
            return bool(_HEADPHONE_RE.search(content))
    return False


def get_audio_state() -> Dict[str, Any]:
    import shutil
    if not shutil.which("wpctl"):
        return {"headphones": False, "supported": False}
    status = _run(["wpctl", "status"])
    if not status:
        return {"headphones": False, "supported": False}
    return {"headphones": _default_sink_is_headphones(status), "supported": True}
