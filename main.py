import json
import os
from typing import Any, Dict

import decky

DEFAULT_SETTINGS: Dict[str, Any] = {"enabled": False, "shelves": []}


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



def _normalize_path(path: Any) -> str:
    if isinstance(path, dict):
        path = path.get("dest_path") or path.get("src_path") or path.get("path") or path.get("file")
    if not isinstance(path, str):
        return ""
    path = path.strip().strip('"').strip("'")
    if path.startswith("file://"):
        path = path[7:]
    return os.path.expanduser(path)



def _sanitize_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(settings, dict):
        settings = {}
    settings.setdefault("enabled", False)
    shelves = settings.get("shelves", [])
    if not isinstance(shelves, list):
        shelves = []
    sanitized = []
    for s in shelves:
        if not isinstance(s, dict):
            continue
        sid = str(s.get("id") or "")[:64]
        title = s.get("title") if isinstance(s.get("title"), str) else "Shelf"
        title = title.strip()[:64] if title else "Shelf"
        if title == "[object Object]":
            title = "Shelf"
        source = s.get("source") if isinstance(s.get("source"), dict) else {"type": "tab", "tab": "all"}
        try:
            limit = int(s.get("limit") or 12)
        except Exception:
            limit = 12
        limit = max(1, min(limit, 100))
        hidden = bool(s.get("hidden", False))
        enabled = bool(s.get("enabled", True))
        if not sid:
            continue
        sanitized.append({
            "id": sid,
            "title": title,
            "source": source,
            "limit": limit,
            "hidden": hidden,
            "enabled": enabled,
        })
    return {"enabled": bool(settings.get("enabled", False)), "shelves": sanitized}


class Plugin:
    settings_dir: str = ""

    def _ensure_dirs(self):
        Plugin.settings_dir = _settings_dir()
        os.makedirs(Plugin.settings_dir, exist_ok=True)

    def _read_state(self) -> Dict[str, Any]:
        self._ensure_dirs()
        path = _primary_file()
        if not path or not os.path.exists(path):
            return dict(DEFAULT_SETTINGS)
        data = _safe_read_json(path)
        state = data.get("state") if isinstance(data.get("state"), dict) else data
        clean = _sanitize_settings(state)
        if clean.get("shelves") or clean.get("enabled"):
            return clean
        return dict(DEFAULT_SETTINGS)

    def _write_state(self, state: Dict[str, Any]) -> None:
        self._ensure_dirs()
        clean = _sanitize_settings(state)
        wrapped = {"state": clean}
        path = _primary_file()
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(wrapped, f, ensure_ascii=False, indent=2)
        except Exception as e:
            try:
                decky.logger.error(f"Failed writing settings to {path}: {e}")
            except Exception:
                pass
            raise

    def _extract_settings(self, settings: Any = None, *args, **kwargs) -> Dict[str, Any]:
        candidates = [settings]
        if args:
            candidates.extend(args)
        if kwargs:
            candidates.append(kwargs.get("settings"))
            candidates.append(kwargs.get("payload"))
            candidates.append(kwargs)
        for candidate in candidates:
            if isinstance(candidate, dict):
                if isinstance(candidate.get("settings"), dict):
                    return candidate["settings"]
                if isinstance(candidate.get("payload"), dict):
                    return candidate["payload"]
                if "enabled" in candidate or "shelves" in candidate:
                    return candidate
        return {}

    async def get_settings(self, *args, **kwargs) -> Dict[str, Any]:
        return self._read_state()

    async def set_settings(self, settings: Dict[str, Any] | None = None, *args, **kwargs) -> bool:
        data = self._extract_settings(settings, *args, **kwargs)
        try:
            decky.logger.info(f"Deck Shelves set_settings called with: {data}")
        except Exception:
            pass
        if not isinstance(data, dict):
            try:
                decky.logger.error("Deck Shelves set_settings: received non-dict data")
            except Exception:
                pass
            return False
        clean = _sanitize_settings(data)
        try:
            decky.logger.info(f"Deck Shelves set_settings sanitized: {clean}")
        except Exception:
            pass
        try:
            self._write_state(clean)
            decky.logger.info("Deck Shelves set_settings: settings written successfully")
            return True
        except Exception as e:
            try:
                decky.logger.error(f"Failed saving settings: {e}")
            except Exception:
                pass
            return False

    async def reset_settings(self) -> Dict[str, Any]:
        self._write_state(DEFAULT_SETTINGS)
        return dict(DEFAULT_SETTINGS)

    async def get_tabmaster_tabs(self) -> Dict[str, Any]:
        """
        Reads TabMaster's settings.json and returns its tab list.
        TabMaster does not expose tabs via React context or IPC — the only
        reliable source is its settings file on disk.
        Returns { tabs: [{ id, title, position, filters, filtersMode }] }
        """
        decky_home = os.environ.get("DECKY_HOME") or os.path.expanduser("~/homebrew")
        settings_path = os.path.join(decky_home, "settings", "TabMaster", "settings.json")
        try:
            data = _safe_read_json(settings_path)
            users_dict = data.get("usersDict", {})
            if not users_dict:
                return {"tabs": [], "error": "no_users"}
            # Use the first (and usually only) user entry
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
            # Sort by position: visible (>= 0) first ascending, then hidden (-1)
            tabs.sort(key=lambda t: (t["position"] < 0, t["position"]))
            return {"tabs": tabs}
        except Exception as e:
            try:
                decky.logger.error(f"get_tabmaster_tabs failed: {e}")
            except Exception:
                pass
            return {"tabs": [], "error": str(e)}

    async def get_user_home(self) -> str:
        return os.path.expanduser("~")

    async def get_user_desktop(self) -> str:
        for candidate in [os.path.expanduser("~/Desktop"), os.path.expanduser("~/Downloads"), os.path.expanduser("~")]:
            if os.path.exists(candidate):
                return candidate
        return os.path.expanduser("~")

    async def export_settings(self, dest_path: Any = None, *args, **kwargs) -> bool:
        path = _normalize_path(dest_path if dest_path is not None else (args[0] if args else kwargs))
        if not path:
            return False
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            export_data = {"state": self._read_state()}
            with open(path, "w", encoding="utf-8") as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            try:
                decky.logger.error(f"Failed exporting settings to {path}: {e}")
            except Exception:
                pass
            return False

    async def import_settings(self, src_path: Any = None, *args, **kwargs) -> Dict[str, Any]:
        path = _normalize_path(src_path if src_path is not None else (args[0] if args else kwargs))
        if not path or not os.path.exists(path):
            return self._read_state()
        try:
            raw = _safe_read_json(path)
            imported = _sanitize_settings(raw.get("state") if isinstance(raw.get("state"), dict) else raw)
            self._write_state(imported)
            return imported
        except Exception as e:
            try:
                decky.logger.error(f"Failed importing settings from {path}: {e}")
            except Exception:
                pass
            return self._read_state()

    async def _main(self):
        self._ensure_dirs()
        if not os.path.exists(_primary_file()):
            self._write_state(self._read_state())
        try:
            decky.logger.info(f"Deck Shelves backend loaded. Settings dir: {Plugin.settings_dir}")
        except Exception:
            pass

    async def _unload(self):
        try:
            decky.logger.info("Deck Shelves backend unloaded")
        except Exception:
            pass

    async def _uninstall(self):
        try:
            decky.logger.info("Deck Shelves backend uninstalled")
        except Exception:
            pass

    async def _migration(self):
        pass
