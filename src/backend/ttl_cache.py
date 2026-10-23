"""Short-lived result cache for the probe RPCs.

The visibility rules ask the backend for CPU and peripheral state
every time a shelf is evaluated. Keeping each answer for a few seconds turns
those repeats into a dictionary lookup instead of another subprocess or
/proc read. One cache per method, process-local, nothing on disk. A probe
that raises leaves no entry behind, so the next call probes again.
"""
import threading
import time
from typing import Any, Callable, Optional


class TtlCache:
    def __init__(self, ttl: float, probe: Callable[[], Any], clock: Callable[[], float] = time.time) -> None:
        self.ttl = ttl
        self.probe = probe
        self._clock = clock
        self._lock = threading.Lock()
        self._value: Any = None
        self._at: Optional[float] = None

    def get(self, force: bool = False) -> Any:
        # The lock stays held across the probe, so a second caller waits for
        # the answer in flight instead of probing too. Callers run on worker
        # threads (asyncio.to_thread), never on the event loop.
        with self._lock:
            if not force and self._fresh():
                return self._value
            self._value, self._at = None, None  # a failing probe leaves it empty
            self._value = self.probe()
            self._at = self._clock()
            return self._value

    def _fresh(self) -> bool:
        # Wall clock, so a suspend ages the entry; a clock stepped backwards
        # counts as expired instead of keeping the entry alive for hours.
        if self._at is None:
            return False
        age = self._clock() - self._at
        return 0 <= age < self.ttl


def wants_force(force: Any = False, **kwargs: Any) -> bool:
    """Reads the `force` flag from either argument shape: the plugin loader
    delivers the frontend's argument as one positional dict, the neutral
    runner as keyword arguments."""
    if isinstance(force, dict):
        return bool(force.get("force"))
    return bool(force or kwargs.get("force"))
