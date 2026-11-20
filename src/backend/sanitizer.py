"""Settings-shape normalisation. The Plugin class round-trips every
persisted-or-loaded payload through `_sanitize_settings`: known fields are
validated to defaults, and UNKNOWN fields are preserved (bounded) so a
malformed write from any client never corrupts the boot path AND an older
plugin version never DROPS a field a newer version added (dual-host / mixed
version installs share one settings document — see `_preserve_unknown`).

Authoritative validators are in `src/types.ts` (Zod schemas); this
mirror exists because the Python side writes directly to disk in the
Decky lifecycle path and Zod can't run server-side.
"""
from typing import Any, Dict, List

from sanitizer_preserve import (
    _MAX_UNKNOWN_BYTES as _MAX_UNKNOWN_BYTES,
    _MAX_UNKNOWN_KEYS as _MAX_UNKNOWN_KEYS,
    _preserve_unknown,
    _with_clock,
)
from sanitizer_records import (
    _ACCOUNT_FIELDS as _ACCOUNT_FIELDS,
    _ACCOUNT_KEY as _ACCOUNT_KEY,
    _HUB_CONFIG_MAX_KEYS as _HUB_CONFIG_MAX_KEYS,
    _MAX_ACCOUNT_BUCKETS as _MAX_ACCOUNT_BUCKETS,
    _sanitize_account_settings,
    _sanitize_hub_config,
    _sanitize_setup_apply,
    merge_hub_config as merge_hub_config,
)
from sanitizer_visibility import _sanitize_visibility


def _is_stored_id(value: Any) -> bool:
    # A mode or a sort key as the frontend schema stores it: text of 1 to 64 characters.
    return isinstance(value, str) and 0 < len(value) <= 64


_DISCOUNT_BADGE_MODES = ("percent", "price", "both", "percent_price")

# Shelf fields the loop below reads, so an empty recognized field isn't mistaken for an unknown newer one.
_RECOGNIZED_SHELF_FIELDS = {
    "autoCollapse", "autoCollapseWhenEmpty", "autoPin", "dedupeByExactName",
    "descriptionBelowLogo", "descriptionHeight", "descriptionLogoGap",
    "descriptionPosition", "descriptionScale", "discountBadgeFocusMode", "discountBadgeMode", "enableDescription", "enableIcon",
    "enableLogo", "enabled", "friendsPlayingOverlay", "friendsPlayingOverlayRecent",
    "fullPageShelf", "gameInfoAbove", "gameNamePosition", "heroEnabled", "hidden",
    "hiddenAppIds", "hideCompatIcons", "hideDiscountBadge", "hideGameNames",
    "hideInstallIndicator", "hideNewBadge", "hideNonSteamBadge", "hideRefreshCard",
    "hideSeeMore", "hideShelfTitle", "hideStatusLine", "highlightAll",
    "highlightFirst", "highlightRandom", "highlightedAppIds", "iconVerticalAlign",
    "id", "limit", "logoBelowShelf", "logoPosition", "logoSize", "logoTopOffset",
    "manualBaseSort", "manualBaseSortReverse", "manualOrder", "matchNativeSize",
    "playtimePosition", "shelfTitlePosition", "sort", "sortReverse", "source",
    "syntheticCards", "title", "visibility",
}

_RECOGNIZED_SMART_SHELF_FIELDS = {
    "autoCollapse", "autoCollapseWhenEmpty", "autoPin", "compositeCombine",
    "compositeModes", "descriptionHeight", "descriptionLogoGap",
    "descriptionPosition", "descriptionScale", "enabled", "filterGroup",
    "gameNamePosition", "hidden", "hiddenAppIds", "highlightedAppIds",
    "iconVerticalAlign", "id", "limit", "logoPosition", "logoSize",
    "logoTopOffset", "manualBaseSort", "manualBaseSortReverse", "manualOrder",
    "mode", "playtimePosition", "refreshIntervalMinutes", "shelfTitlePosition",
    "smartParams", "sort", "sortReverse", "title", "visibility",
    "visibleDaysOfWeek", "visibleHours",
}


def _sanitize_settings(settings: Dict[str, Any]) -> Dict[str, Any]:  # noqa: C901
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
        # Old Recently Played templates used a tab source that no longer exists; rewrite them as a filter source.
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
        highlight_random = bool(s.get("highlightRandom", False))
        # Tri-state: True/False are explicit, None follows the global setting.
        enable_logo_raw = s.get("enableLogo")
        enable_icon_raw = s.get("enableIcon")
        enable_description_raw = s.get("enableDescription")
        description_scale_raw = s.get("descriptionScale")
        enable_logo = bool(enable_logo_raw) if enable_logo_raw is not None else None
        enable_icon = bool(enable_icon_raw) if enable_icon_raw is not None else None
        enable_description = bool(enable_description_raw) if enable_description_raw is not None else None
        description_scale = max(100, min(200, int(description_scale_raw))) if isinstance(description_scale_raw, (int, float)) else None
        description_below_logo = bool(s.get("descriptionBelowLogo", False))
        logo_below_shelf = bool(s.get("logoBelowShelf", False))
        logo_position = s.get("logoPosition") if s.get("logoPosition") in ("left", "center", "right") else None
        description_position = s.get("descriptionPosition") if s.get("descriptionPosition") in ("left", "center", "right") else None
        logo_size_raw = s.get("logoSize")
        logo_size = max(50, min(200, int(logo_size_raw))) if isinstance(logo_size_raw, (int, float)) else None
        logo_top_offset_raw = s.get("logoTopOffset")
        logo_top_offset = max(-50, min(100, int(logo_top_offset_raw))) if isinstance(logo_top_offset_raw, (int, float)) else None
        full_page_shelf = bool(s.get("fullPageShelf", False))
        icon_vertical_align = s.get("iconVerticalAlign") if s.get("iconVerticalAlign") in ("top", "center", "bottom") else None
        discount_badge_mode = s.get("discountBadgeMode") if s.get("discountBadgeMode") in _DISCOUNT_BADGE_MODES else None
        discount_badge_focus_mode = s.get("discountBadgeFocusMode") if s.get("discountBadgeFocusMode") in _DISCOUNT_BADGE_MODES else None
        shelf_title_position = s.get("shelfTitlePosition") if s.get("shelfTitlePosition") in ("left", "center", "right") else None
        game_name_position = s.get("gameNamePosition") if s.get("gameNamePosition") in ("left", "center", "right") else None
        playtime_position = s.get("playtimePosition") if s.get("playtimePosition") in ("left", "center", "right") else None
        description_height_raw = s.get("descriptionHeight")
        description_height = max(1, min(3, int(description_height_raw))) if isinstance(description_height_raw, (int, float)) else None
        description_logo_gap_raw = s.get("descriptionLogoGap")
        description_logo_gap = max(-40, min(80, int(description_logo_gap_raw))) if isinstance(description_logo_gap_raw, (int, float)) else None
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
        game_info_above = bool(s.get("gameInfoAbove", False))
        friends_playing_overlay = bool(s.get("friendsPlayingOverlay", False))
        friends_playing_overlay_recent = bool(s.get("friendsPlayingOverlayRecent", False))
        # Sort is a single key or a list of keys (primary plus tiebreakers).
        raw_sort = s.get("sort")
        shelf_sort: Any = ""
        if isinstance(raw_sort, list):
            cleaned_keys = [str(k) for k in raw_sort if isinstance(k, str) and k]
            if cleaned_keys:
                shelf_sort = cleaned_keys
        elif raw_sort:
            shelf_sort = str(raw_sort)
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
        if game_info_above:
            shelf_entry["gameInfoAbove"] = True
        if friends_playing_overlay:
            shelf_entry["friendsPlayingOverlay"] = True
        if friends_playing_overlay_recent:
            shelf_entry["friendsPlayingOverlayRecent"] = True
        if highlight_random:
            shelf_entry["highlightRandom"] = True
        if enable_logo is not None:
            shelf_entry["enableLogo"] = enable_logo
        if enable_icon is not None:
            shelf_entry["enableIcon"] = enable_icon
        if enable_description is not None:
            shelf_entry["enableDescription"] = enable_description
        if description_scale is not None:
            shelf_entry["descriptionScale"] = description_scale
        if description_below_logo:
            shelf_entry["descriptionBelowLogo"] = True
        if logo_below_shelf:
            shelf_entry["logoBelowShelf"] = True
        if logo_position:
            shelf_entry["logoPosition"] = logo_position
        if description_position:
            shelf_entry["descriptionPosition"] = description_position
        if logo_size is not None:
            shelf_entry["logoSize"] = logo_size
        if logo_top_offset is not None:
            shelf_entry["logoTopOffset"] = logo_top_offset
        if full_page_shelf:
            shelf_entry["fullPageShelf"] = True
        if icon_vertical_align:
            shelf_entry["iconVerticalAlign"] = icon_vertical_align
        if discount_badge_mode:
            shelf_entry["discountBadgeMode"] = discount_badge_mode
        if discount_badge_focus_mode:
            shelf_entry["discountBadgeFocusMode"] = discount_badge_focus_mode
        if shelf_title_position:
            shelf_entry["shelfTitlePosition"] = shelf_title_position
        if game_name_position:
            shelf_entry["gameNamePosition"] = game_name_position
        if playtime_position:
            shelf_entry["playtimePosition"] = playtime_position
        if description_height is not None:
            shelf_entry["descriptionHeight"] = description_height
        if description_logo_gap is not None:
            shelf_entry["descriptionLogoGap"] = description_logo_gap
        if isinstance(shelf_sort, list):
            # Unknown sort strings pass through so externally registered sort options survive.
            shelf_entry["sort"] = shelf_sort
        elif _is_stored_id(raw_sort):
            shelf_entry["sort"] = shelf_sort
        if highlighted_ids:
            shelf_entry["highlightedAppIds"] = highlighted_ids
        if hidden_ids:
            shelf_entry["hiddenAppIds"] = hidden_ids
        if dedupe_by_exact_name:
            shelf_entry["dedupeByExactName"] = True
        if manual_ids:
            shelf_entry["manualOrder"] = manual_ids
        # "manual" is rejected as a base sort since it would be circular.
        raw_base = s.get("manualBaseSort")
        if isinstance(raw_base, list):
            cleaned_base = [str(k) for k in raw_base if isinstance(k, str) and k and k != "manual"]
            if cleaned_base:
                shelf_entry["manualBaseSort"] = cleaned_base
        elif isinstance(raw_base, str) and raw_base and raw_base != "manual":
            shelf_entry["manualBaseSort"] = raw_base
        raw_reverse = s.get("sortReverse")
        if isinstance(raw_reverse, list):
            cleaned_rev = [bool(b) for b in raw_reverse]
            if any(cleaned_rev):
                shelf_entry["sortReverse"] = cleaned_rev
        elif bool(raw_reverse):
            shelf_entry["sortReverse"] = True
        raw_base_rev = s.get("manualBaseSortReverse")
        if isinstance(raw_base_rev, list):
            cleaned_base_rev = [bool(b) for b in raw_base_rev]
            if any(cleaned_base_rev):
                shelf_entry["manualBaseSortReverse"] = cleaned_base_rev
        elif bool(raw_base_rev):
            shelf_entry["manualBaseSortReverse"] = True
        # Types, positions and sizes are clamped so a malformed write can't crash boot.
        raw_synth = s.get("syntheticCards")
        if isinstance(raw_synth, list) and raw_synth:
            cleaned_synth = []
            for c in raw_synth:
                if not isinstance(c, dict):
                    continue
                try:
                    pos = int(c.get("position") or 0)
                except Exception:
                    continue
                pos = max(0, min(pos, 999))
                entry_c: Dict[str, Any] = {"position": pos}
                if isinstance(c.get("image"), str) and c["image"]:
                    entry_c["image"] = c["image"][:1024]
                if isinstance(c.get("text"), str) and c["text"]:
                    entry_c["text"] = c["text"][:64]
                lk = c.get("link")
                if isinstance(lk, dict) and lk.get("type") in ("app", "url") and isinstance(lk.get("value"), str) and lk["value"]:
                    entry_c["link"] = {"type": lk["type"], "value": lk["value"][:512]}
                sz = c.get("size")
                entry_c["size"] = sz if sz in ("normal", "featured") else "normal"
                if isinstance(c.get("alpha"), (int, float)):
                    a = float(c["alpha"])
                    if 0.0 <= a <= 1.0:
                        entry_c["alpha"] = a
                if c.get("placeholder") is True:
                    entry_c["placeholder"] = True
                if isinstance(c.get("heroImage"), str) and c["heroImage"]:
                    entry_c["heroImage"] = c["heroImage"][:1024]
                sm = c.get("shadowMode")
                if sm in ("onFocus", "always"):
                    entry_c["shadowMode"] = sm
                cleaned_synth.append(entry_c)
            if cleaned_synth:
                shelf_entry["syntheticCards"] = cleaned_synth
        _vis_s = _sanitize_visibility(s.get("visibility"))
        if _vis_s:
            shelf_entry["visibility"] = _vis_s
        _pin_s = _sanitize_visibility(s.get("autoPin"))
        if _pin_s:
            shelf_entry["autoPin"] = _pin_s
        _col_s = _sanitize_visibility(s.get("autoCollapse"))
        if _col_s:
            shelf_entry["autoCollapse"] = _col_s
        if s.get("autoCollapseWhenEmpty") is True:
            shelf_entry["autoCollapseWhenEmpty"] = True
        # Unknown newer-build fields round-trip instead of vanishing on the next save.
        sanitized.append(_preserve_unknown(s if isinstance(s, dict) else {}, shelf_entry, _RECOGNIZED_SHELF_FIELDS))
    raw_smart = settings.get("smartShelves", [])
    if not isinstance(raw_smart, list):
        raw_smart = []
    sanitized_smart = []
    for ss in raw_smart:
        if not isinstance(ss, dict):
            continue
        ss_id = str(ss.get("id") or "")[:64]
        ss_title = ss.get("title") if isinstance(ss.get("title"), str) else ""
        ss_title = ss_title.strip()[:64] if ss_title else ""
        ss_mode = str(ss.get("mode") or "")
        if not ss_id or not ss_title or not _is_stored_id(ss.get("mode")):
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
        raw_ss_sort = ss.get("sort")
        if isinstance(raw_ss_sort, list):
            cleaned_keys = [str(k) for k in raw_ss_sort if isinstance(k, str) and k]
            if cleaned_keys:
                entry["sort"] = cleaned_keys
        elif _is_stored_id(raw_ss_sort):
            entry["sort"] = raw_ss_sort
        ss_base = ss.get("manualBaseSort")
        if _is_stored_id(ss_base) and ss_base != "manual":
            entry["manualBaseSort"] = ss_base
        raw_ss_rev = ss.get("sortReverse")
        if isinstance(raw_ss_rev, list):
            cleaned_rev = [bool(b) for b in raw_ss_rev]
            if any(cleaned_rev):
                entry["sortReverse"] = cleaned_rev
        elif bool(raw_ss_rev):
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
        for bool_key in ("matchNativeSize", "highlightFirst", "highlightAll", "highlightRandom", "enableLogo", "enableIcon", "enableDescription", "descriptionBelowLogo", "logoBelowShelf", "fullPageShelf", "hideStatusLine", "hideNewBadge", "hideDiscountBadge", "hideCompatIcons", "hideNonSteamBadge", "hideShelfTitle", "hideGameNames", "hideInstallIndicator", "hideSeeMore", "hideRefreshCard", "heroEnabled", "gameInfoAbove", "friendsPlayingOverlay", "friendsPlayingOverlayRecent"):
            if bool_key in ss:
                entry[bool_key] = bool(ss.get(bool_key, False))
        if ss.get("logoPosition") in ("left", "center", "right"):
            entry["logoPosition"] = ss["logoPosition"]
        if ss.get("descriptionPosition") in ("left", "center", "right"):
            entry["descriptionPosition"] = ss["descriptionPosition"]
        ls = ss.get("logoSize")
        if isinstance(ls, (int, float)):
            entry["logoSize"] = max(50, min(200, int(ls)))
        lto = ss.get("logoTopOffset")
        if isinstance(lto, (int, float)):
            entry["logoTopOffset"] = max(-50, min(100, int(lto)))
        if ss.get("iconVerticalAlign") in ("top", "center", "bottom"):
            entry["iconVerticalAlign"] = ss["iconVerticalAlign"]
        if ss.get("shelfTitlePosition") in ("left", "center", "right"):
            entry["shelfTitlePosition"] = ss["shelfTitlePosition"]
        if ss.get("gameNamePosition") in ("left", "center", "right"):
            entry["gameNamePosition"] = ss["gameNamePosition"]
        if ss.get("playtimePosition") in ("left", "center", "right"):
            entry["playtimePosition"] = ss["playtimePosition"]
        dh = ss.get("descriptionHeight")
        if isinstance(dh, (int, float)):
            entry["descriptionHeight"] = max(1, min(3, int(dh)))
        dsc = ss.get("descriptionScale")
        if isinstance(dsc, (int, float)):
            entry["descriptionScale"] = max(100, min(200, int(dsc)))
        dlg = ss.get("descriptionLogoGap")
        if isinstance(dlg, (int, float)):
            entry["descriptionLogoGap"] = max(-40, min(80, int(dlg)))
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
        try:
            ri = ss.get("refreshIntervalMinutes")
            if ri is not None:
                ri_num = int(float(ri))
                if 1 <= ri_num <= 43200:
                    entry["refreshIntervalMinutes"] = ri_num
        except Exception:
            pass
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
        # A legacy single { start, end } object becomes a one-element list.
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
                        cleaned_range: Dict[str, Any] = {"start": ws, "end": we}
                        if isinstance(r.get("days"), list):
                            days = [int(d) for d in r["days"] if isinstance(d, (int, float)) and 0 <= int(d) <= 6]
                            if days:
                                cleaned_range["days"] = days
                        cleaned_ranges.append(cleaned_range)
                except Exception:
                    continue
            if cleaned_ranges:
                entry["visibleHours"] = cleaned_ranges
        # An empty list means never visible; a missing field means no day restriction.
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
        _vis_ss = _sanitize_visibility(ss.get("visibility"))
        if _vis_ss:
            entry["visibility"] = _vis_ss
        _pin_ss = _sanitize_visibility(ss.get("autoPin"))
        if _pin_ss:
            entry["autoPin"] = _pin_ss
        _col_ss = _sanitize_visibility(ss.get("autoCollapse"))
        if _col_ss:
            entry["autoCollapse"] = _col_ss
        if ss.get("autoCollapseWhenEmpty") is True:
            entry["autoCollapseWhenEmpty"] = True
        raw_cmodes = ss.get("compositeModes")
        if isinstance(raw_cmodes, list):
            cleaned_cmodes = [str(m)[:64] for m in raw_cmodes if isinstance(m, str) and m][:5]
            if cleaned_cmodes:
                entry["compositeModes"] = cleaned_cmodes
        raw_ccombine = ss.get("compositeCombine")
        if raw_ccombine in ("union", "intersection"):
            entry["compositeCombine"] = raw_ccombine
        sanitized_smart.append(_preserve_unknown(ss if isinstance(ss, dict) else {}, entry, _RECOGNIZED_SMART_SHELF_FIELDS))

    try:
        surprise_count = int(settings.get("smartSurpriseMeCount") or 0)
        surprise_count = max(0, min(5, surprise_count))
    except Exception:
        surprise_count = 0
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
        sanitized_saved.append(_with_clock({"id": sf_id, "name": sf_name, "group": sf_group}, sf))
    raw_saved_smart = settings.get("savedSmartFilters", [])
    if not isinstance(raw_saved_smart, list):
        raw_saved_smart = []
    sanitized_saved_smart = []
    for sf in raw_saved_smart:
        if not isinstance(sf, dict):
            continue
        sf_id = str(sf.get("id") or "")[:64]
        sf_name = sf.get("name") if isinstance(sf.get("name"), str) else ""
        sf_name = sf_name.strip()[:64] if sf_name else ""
        sf_mode = str(sf.get("mode") or "")[:64]
        if not sf_id or not sf_name or not sf_mode:
            continue
        entry_ss: Dict[str, Any] = {"id": sf_id, "name": sf_name, "mode": sf_mode}
        sp = sf.get("smartParams")
        if isinstance(sp, dict):
            cleaned_sp = {str(k): float(v) for k, v in sp.items() if isinstance(v, (int, float))}
            if cleaned_sp:
                entry_ss["smartParams"] = cleaned_sp
        if isinstance(sf.get("filterGroup"), dict):
            entry_ss["filterGroup"] = sf["filterGroup"]
        sf_sort = sf.get("sort")
        if isinstance(sf_sort, list):
            cleaned_sort = [str(s) for s in sf_sort if isinstance(s, str) and s]
            if cleaned_sort:
                entry_ss["sort"] = cleaned_sort
        elif isinstance(sf_sort, str) and sf_sort:
            entry_ss["sort"] = sf_sort
        sf_rev = sf.get("sortReverse")
        if isinstance(sf_rev, list):
            entry_ss["sortReverse"] = [bool(b) for b in sf_rev]
        elif sf_rev is True:
            entry_ss["sortReverse"] = True
        try:
            if sf.get("limit") is not None:
                entry_ss["limit"] = max(1, min(int(sf["limit"]), 100))
        except Exception:
            pass
        if isinstance(sf.get("visibleHours"), list):
            cleaned_hours = []
            for r in sf["visibleHours"]:
                if not isinstance(r, dict):
                    continue
                try:
                    start_h = int(r.get("start"))
                    end_h = int(r.get("end"))
                except (TypeError, ValueError):
                    continue
                if not (0 <= start_h <= 23 and 0 <= end_h <= 23):
                    continue
                entry_h: Dict[str, Any] = {"start": start_h, "end": end_h}
                if isinstance(r.get("days"), list):
                    days = [int(d) for d in r["days"] if isinstance(d, (int, float)) and 0 <= int(d) <= 6]
                    if days:
                        entry_h["days"] = days
                cleaned_hours.append(entry_h)
            if cleaned_hours:
                entry_ss["visibleHours"] = cleaned_hours
        if isinstance(sf.get("visibleDaysOfWeek"), list):
            entry_ss["visibleDaysOfWeek"] = [int(d) for d in sf["visibleDaysOfWeek"] if isinstance(d, (int, float)) and 0 <= int(d) <= 6]
        _vis_sf = _sanitize_visibility(sf.get("visibility"))
        if _vis_sf:
            entry_ss["visibility"] = _vis_sf
        sanitized_saved_smart.append(_with_clock(entry_ss, sf))
    update_dismissed = settings.get("updateNotifyDismissedVersion")
    update_dismissed = str(update_dismissed)[:64] if isinstance(update_dismissed, str) else None
    qam_hidden_toggles_raw = settings.get("qamHiddenToggles")
    qam_hidden_toggles = [str(x)[:64] for x in qam_hidden_toggles_raw if isinstance(x, str)] if isinstance(qam_hidden_toggles_raw, list) else []
    qam_hidden_sections_raw = settings.get("qamHiddenSections")
    qam_hidden_sections = [str(x)[:64] for x in qam_hidden_sections_raw if isinstance(x, str)] if isinstance(qam_hidden_sections_raw, list) else []
    unified_list_enabled = bool(settings.get("unifiedListEnabled", False))
    all_shelves_order_raw = settings.get("allShelvesOrder")
    all_shelves_order = [str(x)[:64] for x in all_shelves_order_raw if isinstance(x, str)] if isinstance(all_shelves_order_raw, list) else []
    light_mode_enabled = bool(settings.get("lightModeEnabled", False))
    advanced_mode_enabled = bool(settings.get("advancedModeEnabled", False))
    template_suggestions_enabled = bool(settings.get("templateSuggestionsEnabled", False))
    offline_mode_enabled = bool(settings.get("offlineModeEnabled", False))
    feature_toggles_raw = settings.get("featureToggles")
    feature_toggles = {str(k)[:64]: bool(v) for k, v in feature_toggles_raw.items() if isinstance(k, str)} if isinstance(feature_toggles_raw, dict) else {}
    active_profile_name = str(settings.get("activeProfileName"))[:64] if isinstance(settings.get("activeProfileName"), str) else None
    raw_profiles = settings.get("profiles")
    sanitized_profiles = []
    if isinstance(raw_profiles, list):
        for p in raw_profiles:
            if not isinstance(p, dict):
                continue
            pid = str(p.get("id") or "")[:64]
            pname = str(p.get("name") or "")[:64]
            pcreated = str(p.get("createdAt") or "")[:64]
            psnap = p.get("snapshot")
            if not pid or not pname or not isinstance(psnap, dict):
                continue
            ptrigger = p.get("trigger")
            entry = {"id": pid, "name": pname, "createdAt": pcreated, "snapshot": psnap}
            if p.get("hidden") is True:
                entry["hidden"] = True
            if p.get("linkShelves") is True:
                entry["linkShelves"] = True
            if isinstance(ptrigger, dict):
                entry["trigger"] = ptrigger
            sanitized_profiles.append(_with_clock(entry, p))
    factory_profile_trigger = _sanitize_visibility(settings.get("factoryProfileTrigger"))
    integrations_enabled_raw = settings.get("integrationsEnabled")
    integrations_enabled = {str(k)[:64]: bool(v) for k, v in integrations_enabled_raw.items() if isinstance(k, str)} if isinstance(integrations_enabled_raw, dict) else {}
    bb_disabled_raw = settings.get("buttonBindingsDisabled")
    button_bindings_disabled: List[str] = []
    if isinstance(bb_disabled_raw, list):
        for k in bb_disabled_raw:
            if isinstance(k, str) and k in ("cardHideRemove", "cardHighlightToggle", "cardQuickLaunch", "navSearch", "navSideNav", "navSidecarOpen", "navSidecarClose"):
                if k not in button_bindings_disabled:
                    button_bindings_disabled.append(k)
    button_bindings_raw = settings.get("buttonBindings")
    button_bindings: Dict[str, Any] = {}
    if isinstance(button_bindings_raw, dict):
        # Only keys present in the input are emitted, so "{}" round-trips unchanged.
        for key in ("cardHideRemove", "cardHighlightToggle", "cardQuickLaunch", "navSearch", "navSideNav", "navSidecarOpen", "navSidecarClose"):
            if key not in button_bindings_raw:
                continue
            v = button_bindings_raw[key]
            if v is None:
                button_bindings[key] = None
            elif isinstance(v, str):
                trimmed = v.strip().upper()[:32]
                button_bindings[key] = trimmed if trimmed else None
    kb_disabled_raw = settings.get("keyboardBindingsDisabled")
    keyboard_bindings_disabled: List[str] = []
    if isinstance(kb_disabled_raw, list):
        for k in kb_disabled_raw:
            if isinstance(k, str) and k in ("cardHideRemove", "cardHighlightToggle", "cardQuickLaunch", "navSearch", "navSideNav", "navSidecarOpen", "navSidecarClose"):
                if k not in keyboard_bindings_disabled:
                    keyboard_bindings_disabled.append(k)
    keyboard_bindings_raw = settings.get("keyboardBindings")
    keyboard_bindings: Dict[str, Any] = {}
    if isinstance(keyboard_bindings_raw, dict):
        for key in ("cardHideRemove", "cardHighlightToggle", "cardQuickLaunch", "navSearch", "navSideNav", "navSidecarOpen", "navSidecarClose"):
            if key not in keyboard_bindings_raw:
                continue
            v = keyboard_bindings_raw[key]
            if v is None:
                keyboard_bindings[key] = None
            elif isinstance(v, str):
                # Keyboard tokens are KeyboardEvent.code values and case-sensitive, unlike gamepad tokens.
                trimmed = v.strip()[:64]
                keyboard_bindings[key] = trimmed if trimmed else None
    return _preserve_unknown(settings, {"enabled": bool(settings.get("enabled", False)), "hideRecents": bool(settings.get("hideRecents", False)), "recentsReplaceSource": bool(settings.get("recentsReplaceSource", False)), "hideHomeTabs": bool(settings.get("hideHomeTabs", False)), "shelfHeroBackground": bool(settings.get("shelfHeroBackground", False)), "gameContextMenuEnabled": bool(settings.get("gameContextMenuEnabled", True)), "forceCssLoaderThemes": bool(settings.get("forceCssLoaderThemes", False)), "globalMatchNativeSize": bool(settings.get("globalMatchNativeSize", False)), "globalHighlightFirst": bool(settings.get("globalHighlightFirst", False)), "globalHighlightAll": bool(settings.get("globalHighlightAll", False)), "globalHighlightRandom": bool(settings.get("globalHighlightRandom", False)), "globalEnableLogo": bool(settings.get("globalEnableLogo", False)), "globalEnableIcon": bool(settings.get("globalEnableIcon", False)), "globalEnableDescription": bool(settings.get("globalEnableDescription", False)), "globalDescriptionScale": (max(100, min(200, int(settings["globalDescriptionScale"]))) if isinstance(settings.get("globalDescriptionScale"), (int, float)) else None), "globalDescriptionBelowLogo": bool(settings.get("globalDescriptionBelowLogo", False)), "globalLogoBelowShelf": bool(settings.get("globalLogoBelowShelf", False)), "globalLogoPosition": (settings.get("globalLogoPosition") if settings.get("globalLogoPosition") in ("left", "center", "right") else None), "globalDescriptionPosition": (settings.get("globalDescriptionPosition") if settings.get("globalDescriptionPosition") in ("left", "center", "right") else None), "globalLogoSize": (max(50, min(200, int(settings["globalLogoSize"]))) if isinstance(settings.get("globalLogoSize"), (int, float)) else None), "globalLogoTopOffset": (max(-50, min(100, int(settings["globalLogoTopOffset"]))) if isinstance(settings.get("globalLogoTopOffset"), (int, float)) else None), "globalFullPageShelf": bool(settings.get("globalFullPageShelf", False)), "globalIconVerticalAlign": (settings.get("globalIconVerticalAlign") if settings.get("globalIconVerticalAlign") in ("top", "center", "bottom") else None), "globalShelfTitlePosition": (settings.get("globalShelfTitlePosition") if settings.get("globalShelfTitlePosition") in ("left", "center", "right") else None), "globalGameNamePosition": (settings.get("globalGameNamePosition") if settings.get("globalGameNamePosition") in ("left", "center", "right") else None), "globalPlaytimePosition": (settings.get("globalPlaytimePosition") if settings.get("globalPlaytimePosition") in ("left", "center", "right") else None), "globalDescriptionHeight": (max(1, min(3, int(settings["globalDescriptionHeight"]))) if isinstance(settings.get("globalDescriptionHeight"), (int, float)) else None), "globalDescriptionLogoGap": (max(-40, min(80, int(settings["globalDescriptionLogoGap"]))) if isinstance(settings.get("globalDescriptionLogoGap"), (int, float)) else None), "contextSearchEnabled": None if settings.get("contextSearchEnabled") is None else bool(settings.get("contextSearchEnabled", False)), "contextSearchKeyboardEnabled": None if settings.get("contextSearchKeyboardEnabled") is None else bool(settings.get("contextSearchKeyboardEnabled", True)), "contextSearchOnEnter": None if settings.get("contextSearchOnEnter") is None else bool(settings.get("contextSearchOnEnter", False)), "sideNavEnabled": None if settings.get("sideNavEnabled") is None else bool(settings.get("sideNavEnabled", False)), "globalHideStatusLine": bool(settings.get("globalHideStatusLine", False)), "globalHideNewBadge": bool(settings.get("globalHideNewBadge", False)), "globalHideDiscountBadge": bool(settings.get("globalHideDiscountBadge", False)), "discountBadgeMode": settings.get("discountBadgeMode") if settings.get("discountBadgeMode") in _DISCOUNT_BADGE_MODES else None, "discountBadgeFocusMode": settings.get("discountBadgeFocusMode") if settings.get("discountBadgeFocusMode") in _DISCOUNT_BADGE_MODES else None, "globalHideCompatIcons": bool(settings.get("globalHideCompatIcons", False)), "globalHideNonSteamBadge": bool(settings.get("globalHideNonSteamBadge", False)), "globalHideShelfTitle": bool(settings.get("globalHideShelfTitle", False)), "globalHideGameNames": bool(settings.get("globalHideGameNames", False)), "globalHideInstallIndicator": bool(settings.get("globalHideInstallIndicator", False)), "globalHideSeeMore": bool(settings.get("globalHideSeeMore", False)), "globalHideRefreshCard": bool(settings.get("globalHideRefreshCard", False)), "globalDedupeByName": bool(settings.get("globalDedupeByName", False)), "globalHeroEnabled": bool(settings.get("globalHeroEnabled", False)), "globalGameInfoAbove": bool(settings.get("globalGameInfoAbove", False)), "globalFriendsPlayingOverlay": bool(settings.get("globalFriendsPlayingOverlay", False)), "globalFriendsPlayingOverlayRecent": bool(settings.get("globalFriendsPlayingOverlayRecent", False)), "shelves": sanitized, "smartShelvesEnabled": bool(settings.get("smartShelvesEnabled", False)), "smartShelvesAtBottom": bool(settings.get("smartShelvesAtBottom", False)), "smartShelves": sanitized_smart, "smartSurpriseMe": bool(settings.get("smartSurpriseMe", False)), "smartSurpriseMeCount": surprise_count, "savedFilters": sanitized_saved, "savedSmartFilters": sanitized_saved_smart, "updateNotifyEnabled": bool(settings.get("updateNotifyEnabled", True)), "betaChannelEnabled": bool(settings.get("betaChannelEnabled", False)), "verboseLoggingEnabled": bool(settings.get("verboseLoggingEnabled", False)), "devModeEnabled": bool(settings.get("devModeEnabled", False)), "debugOverlayEnabled": bool(settings.get("debugOverlayEnabled", False)), "debugOverlayCorner": (settings.get("debugOverlayCorner") if settings.get("debugOverlayCorner") in ("tl", "tr", "bl", "br") else None), "debugOverlayVertical": bool(settings.get("debugOverlayVertical", True)), "debugOverlayFps": bool(settings.get("debugOverlayFps", True)), "debugOverlayStats": bool(settings.get("debugOverlayStats", True)), "debugOverlayPerShelf": bool(settings.get("debugOverlayPerShelf", True)), "debugOverlayOutlines": bool(settings.get("debugOverlayOutlines", False)), "debugOverlayFocus": bool(settings.get("debugOverlayFocus", False)), "debugOverlayTransparent": bool(settings.get("debugOverlayTransparent", False)), "updateNotifyDismissedVersion": update_dismissed, "onlineFeaturesEnabled": None if settings.get("onlineFeaturesEnabled") is None else bool(settings.get("onlineFeaturesEnabled", False)), "onlineWishlistEnabled": None if settings.get("onlineWishlistEnabled") is None else bool(settings.get("onlineWishlistEnabled", True)), "onlinePriceSortEnabled": None if settings.get("onlinePriceSortEnabled") is None else bool(settings.get("onlinePriceSortEnabled", True)), "onlinePrivacyAccepted": None if settings.get("onlinePrivacyAccepted") is None else bool(settings.get("onlinePrivacyAccepted", False)), "onlineMetadataEnabled": None if settings.get("onlineMetadataEnabled") is None else bool(settings.get("onlineMetadataEnabled", False)), "onlineHideOwnedGames": None if settings.get("onlineHideOwnedGames") is None else bool(settings.get("onlineHideOwnedGames", False)), "onlineHideOwnedNonSteam": None if settings.get("onlineHideOwnedNonSteam") is None else bool(settings.get("onlineHideOwnedNonSteam", False)), "onlineHideOwnedNonSteamCloud": None if settings.get("onlineHideOwnedNonSteamCloud") is None else bool(settings.get("onlineHideOwnedNonSteamCloud", False)), "qamHiddenToggles": qam_hidden_toggles, "qamHiddenSections": qam_hidden_sections, "unifiedListEnabled": unified_list_enabled, "allShelvesOrder": all_shelves_order, "lightModeEnabled": light_mode_enabled, "advancedModeEnabled": advanced_mode_enabled, "templateSuggestionsEnabled": template_suggestions_enabled, "removalSuggestionsEnabled": bool(settings.get("removalSuggestionsEnabled", False)), "offlineModeEnabled": offline_mode_enabled, "featureToggles": feature_toggles, "profileTriggersEnabled": bool(settings.get("profileTriggersEnabled", False)), "factoryProfileTrigger": factory_profile_trigger, "autoCollapseEnabled": bool(settings.get("autoCollapseEnabled", False)), "notificationsDisabled": bool(settings.get("notificationsDisabled", False)), "notificationsDisabledAreas": ([str(x)[:32] for x in settings["notificationsDisabledAreas"] if isinstance(x, str)][:16] if isinstance(settings.get("notificationsDisabledAreas"), list) else []), "showcaseSeen": bool(settings.get("showcaseSeen", False)), "setupWizardSeen": bool(settings.get("setupWizardSeen", False)), "lastSetupApply": _sanitize_setup_apply(settings.get("lastSetupApply")), "hubConfig": _sanitize_hub_config(settings.get("hubConfig")), "activeProfileName": active_profile_name, "profiles": sanitized_profiles, "integrationsEnabled": integrations_enabled, "cardActionShortcutsEnabled": bool(settings.get("cardActionShortcutsEnabled", True)), "buttonBindings": button_bindings, "buttonBindingsDisabled": button_bindings_disabled, "keyboardBindings": keyboard_bindings, "keyboardBindingsDisabled": keyboard_bindings_disabled, "screensaverShelvesEnabled": None if settings.get("screensaverShelvesEnabled") is None else bool(settings.get("screensaverShelvesEnabled", False)), "screensaverShelvesIncludeScreenshots": None if settings.get("screensaverShelvesIncludeScreenshots") is None else bool(settings.get("screensaverShelvesIncludeScreenshots", False)), "screensaverOnlineScreenshotsEnabled": None if settings.get("screensaverOnlineScreenshotsEnabled") is None else bool(settings.get("screensaverOnlineScreenshotsEnabled", False)), "screensaverIdleBackupAcSec": (int(settings["screensaverIdleBackupAcSec"]) if isinstance(settings.get("screensaverIdleBackupAcSec"), (int, float)) else None), "screensaverIdleBackupBatterySec": (int(settings["screensaverIdleBackupBatterySec"]) if isinstance(settings.get("screensaverIdleBackupBatterySec"), (int, float)) else None), "screensaverStartAfterSeconds": (max(15, min(600, int(settings["screensaverStartAfterSeconds"]))) if isinstance(settings.get("screensaverStartAfterSeconds"), (int, float)) else None), "screensaverDwellSeconds": (max(3, min(120, int(settings["screensaverDwellSeconds"]))) if isinstance(settings.get("screensaverDwellSeconds"), (int, float)) else None), "screensaverLogoEnabled": None if settings.get("screensaverLogoEnabled") is None else bool(settings.get("screensaverLogoEnabled", True)), "screensaverLogoSize": (max(50, min(200, int(settings["screensaverLogoSize"]))) if isinstance(settings.get("screensaverLogoSize"), (int, float)) else None), "screensaverLogoPosition": (settings.get("screensaverLogoPosition") if settings.get("screensaverLogoPosition") in ("left", "center", "right") else None), "screensaverLogoAtTop": None if settings.get("screensaverLogoAtTop") is None else bool(settings.get("screensaverLogoAtTop", False)), "screensaverLogoOffset": (max(0, min(50, int(settings["screensaverLogoOffset"]))) if isinstance(settings.get("screensaverLogoOffset"), (int, float)) else None), "screensaverLogoOnScreenshots": None if settings.get("screensaverLogoOnScreenshots") is None else bool(settings.get("screensaverLogoOnScreenshots", True)), "screensaverShelfBatchSize": (max(1, min(20, int(settings["screensaverShelfBatchSize"]))) if isinstance(settings.get("screensaverShelfBatchSize"), (int, float)) else None), "screensaverDescriptionEnabled": None if settings.get("screensaverDescriptionEnabled") is None else bool(settings.get("screensaverDescriptionEnabled", False)), "screensaverDescriptionAboveLogo": None if settings.get("screensaverDescriptionAboveLogo") is None else bool(settings.get("screensaverDescriptionAboveLogo", False)), "screensaverDescriptionLogoGap": (max(-40, min(80, int(settings["screensaverDescriptionLogoGap"]))) if isinstance(settings.get("screensaverDescriptionLogoGap"), (int, float)) else None), "cloudSyncEnabled": None if settings.get("cloudSyncEnabled") is None else bool(settings.get("cloudSyncEnabled", False)), "cloudSyncLastSyncedAt": (float(settings["cloudSyncLastSyncedAt"]) if isinstance(settings.get("cloudSyncLastSyncedAt"), (int, float)) else None), "ownQamTabEnabled": None if settings.get("ownQamTabEnabled") is None else bool(settings.get("ownQamTabEnabled", False)), "accountSettings": _sanitize_account_settings(settings.get("accountSettings")), "showcaseModeEnabled": None if settings.get("showcaseModeEnabled") is None else bool(settings.get("showcaseModeEnabled", False)), "showcaseStartAfterSeconds": (max(15, min(600, int(settings["showcaseStartAfterSeconds"]))) if isinstance(settings.get("showcaseStartAfterSeconds"), (int, float)) else None), "showcaseDwellSeconds": (max(3, min(120, int(settings["showcaseDwellSeconds"]))) if isinstance(settings.get("showcaseDwellSeconds"), (int, float)) else None), "showcaseRandomize": None if settings.get("showcaseRandomize") is None else bool(settings.get("showcaseRandomize", False)), "showcaseStopOnInteraction": None if settings.get("showcaseStopOnInteraction") is None else bool(settings.get("showcaseStopOnInteraction", True)), "showcaseShelfIds": ([str(x)[:64] for x in settings["showcaseShelfIds"] if isinstance(x, str)][:64] if isinstance(settings.get("showcaseShelfIds"), list) else []), "showcasePanCards": None if settings.get("showcasePanCards") is None else bool(settings.get("showcasePanCards", True)), "showcaseCardsPerShelf": (max(1, min(20, int(settings["showcaseCardsPerShelf"]))) if isinstance(settings.get("showcaseCardsPerShelf"), (int, float)) else None), "showcaseCardDwellSeconds": (max(1, min(60, int(settings["showcaseCardDwellSeconds"]))) if isinstance(settings.get("showcaseCardDwellSeconds"), (int, float)) else None)})
