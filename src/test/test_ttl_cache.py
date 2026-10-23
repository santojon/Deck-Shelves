"""Tests for ttl_cache.py — the per-method answer cache behind the probe RPCs
(perf snapshot, Bluetooth and audio state); hardware info stays uncached."""
import asyncio
import threading

import pytest

from ttl_cache import TtlCache, wants_force


class FakeClock:
    def __init__(self, now=1000.0):
        self.now = now

    def __call__(self):
        return self.now


class Probe:
    """Counts calls and the thread each one ran on; raises while `fail` is set."""
    def __init__(self):
        self.calls = 0
        self.fail = False
        self.threads = []

    def __call__(self):
        self.calls += 1
        self.threads.append(threading.current_thread())
        if self.fail:
            raise RuntimeError("probe failed")
        return {"n": self.calls}


def test_two_calls_within_ttl_probe_once():
    clock, probe = FakeClock(), Probe()
    cache = TtlCache(5.0, probe, clock)
    first = cache.get()
    clock.now += 4.9
    assert cache.get() is first
    assert probe.calls == 1


def test_probes_again_after_ttl():
    clock, probe = FakeClock(), Probe()
    cache = TtlCache(5.0, probe, clock)
    cache.get()
    clock.now += 5.0
    assert cache.get() == {"n": 2}
    assert probe.calls == 2


def test_force_skips_a_fresh_entry():
    clock, probe = FakeClock(), Probe()
    cache = TtlCache(30.0, probe, clock)
    cache.get()
    assert cache.get(force=True) == {"n": 2}
    assert cache.get() == {"n": 2}  # the forced answer is the cached one now
    assert probe.calls == 2


def test_error_is_not_cached():
    clock, probe = FakeClock(), Probe()
    cache = TtlCache(10.0, probe, clock)
    probe.fail = True
    with pytest.raises(RuntimeError):
        cache.get()
    probe.fail = False
    assert cache.get() == {"n": 2}
    assert probe.calls == 2


def test_error_clears_the_previous_entry():
    clock, probe = FakeClock(), Probe()
    cache = TtlCache(10.0, probe, clock)
    cache.get()
    probe.fail = True
    with pytest.raises(RuntimeError):
        cache.get(force=True)
    probe.fail = False
    assert cache.get() == {"n": 3}  # nothing stale is served after a failure


def test_clock_stepped_backwards_expires_the_entry():
    clock, probe = FakeClock(), Probe()
    cache = TtlCache(30.0, probe, clock)
    cache.get()
    clock.now -= 3600
    cache.get()
    assert probe.calls == 2


def test_wants_force_reads_both_argument_shapes():
    assert wants_force() is False
    assert wants_force({}) is False               # loader: empty payload
    assert wants_force({"force": True}) is True   # loader: positional dict
    assert wants_force({"force": False}) is False
    assert wants_force(force=True) is True        # neutral runner: keyword
    assert wants_force(True) is True


# ── The RPC methods in main.py ────────────────────────────────────────────────

def _plugin_and_probe(monkeypatch, cache_name, ttl):
    import main
    probe, clock = Probe(), FakeClock()
    monkeypatch.setattr(main, cache_name, TtlCache(ttl, probe, clock))
    return main.Plugin(), probe, clock


def test_rpc_caches_are_wired_to_the_probes():
    import main
    assert (main._PERF_CACHE.probe, main._PERF_CACHE.ttl) == (main.read_perf_snapshot, 5.0)
    assert (main._BLUETOOTH_CACHE.probe, main._BLUETOOTH_CACHE.ttl) == (main._bt_state, 10.0)
    assert (main._AUDIO_CACHE.probe, main._AUDIO_CACHE.ttl) == (main._audio_state, 10.0)


@pytest.mark.parametrize("method, cache_name, ttl", [
    ("get_perf_snapshot", "_PERF_CACHE", 5.0),
    ("get_bluetooth_state", "_BLUETOOTH_CACHE", 10.0),
    ("get_audio_state", "_AUDIO_CACHE", 10.0),
])
def test_rpc_serves_the_cache_and_probes_off_the_event_loop(monkeypatch, method, cache_name, ttl):
    plugin, probe, clock = _plugin_and_probe(monkeypatch, cache_name, ttl)
    rpc = getattr(plugin, method)
    assert asyncio.run(rpc({})) == {"n": 1}  # loader shape: empty payload
    assert asyncio.run(rpc()) == {"n": 1}    # runner shape: no arguments
    assert probe.calls == 1
    clock.now += ttl
    assert asyncio.run(rpc()) == {"n": 2}
    assert probe.threads and all(t is not threading.main_thread() for t in probe.threads)


def test_rpc_force_flag_reprobes_in_both_shapes(monkeypatch):
    plugin, probe, _ = _plugin_and_probe(monkeypatch, "_BLUETOOTH_CACHE", 10.0)
    asyncio.run(plugin.get_bluetooth_state())
    assert asyncio.run(plugin.get_bluetooth_state({"force": True})) == {"n": 2}  # loader
    assert asyncio.run(plugin.get_bluetooth_state(force=True)) == {"n": 3}       # neutral runner
    assert asyncio.run(plugin.get_bluetooth_state()) == {"n": 3}
    assert probe.calls == 3


def test_hardware_info_is_not_cached(monkeypatch):
    # System information's Refresh re-reads the probe (a disk plugged in just
    # now must show), and no visibility rule calls it, so there is no cache.
    import main
    probe = Probe()
    monkeypatch.setattr(main, "_hardware_info", probe)
    plugin = main.Plugin()
    assert asyncio.run(plugin.get_hardware_info({})) == {"n": 1}
    assert asyncio.run(plugin.get_hardware_info()) == {"n": 2}
    assert probe.calls == 2
    assert all(t is not threading.main_thread() for t in probe.threads)
    assert not hasattr(main, "_HARDWARE_CACHE")
