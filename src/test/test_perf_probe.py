"""Tests for perf_probe — the multi-OS CPU/memory snapshot (psutil-first,
per-OS stdlib fallback)."""
import perf_probe


def test_snapshot_shape():
    snap = perf_probe.read_perf_snapshot()
    assert set(snap) == {"cpuPercent", "memAvailablePercent", "supported"}
    assert isinstance(snap["supported"], bool)
    for k in ("cpuPercent", "memAvailablePercent"):
        assert snap[k] is None or isinstance(snap[k], (int, float))


def test_cpu_percent_calc():
    # idle delta 50, total delta 100 → 50% idle → 50% busy
    assert perf_probe._cpu_percent((100, 200), (150, 300)) == 50.0
    # no time elapsed → None (avoids divide-by-zero)
    assert perf_probe._cpu_percent((100, 200), (100, 200)) is None


def test_mem_available_percent_linux(tmp_path):
    meminfo = tmp_path / "meminfo"
    meminfo.write_text("MemTotal:  1000 kB\nMemAvailable:  250 kB\n")
    assert perf_probe.read_mem_available_percent(str(meminfo)) == 25.0


def test_pages_parse_macos_vmstat():
    out = "Mach Virtual Memory Statistics: (page size of 16384 bytes)\nPages free:  100.\nPages inactive:  50.\n"
    assert perf_probe._pages(out, "Pages free") == 100
    assert perf_probe._pages(out, "Pages inactive") == 50
    assert perf_probe._pages(out, "Pages missing") == 0
