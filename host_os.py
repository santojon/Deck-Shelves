"""Host OS identity — read-only, fail-soft, cross-OS. Backs System information
and the pre-filled bug report so they name the ACTUAL host (SteamOS / a Linux
distro / Windows / macOS) and version on EVERY platform, not just the Deck.

Python's `platform` module is the authoritative source (the Steam frontend's
GetSystemInfo is sparse off SteamOS); `/etc/os-release` distinguishes SteamOS,
Bazzite, HoloISO, ChimeraOS and other Linux distros so the bug-report OS field
maps to the right template option everywhere.
"""
import platform
from typing import Any, Dict, Optional


def _os_release() -> Dict[str, str]:
    """Parse /etc/os-release (Linux). Empty dict off Linux or on any error."""
    out: Dict[str, str] = {}
    try:
        with open("/etc/os-release", encoding="utf-8") as fh:
            for line in fh:
                key, sep, val = line.partition("=")
                if sep:
                    out[key.strip()] = val.strip().strip('"').strip("'")
    except OSError:
        pass
    return out


def get_host_os() -> Dict[str, Any]:
    """Cross-OS host identity. Never raises — returns best-effort fields with a
    friendly `name`, a raw `system`, the Linux `distroId` (os-release ID) and an
    `isSteamOS` flag the frontend maps to the bug-report OS dropdown."""
    system = platform.system()  # "Linux" | "Windows" | "Darwin" | ""
    machine = platform.machine() or None
    distro_id: Optional[str] = None
    pretty: Optional[str] = None
    steamos_version: Optional[str] = None
    version: Optional[str] = None
    is_steamos = False
    try:
        if system == "Linux":
            rel = _os_release()
            distro_id = (rel.get("ID") or "").lower() or None
            id_like = (rel.get("ID_LIKE") or "").lower()
            is_steamos = distro_id == "steamos" or "steamos" in id_like
            pretty = rel.get("PRETTY_NAME") or None
            steamos_version = rel.get("VERSION_ID") or None
            version = steamos_version or platform.release() or None
        elif system == "Windows":
            rel = platform.win32_ver()  # (release, version, csd, ptype)
            version = rel[0] or platform.release() or None
            pretty = f"Windows {version}" if version else "Windows"
        elif system == "Darwin":
            mac = platform.mac_ver()  # (version, (...), machine)
            version = mac[0] or platform.release() or None
            pretty = f"macOS {version}" if version else "macOS"
        else:
            version = platform.release() or None
    except Exception:
        version = None

    if is_steamos:
        name = "SteamOS"
    elif system == "Darwin":
        name = "macOS"
    elif system == "Windows":
        name = "Windows"
    elif system == "Linux":
        name = "Linux"
    else:
        name = system or "Unknown"

    return {
        "system": system or None,        # raw platform.system()
        "name": name,                    # friendly OS name
        "distroId": distro_id,           # Linux os-release ID (steamos/bazzite/…)
        "prettyName": pretty,            # PRETTY_NAME / composed label
        "version": version,
        "machine": machine,              # x86_64 / aarch64 / arm64 …
        "isSteamOS": is_steamos,
        "steamosVersion": steamos_version,
        "supported": True,
    }
