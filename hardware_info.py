"""Static hardware identity — read-only, fail-soft, cross-OS, no background poll.

Backs the System information panel and the (opt-in) hardware block of the bug
report so a report names the actual machine — Steam Deck LCD/OLED or any PC —
without the user copying specs by hand. Linux reads DMI/sysfs + /proc; Windows
and macOS fall back to `platform` (+ ctypes for RAM on Windows). Every field is
optional: a probe that can't read returns None and the panel shows a dash.
"""
import os
import platform
import shutil
from typing import Any, Dict, Optional, Tuple

# Valve DMI product_name -> friendly Steam Deck model.
_DECK_MODELS = {
    "jupiter": "Steam Deck (LCD)",
    "galileo": "Steam Deck (OLED)",
}


def _read(path: str) -> Optional[str]:
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            return fh.read().strip() or None
    except OSError:
        return None


def _dmi(field: str) -> Optional[str]:
    return _read("/sys/devices/virtual/dmi/id/" + field)


def _model() -> Tuple[Optional[str], Optional[str]]:
    """(friendly model, raw product_name). A Valve Deck maps to LCD/OLED."""
    product = _dmi("product_name")
    vendor = _dmi("sys_vendor")
    if product:
        key = product.strip().lower()
        if vendor and "valve" in vendor.lower() and key in _DECK_MODELS:
            return _DECK_MODELS[key], product
        return product, product
    return (platform.node() or None), None


def _cpu() -> Optional[str]:
    # /proc/cpuinfo "model name" is the human string on Linux; platform.processor()
    # is usually empty there but populated on Windows/macOS.
    try:
        with open("/proc/cpuinfo", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip() or None
    except OSError:
        pass
    return platform.processor() or None


def _mem_linux() -> Optional[int]:
    try:
        with open("/proc/meminfo", encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                if line.startswith("MemTotal:"):
                    return int(line.split()[1]) * 1024  # kB -> bytes
    except (OSError, ValueError):
        pass
    return None


def _mem_posix() -> Optional[int]:
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
    except (ValueError, OSError, AttributeError):
        return None


def _mem_windows() -> Optional[int]:
    import ctypes

    class _Stat(ctypes.Structure):
        _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]

    try:
        st = _Stat()
        st.dwLength = ctypes.sizeof(_Stat)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):  # type: ignore[attr-defined]
            return int(st.ullTotalPhys)
    except Exception:
        pass
    return None


def _mem_total_bytes() -> Optional[int]:
    return _mem_linux() or _mem_posix() or _mem_windows()


def _gpu() -> Optional[str]:
    # Best-effort DRM card label; unknown GPUs show a dash (no PCI-id database, to
    # stay dependency-free).
    for card in ("card0", "card1"):
        label = _read("/sys/class/drm/" + card + "/device/label")
        if label:
            return label
    return None


def _disk() -> Tuple[Optional[int], Optional[int]]:
    try:
        usage = shutil.disk_usage(os.path.expanduser("~"))
        return usage.total, usage.free
    except OSError:
        return None, None


def get_hardware_info() -> Dict[str, Any]:
    """Static machine specs. Never raises — unknown fields come back None."""
    model, product = _model()
    total, free = _disk()
    return {
        "model": model,
        "product": product,
        "vendor": _dmi("sys_vendor"),
        "board": _dmi("board_name"),
        "cpu": _cpu(),
        "cpuCores": os.cpu_count(),
        "arch": platform.machine() or None,
        "memTotalBytes": _mem_total_bytes(),
        "gpu": _gpu(),
        "diskTotalBytes": total,
        "diskFreeBytes": free,
        "supported": True,
    }
