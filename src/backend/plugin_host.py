"""Host abstraction for the Python backend.

The backend runs under two hosts from the same files: the plugin loader
(which injects a `decky` module) and a neutral runner (which does not, and
must not be emulated). This module is the ONLY place that knows about the
loader module — everything else imports `logger` / `settings_dir` from here,
so the backend has no hard dependency on any host.
"""
import logging
import os
import sys

try:
    import decky as _loader  # present only under the plugin loader
except ImportError:  # neutral runner (e.g. ShelvesHub) — no loader module
    _loader = None


def _make_stderr_logger() -> logging.Logger:
    """Neutral fallback logger. The runner treats the child's stderr as a
    free-form log sink (stdout is reserved for line-delimited JSON RPC), so
    logging to stderr surfaces in the host's structured log."""
    log = logging.getLogger("deck-shelves")
    if not log.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter("%(levelname)s %(message)s"))
        log.addHandler(handler)
        log.setLevel(logging.INFO)
        log.propagate = False
    return log


# The loader's logger when present, else a stderr logger. Both expose the
# `.info` / `.error` / `.warning` methods the backend calls.
logger = getattr(_loader, "logger", None) or _make_stderr_logger()


def settings_dir() -> str:
    """The settings directory, resolved at runtime per host.

    Order: the neutral host's canonical env var first (so a machine hosting
    both keeps a single source of truth), then the loader env / attribute,
    then a conventional fallback for bare local-dev.
    """
    return (
        os.environ.get("DECK_SHELVES_SETTINGS_DIR")        # neutral runner (canonical)
        or os.environ.get("DECKY_PLUGIN_SETTINGS_DIR")     # loader env
        or getattr(_loader, "DECKY_PLUGIN_SETTINGS_DIR", "")
        or os.path.expanduser("~/.config/decky-loader/settings/deck-shelves")
    )
