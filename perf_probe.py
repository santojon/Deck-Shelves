"""On-demand CPU / memory snapshot from the Linux /proc filesystem.

Read-only + fail-soft: a single `get_perf_snapshot` RPC samples instantaneous CPU
use (two /proc/stat reads ~100 ms apart) and available memory (/proc/meminfo).
The frontend only calls this when a shelf that uses a performance rule resolves —
there is NO background poll. Off SteamOS/Linux the /proc paths are absent, so the
values are None and `supported` is False (the rule is then treated as inert).
"""
import time
from typing import Any, Dict, Optional, Tuple


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


def read_perf_snapshot(stat_path: str = "/proc/stat", meminfo_path: str = "/proc/meminfo") -> Dict[str, Any]:
    try:
        cpu = read_cpu(stat_path)
    except Exception:
        cpu = None
    try:
        mem = read_mem_available_percent(meminfo_path)
    except Exception:
        mem = None
    return {"cpuPercent": cpu, "memAvailablePercent": mem, "supported": cpu is not None or mem is not None}
