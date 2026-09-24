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
import string
from typing import Any, Dict, List, Optional, Tuple

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


def _home_dev() -> Optional[int]:
    try:
        return os.stat(os.path.expanduser("~")).st_dev
    except OSError:
        return None


def _disk_entry(path: str, label: str, seen: set) -> Optional[Dict[str, Any]]:
    try:
        dev = os.stat(path).st_dev
    except OSError:
        return None
    if dev in seen:
        return None
    seen.add(dev)
    try:
        usage = shutil.disk_usage(path)
    except OSError:
        return None
    return {"label": label, "totalBytes": usage.total, "freeBytes": usage.free}


def _external_disks_linux(roots: Tuple[str, ...] = ("/run/media", "/media")) -> List[Dict[str, Any]]:
    # SD cards / USB drives / external SSDs auto-mount here on SteamOS and
    # most desktop Linux (udisks2); each is its own subdirectory per user.
    # `roots` is overridable so tests can point at a fake mount layout.
    out: List[Dict[str, Any]] = []
    seen = {_home_dev()} - {None}
    for root in roots:
        try:
            users = list(os.scandir(root))
        except OSError:
            continue
        for user in users:
            try:
                mounts = list(os.scandir(user.path)) if user.is_dir() else []
            except OSError:
                continue
            for entry in mounts:
                if not entry.is_dir():
                    continue
                found = _disk_entry(entry.path, entry.name, seen)
                if found:
                    out.append(found)
    return out


def _external_disks_macos(root: str = "/Volumes") -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = {_home_dev()} - {None}
    try:
        volumes = list(os.scandir(root))
    except OSError:
        return out
    for entry in volumes:
        if not entry.is_dir():
            continue
        found = _disk_entry(entry.path, entry.name, seen)
        if found:
            out.append(found)
    return out


def _external_disks_windows() -> List[Dict[str, Any]]:
    import ctypes

    out: List[Dict[str, Any]] = []
    home_drive = os.path.splitdrive(os.path.expanduser("~"))[0].upper()
    try:
        bitmask = ctypes.windll.kernel32.GetLogicalDrives()  # type: ignore[attr-defined]
    except Exception:
        return out
    for i, letter in enumerate(string.ascii_uppercase):
        if not (bitmask >> i) & 1:
            continue
        drive = f"{letter}:\\"
        if drive.rstrip("\\").upper() == home_drive:
            continue
        try:
            # DRIVE_REMOVABLE=2, DRIVE_FIXED=3 — skip network/CD-ROM/unknown.
            if ctypes.windll.kernel32.GetDriveTypeW(drive) not in (2, 3):  # type: ignore[attr-defined]
                continue
        except Exception:
            continue
        label_buf = ctypes.create_unicode_buffer(261)
        try:
            ctypes.windll.kernel32.GetVolumeInformationW(  # type: ignore[attr-defined]
                drive, label_buf, 260, None, None, None, None, 0)
        except Exception:
            pass
        try:
            usage = shutil.disk_usage(drive)
        except OSError:
            continue
        out.append({"label": label_buf.value or drive, "totalBytes": usage.total, "freeBytes": usage.free})
    return out


def _external_disks() -> List[Dict[str, Any]]:
    """SD card / USB / external SSD volumes, alongside the internal figure
    from `_disk()` above — never raises, empty list when none are found."""
    try:
        system = platform.system()
        if system == "Windows":
            return _external_disks_windows()
        if system == "Darwin":
            return _external_disks_macos()
        return _external_disks_linux()
    except Exception:
        return []


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
        "externalDisks": _external_disks(),
        "supported": True,
    }
