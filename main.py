import hashlib
import json
import os
import re
import sqlite3
import ssl
import sys
from subprocess import run as _sp_run
import urllib.request
import urllib.error
from typing import Any, Dict, List, Optional


def _steam_install_candidates() -> List[str]:
    """Candidate Steam install roots ordered by platform priority.

    Each platform contributes the paths that exist in the wild — the
    callers append the file-specific suffix (`config/htmlcache/Default/Cookies`,
    `userdata`, etc.) and pick the first one that resolves. Adding
    support for a new OS is a one-liner here; nothing else in this file
    needs platform-conditional logic for path discovery.

    Linux roots cover native Steam (`~/.local/share/Steam`,
    `~/.steam/steam`) and the Flatpak sandbox layout (default on
    Bazzite / ChimeraOS); both Flatpak variants are listed because the
    flatpak version determines which path is populated.

    Windows roots cover the standard installer paths under Program
    Files and an `APPDATA`-based fallback for portable installs. The
    cookie file lives under `config/htmlcache/Default/Cookies` on
    Windows too, so the same suffix appended by callers applies.

    macOS root is the standard Application Support directory; the
    htmlcache subtree is laid out identically to Linux.
    """
    candidates: List[str] = []
    if sys.platform.startswith("linux"):
        candidates += [
            os.path.expanduser("~/.local/share/Steam"),
            os.path.expanduser("~/.steam/steam"),
            os.path.expanduser("~/.var/app/com.valvesoftware.Steam/.local/share/Steam"),
            os.path.expanduser("~/.var/app/com.valvesoftware.Steam/data/Steam"),
        ]
    elif sys.platform == "win32":
        for env in ("ProgramFiles(x86)", "ProgramFiles", "ProgramW6432"):
            base = os.environ.get(env)
            if base:
                candidates.append(os.path.join(base, "Steam"))
        appdata = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        if appdata:
            candidates.append(os.path.join(appdata, "Steam"))
    elif sys.platform == "darwin":
        candidates.append(os.path.expanduser("~/Library/Application Support/Steam"))
    # Always include the home-relative POSIX fallback as a final attempt
    # so unconventional layouts still resolve when present.
    fallback = os.path.expanduser("~/.local/share/Steam")
    if fallback not in candidates:
        candidates.append(fallback)
    return candidates

# SteamOS ships with an incomplete CA bundle; urllib fails SSL verification
# for steam.* and steamcommunity.* URLs. Since we only call trusted
# first-party Steam endpoints, disabling cert verification is acceptable here.
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

import decky

DEFAULT_SETTINGS: Dict[str, Any] = {"enabled": False, "hideRecents": False, "recentsReplaceSource": False, "hideHomeTabs": False, "shelfHeroBackground": False, "globalMatchNativeSize": False, "globalHighlightFirst": False, "globalHighlightAll": False, "globalHideStatusLine": False, "globalHideNewBadge": False, "globalHideDiscountBadge": False, "globalHideCompatIcons": False, "globalHideNonSteamBadge": False, "globalHideShelfTitle": False, "globalHideGameNames": False, "globalHideInstallIndicator": False, "globalHideSeeMore": False, "globalHideRefreshCard": False, "shelves": [], "smartShelvesEnabled": False, "smartShelvesAtBottom": False, "smartShelves": [], "smartSurpriseMe": False, "smartSurpriseMeCount": 0}


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
    if not path:
        return ""
    try:
        resolved = os.path.realpath(os.path.expanduser(path))
    except Exception:
        return ""
    # Confine to the user's home directory. Realpath collapses `..` so a
    # traversal like `~/../../../etc/passwd` resolves to `/etc/passwd` and
    # gets rejected here. Absolute system paths fall into the same branch.
    home = os.path.realpath(os.path.expanduser("~"))
    if resolved != home and not resolved.startswith(home + os.sep):
        return ""
    return resolved



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
        hide_discount_badge = bool(s.get("hideDiscountBadge", False))
        hide_compat_icons = bool(s.get("hideCompatIcons", False))
        hide_non_steam_badge = bool(s.get("hideNonSteamBadge", False))
        hide_shelf_title = bool(s.get("hideShelfTitle", False))
        hide_game_names = bool(s.get("hideGameNames", False))
        hide_install_indicator = bool(s.get("hideInstallIndicator", False))
        hide_see_more = bool(s.get("hideSeeMore", False))
        hide_refresh_card = bool(s.get("hideRefreshCard", False))
        hero_enabled = bool(s.get("heroEnabled", False))
        valid_sorts = {"alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"}
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
        raw_hidden = s.get("hiddenAppIds")
        hidden_ids: list = []
        if isinstance(raw_hidden, list):
            for v in raw_hidden:
                try:
                    n = int(v)
                    if n > 0:
                        hidden_ids.append(n)
                except Exception:
                    continue
        dedupe_by_exact_name = bool(s.get("dedupeByExactName", False))
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
            "hideDiscountBadge": hide_discount_badge,
            "hideCompatIcons": hide_compat_icons,
            "hideNonSteamBadge": hide_non_steam_badge,
            "hideShelfTitle": hide_shelf_title,
            "hideGameNames": hide_game_names,
            "hideInstallIndicator": hide_install_indicator,
            "hideSeeMore": hide_see_more,
            "hideRefreshCard": hide_refresh_card,
        }
        if hero_enabled:
            shelf_entry["heroEnabled"] = True
        if shelf_sort and shelf_sort in valid_sorts:
            shelf_entry["sort"] = shelf_sort
        if highlighted_ids:
            shelf_entry["highlightedAppIds"] = highlighted_ids
        if hidden_ids:
            shelf_entry["hiddenAppIds"] = hidden_ids
        if dedupe_by_exact_name:
            shelf_entry["dedupeByExactName"] = True
        if manual_ids:
            shelf_entry["manualOrder"] = manual_ids
        manual_base_sort = str(s.get("manualBaseSort") or "")
        if manual_base_sort and manual_base_sort in valid_sorts and manual_base_sort != "manual":
            shelf_entry["manualBaseSort"] = manual_base_sort
        # Asc/desc invert flags. Persisted only when explicitly true to keep
        # storage minimal; resolver treats absence as false.
        if bool(s.get("sortReverse", False)):
            shelf_entry["sortReverse"] = True
        if bool(s.get("manualBaseSortReverse", False)):
            shelf_entry["manualBaseSortReverse"] = True
        sanitized.append(shelf_entry)
    # Sanitize smart shelves
    raw_smart = settings.get("smartShelves", [])
    if not isinstance(raw_smart, list):
        raw_smart = []
    sanitized_smart = []
    valid_modes = {"quick_play", "not_started", "deck_picks", "rediscover", "best_unplayed", "interrupted", "time_of_day", "daily_pick", "on_deck", "recently_played", "long_session", "non_steam", "random_pick", "forgotten", "spare_time", "custom"}
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
        # Asc/desc invert flags. Same minimal-storage convention as regular shelves.
        if bool(ss.get("sortReverse", False)):
            entry["sortReverse"] = True
        if bool(ss.get("manualBaseSortReverse", False)):
            entry["manualBaseSortReverse"] = True
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
        for bool_key in ("matchNativeSize", "highlightFirst", "highlightAll", "hideStatusLine", "hideNewBadge", "hideDiscountBadge", "hideCompatIcons", "hideNonSteamBadge", "hideShelfTitle", "hideGameNames", "hideInstallIndicator", "hideSeeMore", "hideRefreshCard", "heroEnabled"):
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
        # `hiddenAppIds`: per-shelf exclusion list. Mirrors the regular shelf
        # field — only positive integers persist.
        raw_ss_hidden = ss.get("hiddenAppIds")
        if isinstance(raw_ss_hidden, list):
            ss_hidden_ids: list = []
            for v in raw_ss_hidden:
                try:
                    n = int(v)
                    if n > 0:
                        ss_hidden_ids.append(n)
                except Exception:
                    continue
            if ss_hidden_ids:
                entry["hiddenAppIds"] = ss_hidden_ids
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
        # visibleHours: optional list of { start, end } ranges (each int in [0, 23]).
        # OR-combined at runtime — shelf is visible if current hour falls in ANY
        # range. Wrap-around (start > end) supported per range. Backwards-compat:
        # a single { start, end } object is migrated into a one-element list.
        raw_window = ss.get("visibleHours")
        ranges_in: list = []
        if isinstance(raw_window, dict):
            ranges_in = [raw_window]
        elif isinstance(raw_window, list):
            ranges_in = raw_window
        if ranges_in:
            cleaned_ranges: list = []
            for r in ranges_in:
                if not isinstance(r, dict):
                    continue
                try:
                    ws = int(r.get("start"))
                    we = int(r.get("end"))
                    if 0 <= ws <= 23 and 0 <= we <= 23:
                        cleaned_ranges.append({"start": ws, "end": we})
                except Exception:
                    continue
            if cleaned_ranges:
                entry["visibleHours"] = cleaned_ranges
        # visibleDaysOfWeek: optional list of distinct ints in [0, 6]. The
        # field is preserved verbatim when present (even empty list) — `[]`
        # explicitly means "never visible". When the field is absent (None),
        # the resolver applies no day restriction. Sanitizer dedupes / clamps
        # / sorts; bad entries are silently skipped.
        raw_days = ss.get("visibleDaysOfWeek")
        if isinstance(raw_days, list):
            cleaned_days: list = []
            seen: set = set()
            for v in raw_days:
                try:
                    n = int(v)
                    if 0 <= n <= 6 and n not in seen:
                        seen.add(n)
                        cleaned_days.append(n)
                except Exception:
                    continue
            entry["visibleDaysOfWeek"] = sorted(cleaned_days)
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
    update_dismissed = settings.get("updateNotifyDismissedVersion")
    update_dismissed = str(update_dismissed)[:64] if isinstance(update_dismissed, str) else None
    return {"enabled": bool(settings.get("enabled", False)), "hideRecents": bool(settings.get("hideRecents", False)), "recentsReplaceSource": bool(settings.get("recentsReplaceSource", False)), "recentsReplaceShelfId": str(settings["recentsReplaceShelfId"])[:64] if isinstance(settings.get("recentsReplaceShelfId"), str) else None, "hideHomeTabs": bool(settings.get("hideHomeTabs", False)), "shelfHeroBackground": bool(settings.get("shelfHeroBackground", False)), "forceCssLoaderThemes": bool(settings.get("forceCssLoaderThemes", False)), "globalMatchNativeSize": bool(settings.get("globalMatchNativeSize", False)), "globalHighlightFirst": bool(settings.get("globalHighlightFirst", False)), "globalHighlightAll": bool(settings.get("globalHighlightAll", False)), "globalHideStatusLine": bool(settings.get("globalHideStatusLine", False)), "globalHideNewBadge": bool(settings.get("globalHideNewBadge", False)), "globalHideDiscountBadge": bool(settings.get("globalHideDiscountBadge", False)), "globalHideCompatIcons": bool(settings.get("globalHideCompatIcons", False)), "globalHideNonSteamBadge": bool(settings.get("globalHideNonSteamBadge", False)), "globalHideShelfTitle": bool(settings.get("globalHideShelfTitle", False)), "globalHideGameNames": bool(settings.get("globalHideGameNames", False)), "globalHideInstallIndicator": bool(settings.get("globalHideInstallIndicator", False)), "globalHideSeeMore": bool(settings.get("globalHideSeeMore", False)), "globalHideRefreshCard": bool(settings.get("globalHideRefreshCard", False)), "globalDedupeByName": bool(settings.get("globalDedupeByName", False)), "globalHeroEnabled": bool(settings.get("globalHeroEnabled", False)), "shelves": sanitized, "smartShelvesEnabled": bool(settings.get("smartShelvesEnabled", False)), "smartShelvesAtBottom": bool(settings.get("smartShelvesAtBottom", False)), "smartShelves": sanitized_smart, "smartSurpriseMe": bool(settings.get("smartSurpriseMe", False)), "smartSurpriseMeCount": surprise_count, "savedFilters": sanitized_saved, "updateNotifyEnabled": bool(settings.get("updateNotifyEnabled", True)), "updateNotifyDismissedVersion": update_dismissed, "onlineFeaturesEnabled": None if settings.get("onlineFeaturesEnabled") is None else bool(settings.get("onlineFeaturesEnabled", False)), "onlineWishlistEnabled": None if settings.get("onlineWishlistEnabled") is None else bool(settings.get("onlineWishlistEnabled", True)), "onlinePriceSortEnabled": None if settings.get("onlinePriceSortEnabled") is None else bool(settings.get("onlinePriceSortEnabled", True)), "onlinePrivacyAccepted": None if settings.get("onlinePrivacyAccepted") is None else bool(settings.get("onlinePrivacyAccepted", False)), "onlineHideOwnedGames": None if settings.get("onlineHideOwnedGames") is None else bool(settings.get("onlineHideOwnedGames", False)), "onlineHideOwnedNonSteam": None if settings.get("onlineHideOwnedNonSteam") is None else bool(settings.get("onlineHideOwnedNonSteam", False)), "onlineHideOwnedNonSteamCloud": None if settings.get("onlineHideOwnedNonSteamCloud") is None else bool(settings.get("onlineHideOwnedNonSteamCloud", False))}


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

    async def set_settings(self, settings: Optional[Dict[str, Any]] = None, *args, **kwargs) -> bool:
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
        try:
            decky.logger.info("get_tabmaster_tabs: invoked")
        except Exception:
            pass
        decky_home = os.environ.get("DECKY_HOME") or os.path.expanduser("~/homebrew")
        settings_path = os.path.join(decky_home, "settings", "TabMaster", "settings.json")
        try:
            if not os.path.exists(settings_path):
                try:
                    decky.logger.info(f"get_tabmaster_tabs: file not found at {settings_path}")
                except Exception:
                    pass
                return {"tabs": [], "error": "file_not_found"}
            data = _safe_read_json(settings_path)
            users_dict = data.get("usersDict", {})
            if not users_dict:
                try:
                    decky.logger.info("get_tabmaster_tabs: usersDict empty")
                except Exception:
                    pass
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
            try:
                visible = sum(1 for t in tabs if t["position"] >= 0)
                decky.logger.info(f"get_tabmaster_tabs: returning {len(tabs)} tabs ({visible} visible)")
            except Exception:
                pass
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

    def _get_steam_cookie(self, name: str) -> str:
        """Read and decrypt a named cookie from Steam's Chromium cookie store.

        Chromium on Linux stores cookies with AES-128-CBC (v10 prefix),
        key derived via PBKDF2-SHA1 from b"peanuts" + salt b"saltysalt", 1 iteration.
        """
        # Path discovery is centralised in `_steam_install_candidates()` so
        # adding a new platform (Windows / macOS / new Flatpak variant) is a
        # one-line change in that helper.
        cookie_paths = [
            os.path.join(root, "config", "htmlcache", "Default", "Cookies")
            for root in _steam_install_candidates()
        ]
        for path in cookie_paths:
            if not os.path.exists(path):
                continue
            try:
                con = sqlite3.connect(f"file:{path}?immutable=1", uri=True, timeout=3)
                cur = con.execute(
                    "SELECT encrypted_value FROM cookies WHERE name=? AND (host_key LIKE '%steamcommunity%' OR host_key LIKE '%steampowered%') LIMIT 1",
                    (name,),
                )
                row = cur.fetchone()
                con.close()
                if not row or not row[0]:
                    continue
                ev = bytes(row[0])
                if ev[:3] != b"v10":
                    return ev.decode("utf-8", errors="replace")
                key = hashlib.pbkdf2_hmac("sha1", b"peanuts", b"saltysalt", 1, 16)
                iv = b" " * 16
                result = _sp_run(
                    ["openssl", "enc", "-aes-128-cbc", "-d",
                     "-K", key.hex(), "-iv", iv.hex(), "-nopad"],
                    input=ev[3:], capture_output=True, timeout=5,
                )
                if result.returncode == 0:
                    dec = result.stdout
                    pad = dec[-1] if dec else 0
                    if 0 < pad <= 16:
                        dec = dec[:-pad]
                    return dec.decode("utf-8", errors="replace")
            except Exception:
                pass
        return ""

    def _get_steam_id64(self) -> Optional[str]:
        """Derive the user's SteamID64 from the Steam userdata directory.

        Steam creates a per-user directory under userdata/ named by SteamID3
        (the lower 32 bits of SteamID64). SteamID64 = SteamID3 + 76561197960265728.
        No cookie or authentication needed — just a directory listing.
        """
        # Same install-root list as `_get_steam_cookie` — first match wins.
        userdata_candidates = [
            os.path.join(root, "userdata") for root in _steam_install_candidates()
        ]
        try:
            userdata = next((p for p in userdata_candidates if os.path.isdir(p)), None)
            if not userdata:
                return None
            candidates = [
                d for d in os.listdir(userdata)
                if d.isdigit() and d != "0" and os.path.isdir(os.path.join(userdata, d))
            ]
            if not candidates:
                return None
            steam_id3 = int(candidates[0])
            return str(76561197960265728 + steam_id3)
        except Exception:
            return None

    async def get_wishlist(self, community_url: str = "", *args, **kwargs) -> Dict[str, Any]:
        """Fetch the current user's Steam wishlist appids.

        Uses IWishlistService/GetWishlist/v1/ with the SteamID64 derived from the
        local userdata/ directory — no cookie or login required for public profiles.
        Falls back to the JWT from the Chromium cookie store if the public call fails.
        """
        try:
            steam_id64 = self._get_steam_id64()
            if not steam_id64:
                return {"ok": False, "error": "could not determine SteamID64 from userdata"}

            base_url = f"https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid={steam_id64}"

            for attempt, url in enumerate([base_url, None]):
                if attempt == 1:
                    # Second attempt: try with JWT from cookie (for private wishlists)
                    raw_cookie = self._get_steam_cookie("steamLoginSecure")
                    if not raw_cookie:
                        break
                    parts = raw_cookie.split("||", 1)
                    jwt = parts[1].strip() if len(parts) > 1 else ""
                    if not jwt:
                        break
                    url = f"{base_url}&access_token={jwt}"

                req = urllib.request.Request(
                    url,
                    headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"},
                )
                with urllib.request.urlopen(req, timeout=15, context=_SSL_CTX) as resp:
                    if resp.status != 200:
                        continue
                    body = resp.read().decode("utf-8")
                    data = json.loads(body)
                    items = data.get("response", {}).get("items", [])
                    if not items and attempt == 0:
                        continue  # might be private, try with auth
                    ids: List[int] = [int(it["appid"]) for it in items if it.get("appid")]
                    return {"ok": True, "ids": ids, "count": len(ids), "authed": attempt > 0}

            return {"ok": False, "error": "wishlist empty or private (no auth)"}
        except urllib.error.HTTPError as e:
            return {"ok": False, "error": f"HTTP {e.code}"}
        except Exception as e:
            try:
                decky.logger.error(f"get_wishlist failed: {e}")
            except Exception:
                pass
            return {"ok": False, "error": str(e)}

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
