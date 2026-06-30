"""Settings-file storage helpers: discover the Decky-managed plugin
settings directory and read/write the primary `settings.json` safely.

`_settings_dir` honours the Decky env var when set; otherwise falls back
to the conventional `~/.config/decky-loader/settings/deck-shelves` so
local-dev outside Decky still works.
"""
import json
import os
from typing import Any, Dict

# `decky` is the runtime-injected module from Decky Loader. It exists in
# both prod + dev contexts and exposes `DECKY_PLUGIN_SETTINGS_DIR` plus
# `logger`. Importing here keeps the storage helpers usable from main.py
# without requiring the Plugin class to forward the module reference.
import decky


def _settings_dir() -> str:
    return os.environ.get("DECKY_PLUGIN_SETTINGS_DIR") or getattr(decky, "DECKY_PLUGIN_SETTINGS_DIR", "") or os.path.expanduser("~/.config/decky-loader/settings/deck-shelves")


def _primary_file() -> str:
    return os.path.join(_settings_dir(), "settings.json")


def _safe_read_json(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        try:
            decky.logger.error(f"Failed reading json '{path}': {e}")
        except Exception:
            pass
        return {}
