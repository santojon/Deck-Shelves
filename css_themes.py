"""Read CSS Loader (SDH-CssLoader) theme names off disk.

The injected `<style class="css-loader-style">` nodes only carry a per-block UUID
`id` (no theme name), and CSS Loader exposes no frontend store, so the only way to
name the *actual* active themes is the on-disk layout:

  ~/homebrew/themes/<Theme Folder>/theme.json        -> {"name": "..."}
  ~/homebrew/themes/<Theme Folder>/config_USER.json  -> {"active": true|false, ...}

Read-only + fail-soft: any missing directory / unreadable file yields empty lists
rather than raising, so a user without CSS Loader (or a changed layout) is safe.
"""
import json
import os
from typing import Any, Dict, List


def _themes_dir() -> str:
    home = os.environ.get("DECKY_HOME") or os.path.expanduser("~/homebrew")
    return os.path.join(home, "themes")


def _theme_name(theme_dir: str, folder: str) -> str:
    try:
        with open(os.path.join(theme_dir, "theme.json"), encoding="utf-8") as f:
            data = json.load(f)
        name = data.get("name")
        if isinstance(name, str) and name.strip():
            return name.strip()[:80]
    except Exception:
        pass
    return folder[:80]


def read_css_loader_themes() -> Dict[str, Any]:
    """{ "active": [names], "installed": <count> }. Active = the theme's
    config_USER.json has "active": true; name comes from theme.json, falling
    back to the folder name."""
    root = _themes_dir()
    active: List[str] = []
    installed = 0
    try:
        entries = sorted(os.listdir(root))
    except Exception:
        return {"active": [], "installed": 0}
    for folder in entries:
        theme_dir = os.path.join(root, folder)
        if not os.path.isdir(theme_dir) or folder.endswith(".profile"):
            continue
        installed += 1
        try:
            with open(os.path.join(theme_dir, "config_USER.json"), encoding="utf-8") as f:
                cfg = json.load(f)
        except Exception:
            continue
        if cfg.get("active") is True:
            active.append(_theme_name(theme_dir, folder))
    active.sort(key=str.lower)
    return {"active": active, "installed": installed}
