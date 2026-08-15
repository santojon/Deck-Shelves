"""On-demand CPU / memory snapshot.

Read-only + fail-soft: a single `get_perf_snapshot` RPC samples instantaneous CPU
use and available memory. The frontend only calls this when a shelf that uses a
performance rule resolves — there is NO background poll.

Portable across every supported platform via `psutil` (Linux / Windows / macOS,
BSD-3-Clause like this plugin). Falls back to the Linux `/proc` reader when psutil
is unavailable; off Linux without psutil the values are None and `supported` is
False (the rule is then treated as inert).
"""
import os
import platform
import time
from typing import Any, Dict, Optional, Tuple

try:
    import psutil  # cross-platform CPU/memory
except Exception:  # psutil absent → per-OS stdlib fallback below
    psutil = None  # type: ignore[assignment]


def _parse_cpu_line(line: str) -> Tuple[int, int]:
    # "cpu user nice system idle iowait irq softirq steal ..."
    vals = [int(x) for x in line.split()[1:]]
    idle = vals[3] + (vals[4] if len(vals) > 4 else 0)  # idle + iowait
    return idle, sum(vals)


def _cpu_percent(a: Tuple[int, int], b: Tuple[int, int]) -> Optional[float]:
    idle_delta = b[0] - a[0]
    total_delta = b[1] - a[1]
    if total_delta <= 0:
        return None
    return round(100.0 * (1.0 - idle_delta / total_delta), 1)


def read_cpu(stat_path: str = "/proc/stat", sample_ms: int = 100) -> Optional[float]:
    def sample() -> Tuple[int, int]:
        with open(stat_path, encoding="utf-8") as f:
            return _parse_cpu_line(f.readline())
    a = sample()
    time.sleep(sample_ms / 1000.0)
    return _cpu_percent(a, sample())


def read_mem_available_percent(meminfo_path: str = "/proc/meminfo") -> Optional[float]:
    info: Dict[str, int] = {}
    with open(meminfo_path, encoding="utf-8") as f:
        for line in f:
            if ":" in line:
                key, rest = line.split(":", 1)
                info[key.strip()] = int(rest.strip().split()[0])  # value is in kB
    total = info.get("MemTotal", 0)
    avail = info.get("MemAvailable", info.get("MemFree", 0))
    if total <= 0:
        return None
    return round(100.0 * avail / total, 1)


def _psutil_snapshot() -> Optional[Dict[str, Any]]:
    if psutil is None:
        return None
    try:
        cpu = psutil.cpu_percent(interval=0.1)  # samples ~100 ms, like the /proc path
        vm = psutil.virtual_memory()
        total = getattr(vm, "total", 0)
        mem = round(100.0 * vm.available / total, 1) if total else None
        return {"cpuPercent": round(float(cpu), 1), "memAvailablePercent": mem, "supported": True}
    except Exception:
        return None


# ── No-psutil fallback: per-OS via the stdlib only (fail-soft) ─────────────────
def _mem_windows() -> Optional[float]:
    try:
        import ctypes

        class _MSX(ctypes.Structure):
            _fields_ = [
                ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong), ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong), ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]
        st = _MSX()
        st.dwLength = ctypes.sizeof(_MSX)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):  # type: ignore[attr-defined]
            return round(100.0 - float(st.dwMemoryLoad), 1)  # available% = 100 − load%
    except Exception:
        return None
    return None


def _cpu_windows(sample_ms: int = 100) -> Optional[float]:
    try:
        import ctypes

        class _FT(ctypes.Structure):
            _fields_ = [("lo", ctypes.c_ulong), ("hi", ctypes.c_ulong)]

        def _times() -> Tuple[int, int]:
            idle, kern, user = _FT(), _FT(), _FT()
            ctypes.windll.kernel32.GetSystemTimes(  # type: ignore[attr-defined]
                ctypes.byref(idle), ctypes.byref(kern), ctypes.byref(user))
            v = lambda ft: (ft.hi << 32) | ft.lo  # noqa: E731
            return v(idle), v(kern) + v(user)  # kernel time already includes idle
        i1, t1 = _times()
        time.sleep(sample_ms / 1000.0)
        i2, t2 = _times()
        total = t2 - t1
        return round(100.0 * (1.0 - (i2 - i1) / total), 1) if total > 0 else None
    except Exception:
        return None


def _pages(out: str, key: str) -> int:
    import re
    m = re.search(rf"{re.escape(key)}:\s+(\d+)\.", out)
    return int(m.group(1)) if m else 0


def _mem_macos() -> Optional[float]:
    try:
        import re
        import subprocess
        total = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], timeout=2).strip())
        out = subprocess.check_output(["vm_stat"], timeout=2).decode("utf-8", "ignore")
        pm = re.search(r"page size of (\d+)", out)
        page = int(pm.group(1)) if pm else 4096
        free = _pages(out, "Pages free") + _pages(out, "Pages inactive") + _pages(out, "Pages speculative")
        return round(100.0 * free * page / total, 1) if total else None
    except Exception:
        return None


def _cpu_macos() -> Optional[float]:
    # No instantaneous per-core % without Mach APIs, so use the 1-minute load
    # average normalised by core count as a portable "high CPU" proxy.
    try:
        n = os.cpu_count() or 1
        return round(min(100.0, 100.0 * os.getloadavg()[0] / n), 1)
    except Exception:
        return None


def _fallback_cpu_mem(stat_path: str, meminfo_path: str) -> Tuple[Optional[float], Optional[float]]:
    sysname = platform.system()
    if sysname == "Windows":
        return _cpu_windows(), _mem_windows()
    if sysname == "Darwin":
        return _cpu_macos(), _mem_macos()
    try:
        cpu = read_cpu(stat_path)
    except Exception:
        cpu = None
    try:
        mem = read_mem_available_percent(meminfo_path)
    except Exception:
        mem = None
    return cpu, mem


def read_perf_snapshot(stat_path: str = "/proc/stat", meminfo_path: str = "/proc/meminfo") -> Dict[str, Any]:
    # Prefer psutil (uniform across every OS); without it, per-OS stdlib readers
    # (Linux /proc, Windows ctypes, macOS sysctl/loadavg) keep it multi-OS.
    snap = _psutil_snapshot()
    if snap is not None:
        return snap
    cpu, mem = _fallback_cpu_mem(stat_path, meminfo_path)
    return {"cpuPercent": cpu, "memAvailablePercent": mem, "supported": cpu is not None or mem is not None}
