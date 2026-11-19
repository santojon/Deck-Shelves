"""Reads the tab list TabMaster keeps in its settings file."""
import os
from typing import Any, Dict

from plugin_host import logger
from storage import _safe_read_json


def get_tabmaster_tabs() -> Dict[str, Any]:
    """
    Reads TabMaster's settings.json and returns its tab list.
    TabMaster does not expose tabs via React context or IPC — the only
    reliable source is its settings file on disk.
    Returns { tabs: [{ id, title, position, filters, filtersMode }] }
    """
    decky_home = os.environ.get("DECKY_HOME") or os.path.expanduser("~/homebrew")
    settings_path = os.path.join(decky_home, "settings", "TabMaster", "settings.json")
    try:
        # TabMaster is optional; a missing settings file is normal, so return empty without logging.
        if not os.path.exists(settings_path):
            return {"tabs": [], "error": "file_not_found"}
        data = _safe_read_json(settings_path)
        users_dict = data.get("usersDict", {})
        if not users_dict:
            return {"tabs": [], "error": "no_users"}
        user_data = next(iter(users_dict.values()))
        raw_tabs = user_data.get("tabs", {})
        tabs = []
        for tab_id, tab in raw_tabs.items():
            if not isinstance(tab, dict):
                continue
            tabs.append({
                "id": str(tab.get("id", tab_id)),
                "title": str(tab.get("title", tab_id)),
                "position": int(tab.get("position", -1)),
                "filters": tab.get("filters", []),
                "filtersMode": str(tab.get("filtersMode", "and")),
            })
        # Visible tabs (position >= 0) first, then hidden ones (-1).
        tabs.sort(key=lambda t: (t["position"] < 0, t["position"]))
        try:
            visible = sum(1 for t in tabs if t["position"] >= 0)
            logger.info(f"get_tabmaster_tabs: returning {len(tabs)} tabs ({visible} visible)")
        except Exception:
            pass
        return {"tabs": tabs}
    except Exception as e:
        try:
            logger.error(f"get_tabmaster_tabs failed: {e}")
        except Exception:
            pass
        return {"tabs": [], "error": str(e)}
