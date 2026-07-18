"""External-display / dock detection — multi-OS, read-only, fail-soft.

Linux (incl. SteamOS/gamescope): the DRM connectors under
`/sys/class/drm/<card>-<CONNECTOR>/status` ("connected" | "disconnected"). The
internal Deck panel is `eDP`; any OTHER connected connector (DP / HDMI) means an
external display — i.e. docked. `Writeback` connectors are virtual and ignored.

Windows / macOS: no DRM sysfs, so we fall back to the active **monitor count**
via the stdlib (`ctypes`): more than one display means an external one is
attached. When nothing can be determined, `supported` is False and the rule is
treated as inert (never mis-classifies).
"""
import glob
import os
import platform
from typing import Any, Dict, Optional

DRM_ROOT = "/sys/class/drm"


def _external_via_drm(drm_root: str) -> Optional[bool]:
    paths = glob.glob(os.path.join(drm_root, "*", "status"))
    if not paths:
        return None  # not a DRM system → let the per-OS fallback answer
    for path in paths:
        name = os.path.basename(os.path.dirname(path)).lower()  # e.g. "card0-dp-1"
        if "edp" in name or "writeback" in name:
            continue
        try:
            with open(path, encoding="utf-8") as f:
                if f.read().strip().lower() == "connected":
                    return True
        except Exception:
            continue
    return False


def _monitors_windows() -> Optional[bool]:
    try:
        import ctypes
        n = ctypes.windll.user32.GetSystemMetrics(80)  # type: ignore[attr-defined]  # SM_CMONITORS
        return n > 1 if n else None
    except Exception:
        return None


def _monitors_macos() -> Optional[bool]:
    # Precise like the Linux DRM path: external = any ACTIVE display that is not
    # the built-in panel (CGDisplayIsBuiltin), not merely "more than one".
    try:
        import ctypes
        cg = ctypes.CDLL("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
        cg.CGDisplayIsBuiltin.restype = ctypes.c_int
        max_d = 16
        arr = (ctypes.c_uint32 * max_d)()
        count = ctypes.c_uint32(0)
        if cg.CGGetActiveDisplayList(max_d, arr, ctypes.byref(count)) != 0 or count.value == 0:
            return None
        return any(not cg.CGDisplayIsBuiltin(arr[i]) for i in range(count.value))
    except Exception:
        return None


def _external_via_monitor_count() -> Optional[bool]:
    sysname = platform.system()
    if sysname == "Windows":
        return _monitors_windows()
    if sysname == "Darwin":
        return _monitors_macos()
    return None


def read_display_state(drm_root: str = DRM_ROOT) -> Dict[str, Any]:
    ext = _external_via_drm(drm_root)
    if ext is None:
        ext = _external_via_monitor_count()
    if ext is None:
        return {"external": False, "supported": False}
    return {"external": ext, "supported": True}
