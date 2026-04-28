import json
import os
from typing import Any, Dict

import decky

DEFAULT_SETTINGS: Dict[str, Any] = {"enabled": False, "hideRecents": False, "recentsReplaceSource": False, "hideHomeTabs": False, "shelfHeroBackground": False, "globalMatchNativeSize": False, "globalHighlightFirst": False, "globalHighlightAll": False, "globalHideStatusLine": False, "globalHideNewBadge": False, "globalHideCompatIcons": False, "globalHideNonSteamBadge": False, "globalHideShelfTitle": False, "shelves": [], "smartShelvesEnabled": False, "smartShelvesAtBottom": False, "smartShelves": [], "smartSurpriseMe": False, "smartSurpriseMeCount": 0}


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
        # Migrate stale "Recently Played" template shelves: an earlier version
        # of the template emitted source = {type:"tab", tab:"recent"}, but the
        # runtime tab list does not include "recent" — the edit modal can't
        # match the dropdown option and the shelf appears unconfigured. The
        # filter-source equivalent (sort by recent activity) round-trips
        # cleanly through the modal and produces the same result on the home.
        if isinstance(source, dict) and source.get("type") == "tab" and source.get("tab") == "recent":
            source = {"type": "filter", "filter": {"sort": "recent"}}
        try:
            limit = int(s.get("limit") or 12)
        except Exception:
            limit = 12
        limit = max(1, min(limit, 100))
        hidden = bool(s.get("hidden", False))
        enabled = bool(s.get("enabled", True))
        match_native_size = bool(s.get("matchNativeSize", False))
        highlight_first = bool(s.get("highlightFirst", False))
        highlight_all = bool(s.get("highlightAll", False))
        hide_status_line = bool(s.get("hideStatusLine", False))
        hide_new_badge = bool(s.get("hideNewBadge", False))
        hide_compat_icons = bool(s.get("hideCompatIcons", False))
        hide_non_steam_badge = bool(s.get("hideNonSteamBadge", False))
        hide_shelf_title = bool(s.get("hideShelfTitle", False))
        valid_sorts = {"alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual"}
        shelf_sort = str(s.get("sort") or "")
        raw_manual = s.get("manualOrder")
        manual_ids: list = []
        if isinstance(raw_manual, list):
            for v in raw_manual:
                try:
                    n = int(v)
                    if n > 0:
                        manual_ids.append(n)
                except Exception:
                    continue
        raw_highlighted = s.get("highlightedAppIds")
        highlighted_ids: list = []
        if isinstance(raw_highlighted, list):
            for v in raw_highlighted:
                try:
                    n = int(v)
                    if n > 0:
                        highlighted_ids.append(n)
                except Exception:
                    continue
        if not sid:
            continue
        shelf_entry: Dict[str, Any] = {
            "id": sid,
            "title": title,
            "source": source,
            "limit": limit,
            "hidden": hidden,
            "enabled": enabled,
            "matchNativeSize": match_native_size,
            "highlightFirst": highlight_first,
            "highlightAll": highlight_all,
            "hideStatusLine": hide_status_line,
            "hideNewBadge": hide_new_badge,
            "hideCompatIcons": hide_compat_icons,
            "hideNonSteamBadge": hide_non_steam_badge,
            "hideShelfTitle": hide_shelf_title,
        }
        if shelf_sort and shelf_sort in valid_sorts:
            shelf_entry["sort"] = shelf_sort
        if highlighted_ids:
            shelf_entry["highlightedAppIds"] = highlighted_ids
        if manual_ids:
            shelf_entry["manualOrder"] = manual_ids
        manual_base_sort = str(s.get("manualBaseSort") or "")
        if manual_base_sort and manual_base_sort in valid_sorts and manual_base_sort != "manual":
            shelf_entry["manualBaseSort"] = manual_base_sort
        sanitized.append(shelf_entry)
    # Sanitize smart shelves
    raw_smart = settings.get("smartShelves", [])
    if not isinstance(raw_smart, list):
        raw_smart = []
    sanitized_smart = []
    valid_modes = {"quick_play", "not_started", "deck_picks", "rediscover", "best_unplayed", "interrupted", "time_of_day", "daily_pick", "on_deck", "recently_played", "long_session", "non_steam", "random_pick", "forgotten", "spare_time"}
    for ss in raw_smart:
        if not isinstance(ss, dict):
            continue
        ss_id = str(ss.get("id") or "")[:64]
        ss_title = ss.get("title") if isinstance(ss.get("title"), str) else ""
        ss_title = ss_title.strip()[:64] if ss_title else ""
        ss_mode = str(ss.get("mode") or "")
        if not ss_id or not ss_title or ss_mode not in valid_modes:
            continue
        ss_enabled = bool(ss.get("enabled", True))
        ss_hidden = bool(ss.get("hidden", False))
        try:
            ss_limit = int(ss.get("limit") or 20)
            ss_limit = max(1, min(ss_limit, 100))
        except Exception:
            ss_limit = 20
        entry: Dict[str, Any] = {"id": ss_id, "title": ss_title, "mode": ss_mode, "enabled": ss_enabled, "hidden": ss_hidden}
        if ss.get("limit") is not None:
            entry["limit"] = ss_limit
        # Optional user overrides on top of the mode's natural output.
        ss_sort = str(ss.get("sort") or "")
        if ss_sort and ss_sort in valid_sorts:
            entry["sort"] = ss_sort
        ss_base = str(ss.get("manualBaseSort") or "")
        if ss_base and ss_base in valid_sorts and ss_base != "manual":
            entry["manualBaseSort"] = ss_base
        raw_ss_manual = ss.get("manualOrder")
        if isinstance(raw_ss_manual, list):
            ss_manual_ids: list = []
            for v in raw_ss_manual:
                try:
                    n = int(v)
                    if n > 0:
                        ss_manual_ids.append(n)
                except Exception:
                    continue
            if ss_manual_ids:
                entry["manualOrder"] = ss_manual_ids
        ss_filter_group = ss.get("filterGroup")
        if isinstance(ss_filter_group, dict):
            entry["filterGroup"] = ss_filter_group
        # Visual overrides mirrored from regular shelves.
        for bool_key in ("matchNativeSize", "highlightFirst", "highlightAll", "hideStatusLine", "hideNewBadge", "hideCompatIcons", "hideNonSteamBadge", "hideShelfTitle"):
            if bool_key in ss:
                entry[bool_key] = bool(ss.get(bool_key, False))
        raw_ss_highlighted = ss.get("highlightedAppIds")
        if isinstance(raw_ss_highlighted, list):
            ss_highlighted_ids: list = []
            for v in raw_ss_highlighted:
                try:
                    n = int(v)
                    if n > 0:
                        ss_highlighted_ids.append(n)
                except Exception:
                    continue
            if ss_highlighted_ids:
                entry["highlightedAppIds"] = ss_highlighted_ids
        # refreshIntervalMinutes: optional positive int in [1, 43200] (= 30 days).
        # Missing / unparseable / out-of-range values fall back to the resolver's
        # default 60-minute TTL.
        try:
            ri = ss.get("refreshIntervalMinutes")
            if ri is not None:
                ri_num = int(float(ri))
                if 1 <= ri_num <= 43200:
                    entry["refreshIntervalMinutes"] = ri_num
        except Exception:
            pass
        # smartParams: dict of string -> finite number. Only persist keys whose
        # value is a real number (filters out NaN / strings / nested objects).
        raw_params = ss.get("smartParams")
        if isinstance(raw_params, dict):
            cleaned: dict = {}
            for k, v in raw_params.items():
                if not isinstance(k, str) or not k:
                    continue
                try:
                    n = float(v)
                    if n != n or n in (float("inf"), float("-inf")):
                        continue
                    cleaned[k] = n
                except Exception:
                    continue
            if cleaned:
                entry["smartParams"] = cleaned
        sanitized_smart.append(entry)

    try:
        surprise_count = int(settings.get("smartSurpriseMeCount") or 0)
        surprise_count = max(0, min(5, surprise_count))
    except Exception:
        surprise_count = 0
    # Sanitize savedFilters: list of { id, name, group }
    raw_saved = settings.get("savedFilters", [])
    if not isinstance(raw_saved, list):
        raw_saved = []
    sanitized_saved = []
    for sf in raw_saved:
        if not isinstance(sf, dict):
            continue
        sf_id = str(sf.get("id") or "")[:64]
        sf_name = sf.get("name") if isinstance(sf.get("name"), str) else ""
        sf_name = sf_name.strip()[:64] if sf_name else ""
        sf_group = sf.get("group") if isinstance(sf.get("group"), dict) else None
        if not sf_id or not sf_name or sf_group is None:
            continue
        sanitized_saved.append({"id": sf_id, "name": sf_name, "group": sf_group})
    return {"enabled": bool(settings.get("enabled", False)), "hideRecents": bool(settings.get("hideRecents", False)), "recentsReplaceSource": bool(settings.get("recentsReplaceSource", False)), "recentsReplaceShelfId": str(settings["recentsReplaceShelfId"])[:64] if isinstance(settings.get("recentsReplaceShelfId"), str) else None, "hideHomeTabs": bool(settings.get("hideHomeTabs", False)), "shelfHeroBackground": bool(settings.get("shelfHeroBackground", False)), "globalMatchNativeSize": bool(settings.get("globalMatchNativeSize", False)), "globalHighlightFirst": bool(settings.get("globalHighlightFirst", False)), "globalHighlightAll": bool(settings.get("globalHighlightAll", False)), "globalHideStatusLine": bool(settings.get("globalHideStatusLine", False)), "globalHideNewBadge": bool(settings.get("globalHideNewBadge", False)), "globalHideCompatIcons": bool(settings.get("globalHideCompatIcons", False)), "globalHideNonSteamBadge": bool(settings.get("globalHideNonSteamBadge", False)), "globalHideShelfTitle": bool(settings.get("globalHideShelfTitle", False)), "shelves": sanitized, "smartShelvesEnabled": bool(settings.get("smartShelvesEnabled", False)), "smartShelvesAtBottom": bool(settings.get("smartShelvesAtBottom", False)), "smartShelves": sanitized_smart, "smartSurpriseMe": bool(settings.get("smartSurpriseMe", False)), "smartSurpriseMeCount": surprise_count, "savedFilters": sanitized_saved}


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
        tmp_path = path + ".tmp"
        bak_path = path + ".bak"
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            # Atomic write: write to .tmp first, then rename over the real file.
            # This guarantees settings.json is never left in a half-written state.
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(wrapped, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            # Keep a backup of the previous good write before replacing it.
            if os.path.exists(path):
                try:
                    os.replace(path, bak_path)
                except Exception:
                    pass
            os.replace(tmp_path, path)
        except Exception as e:
            try:
                decky.logger.error(f"Failed writing settings to {path}: {e}")
            except Exception:
                pass
            # Clean up orphaned .tmp on failure
            try:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
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

    async def write_json_file(self, path: str = "", content: str = "", *args, **kwargs) -> bool:
        path = _normalize_path(path if path else (args[0] if args else kwargs.get("path")))
        if not path or not isinstance(content, str):
            return False
        try:
            d = os.path.dirname(path)
            if d:
                os.makedirs(d, exist_ok=True)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, path)
            return True
        except Exception as e:
            try:
                decky.logger.error(f"Failed writing json to {path}: {e}")
            except Exception:
                pass
            return False

    async def read_json_file(self, path: str = "", *args, **kwargs) -> Dict[str, Any]:
        path = _normalize_path(path if path else (args[0] if args else kwargs.get("path")))
        if not path or not os.path.exists(path):
            return {"ok": False}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return {"ok": True, "content": f.read()}
        except Exception as e:
            try:
                decky.logger.error(f"Failed reading json from {path}: {e}")
            except Exception:
                pass
            return {"ok": False}

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
