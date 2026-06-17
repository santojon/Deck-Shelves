"""Settings-shape normalisation. The Plugin class round-trips every
persisted-or-loaded payload through `_sanitize_settings` so the on-disk
JSON stays narrow (no unexpected keys) and a malformed write from any
client never corrupts the boot path.

Authoritative validators are in `src/types.ts` (Zod schemas); this
mirror exists because the Python side writes directly to disk in the
Decky lifecycle path and Zod can't run server-side.
"""
from typing import Any, Dict, List


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
        highlight_random = bool(s.get("highlightRandom", False))
        # Tri-state per-shelf: preserve True/False explicitly; None means
        # "follow global". Bool coerce would have collapsed False to None
        # on output (see below), so per-shelf opt-out never round-tripped
        # and the home logo / icon / description toggle silently snapped
        # back to the global default.
        enable_logo_raw = s.get("enableLogo")
        enable_icon_raw = s.get("enableIcon")
        enable_description_raw = s.get("enableDescription")
        enable_logo = bool(enable_logo_raw) if enable_logo_raw is not None else None
        enable_icon = bool(enable_icon_raw) if enable_icon_raw is not None else None
        enable_description = bool(enable_description_raw) if enable_description_raw is not None else None
        description_below_logo = bool(s.get("descriptionBelowLogo", False))
        logo_position = s.get("logoPosition") if s.get("logoPosition") in ("left", "center", "right") else None
        description_position = s.get("descriptionPosition") if s.get("descriptionPosition") in ("left", "center", "right") else None
        logo_size_raw = s.get("logoSize")
        logo_size = max(50, min(200, int(logo_size_raw))) if isinstance(logo_size_raw, (int, float)) else None
        logo_top_offset_raw = s.get("logoTopOffset")
        logo_top_offset = max(-50, min(100, int(logo_top_offset_raw))) if isinstance(logo_top_offset_raw, (int, float)) else None
        full_page_shelf = bool(s.get("fullPageShelf", False))
        icon_vertical_align = s.get("iconVerticalAlign") if s.get("iconVerticalAlign") in ("top", "center", "bottom") else None
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
        valid_sorts = {"alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score", "added", "random", "manual", "price_low", "discount_high", "original_price_high"}
        # Sort may be a single string (back-compat) OR an array of keys
        # for primary + tiebreakers. Plain `str(s.get("sort"))` would
        # have flattened the array to `"['recent', 'alphabetical']"`,
        # failing the valid_sorts check and dropping the field silently
        # — which is why multi-key sort wasn't reaching the resolver.
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
        if highlight_random:
            shelf_entry["highlightRandom"] = True
        # Emit when the user has an explicit preference (True OR False).
        # `None` falls back to global so we omit the key entirely.
        if enable_logo is not None:
            shelf_entry["enableLogo"] = enable_logo
        if enable_icon is not None:
            shelf_entry["enableIcon"] = enable_icon
        if enable_description is not None:
            shelf_entry["enableDescription"] = enable_description
        if description_below_logo:
            shelf_entry["descriptionBelowLogo"] = True
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
            # Multi-key array passes through unchanged; client + resolver
            # accept unknown strings for forward-compat (registered
            # external sort options).
            shelf_entry["sort"] = shelf_sort
        elif shelf_sort and shelf_sort in valid_sorts:
            shelf_entry["sort"] = shelf_sort
        if highlighted_ids:
            shelf_entry["highlightedAppIds"] = highlighted_ids
        if hidden_ids:
            shelf_entry["hiddenAppIds"] = hidden_ids
        if dedupe_by_exact_name:
            shelf_entry["dedupeByExactName"] = True
        if manual_ids:
            shelf_entry["manualOrder"] = manual_ids
        # manualBaseSort accepts either a single key or a multi-key
        # chain (list of strings). Unknown strings are passed through so
        # external sort plugins survive a round-trip; "manual" is
        # rejected (would be circular).
        raw_base = s.get("manualBaseSort")
        if isinstance(raw_base, list):
            cleaned_base = [str(k) for k in raw_base if isinstance(k, str) and k and k != "manual"]
            if cleaned_base:
                shelf_entry["manualBaseSort"] = cleaned_base
        elif isinstance(raw_base, str) and raw_base and raw_base != "manual":
            shelf_entry["manualBaseSort"] = raw_base
        # Asc/desc invert flags. Persisted only when explicitly true to keep
        # storage minimal; resolver treats absence as false. Array form
        # mirrors the `sort` array's per-key direction.
        raw_reverse = s.get("sortReverse")
        if isinstance(raw_reverse, list):
            cleaned_rev = [bool(b) for b in raw_reverse]
            if any(cleaned_rev):
                shelf_entry["sortReverse"] = cleaned_rev
        elif bool(raw_reverse):
            shelf_entry["sortReverse"] = True
        # Same shape for manualBaseSortReverse — accepts boolean or
        # boolean[] aligned with the multi-key base.
        raw_base_rev = s.get("manualBaseSortReverse")
        if isinstance(raw_base_rev, list):
            cleaned_base_rev = [bool(b) for b in raw_base_rev]
            if any(cleaned_base_rev):
                shelf_entry["manualBaseSortReverse"] = cleaned_base_rev
        elif bool(raw_base_rev):
            shelf_entry["manualBaseSortReverse"] = True
        # synthetic cards. Trust the client schema's
        # superRefine for rule enforcement; here just clamp types,
        # positions, and sizes so a malformed write can't crash boot.
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
                # Optional hero image — when set, the synthetic card
                # exposes `data-ds-hero-url` and the per-shelf hero
                # backdrop reads it on focus. Stripped on empty.
                if isinstance(c.get("heroImage"), str) and c["heroImage"]:
                    entry_c["heroImage"] = c["heroImage"][:1024]
                # Optional shadow mode — only meaningful for focusable
                # (linked) cards; the editor strips it for non-focusable
                # cards on save. Accept only the three known values.
                sm = c.get("shadowMode")
                if sm in ("onFocus", "always"):
                    entry_c["shadowMode"] = sm
                cleaned_synth.append(entry_c)
            if cleaned_synth:
                shelf_entry["syntheticCards"] = cleaned_synth
        sanitized.append(shelf_entry)
    # Sanitize smart shelves
    raw_smart = settings.get("smartShelves", [])
    if not isinstance(raw_smart, list):
        raw_smart = []
    sanitized_smart = []
    # MUST stay in sync with `INTERNAL_SMART_MODES` in src/steam/smartShelves.ts
    # AND the `SmartShelfModeSchema` enum in src/types.ts — missing modes here
    # silently DROP the shelf on save (it fails the `ss_mode not in valid_modes`
    # check below). When adding a new heuristic / runtime-aware template,
    # update all three locations.
    valid_modes = {
        # Round 1 — heuristic templates
        "quick_play", "not_started", "deck_picks", "rediscover", "best_unplayed",
        "interrupted", "time_of_day", "daily_pick", "on_deck", "recently_played",
        "long_session", "non_steam", "random_pick", "forgotten", "spare_time",
        # Media templates
        "soundtracks", "videos", "demos", "cloud_games",
        # v2 heuristic templates (2.4.0)
        "backlog_rescue", "forgotten_gems", "weekly_rotation",
        # Second-wave heuristic templates
        "short_battery", "long_session_night", "travel_mode", "hidden_gems",
        "never_touched_classics", "recent_hidden_installs",
        "monthly_spotlight", "seasonal_rotation",
        # Runtime-aware templates
        "low_battery_mode", "almost_finished",
        "couch_gaming", "coop_ready", "party_games",
        # Online-gated runtime template
        "friends_playing",
        # Custom (free-form filter shelf)
        "custom",
    }
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
        # Multi-key sort: same array passthrough as regular shelves.
        raw_ss_sort = ss.get("sort")
        if isinstance(raw_ss_sort, list):
            cleaned_keys = [str(k) for k in raw_ss_sort if isinstance(k, str) and k]
            if cleaned_keys:
                entry["sort"] = cleaned_keys
        else:
            ss_sort_str = str(raw_ss_sort or "")
            if ss_sort_str and ss_sort_str in valid_sorts:
                entry["sort"] = ss_sort_str
        ss_base = str(ss.get("manualBaseSort") or "")
        if ss_base and ss_base in valid_sorts and ss_base != "manual":
            entry["manualBaseSort"] = ss_base
        # Asc/desc invert flags. Same minimal-storage convention as regular shelves.
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
        # Visual overrides mirrored from regular shelves.
        for bool_key in ("matchNativeSize", "highlightFirst", "highlightAll", "highlightRandom", "enableLogo", "enableIcon", "enableDescription", "descriptionBelowLogo", "fullPageShelf", "hideStatusLine", "hideNewBadge", "hideDiscountBadge", "hideCompatIcons", "hideNonSteamBadge", "hideShelfTitle", "hideGameNames", "hideInstallIndicator", "hideSeeMore", "hideRefreshCard", "heroEnabled"):
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
            entry["logoTopOffset"] = max(0, min(100, int(lto)))
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
        # compositeModes / compositeCombine: optional source-mixing fields.
        # compositeModes is a list of mode strings; compositeCombine is
        # either "union" or "intersection". Both are dropped when invalid.
        raw_cmodes = ss.get("compositeModes")
        if isinstance(raw_cmodes, list):
            cleaned_cmodes = [str(m)[:64] for m in raw_cmodes if isinstance(m, str) and m][:5]
            if cleaned_cmodes:
                entry["compositeModes"] = cleaned_cmodes
        raw_ccombine = ss.get("compositeCombine")
        if raw_ccombine in ("union", "intersection"):
            entry["compositeCombine"] = raw_ccombine
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
    # saved smart filter groups. Schema mirrors SavedSmartFilter
    # in src/types.ts; client-side Zod is the authoritative validator.
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
        # visibleHours: array of { start, end, days? } ranges (mirrors
        # SmartShelf.visibleHours so saved entries round-trip cleanly).
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
        sanitized_saved_smart.append(entry_ss)
    update_dismissed = settings.get("updateNotifyDismissedVersion")
    update_dismissed = str(update_dismissed)[:64] if isinstance(update_dismissed, str) else None
    qam_hidden_toggles_raw = settings.get("qamHiddenToggles")
    qam_hidden_toggles = [str(x)[:64] for x in qam_hidden_toggles_raw if isinstance(x, str)] if isinstance(qam_hidden_toggles_raw, list) else []
    qam_hidden_sections_raw = settings.get("qamHiddenSections")
    qam_hidden_sections = [str(x)[:64] for x in qam_hidden_sections_raw if isinstance(x, str)] if isinstance(qam_hidden_sections_raw, list) else []
    # Sprint 12 — unified list. Order persists across mode flips.
    unified_list_enabled = bool(settings.get("unifiedListEnabled", False))
    all_shelves_order_raw = settings.get("allShelvesOrder")
    all_shelves_order = [str(x)[:64] for x in all_shelves_order_raw if isinstance(x, str)] if isinstance(all_shelves_order_raw, list) else []
    # Sprint 13 — light mode, feature toggles, profiles.
    light_mode_enabled = bool(settings.get("lightModeEnabled", False))
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
            # Sprint 18 — VisibilityRule predicate, round-tripped
            # verbatim. The dict-check guards against bad client writes
            # without enforcing the rule shape here (that's Sprint 18).
            if isinstance(ptrigger, dict):
                entry["trigger"] = ptrigger
            sanitized_profiles.append(entry)
    # Sprint 11 — per-integration enable map. Keys are descriptor ids
    # registered through the public Plugin API; value `false` opts the
    # user out of seeing that integration's contributions.
    integrations_enabled_raw = settings.get("integrationsEnabled")
    integrations_enabled = {str(k)[:64]: bool(v) for k, v in integrations_enabled_raw.items() if isinstance(k, str)} if isinstance(integrations_enabled_raw, dict) else {}
    bb_disabled_raw = settings.get("buttonBindingsDisabled")
    button_bindings_disabled: List[str] = []
    if isinstance(bb_disabled_raw, list):
        for k in bb_disabled_raw:
            if isinstance(k, str) and k in ("cardHideRemove", "cardHighlightToggle", "cardQuickLaunch", "navSearch", "navSideNav"):
                if k not in button_bindings_disabled:
                    button_bindings_disabled.append(k)
    button_bindings_raw = settings.get("buttonBindings")
    button_bindings: Dict[str, Any] = {}
    if isinstance(button_bindings_raw, dict):
        # Only emit keys that are EXPLICITLY present in the input so the
        # round-trip preserves shape. Without this, "{}" expands to
        # "{5 nulls}" and breaks settingsStore's post-save verification.
        for key in ("cardHideRemove", "cardHighlightToggle", "cardQuickLaunch", "navSearch", "navSideNav"):
            if key not in button_bindings_raw:
                continue
            v = button_bindings_raw[key]
            if v is None:
                button_bindings[key] = None
            elif isinstance(v, str):
                trimmed = v.strip().upper()[:32]
                button_bindings[key] = trimmed if trimmed else None
    return {"enabled": bool(settings.get("enabled", False)), "hideRecents": bool(settings.get("hideRecents", False)), "recentsReplaceSource": bool(settings.get("recentsReplaceSource", False)), "recentsReplaceShelfId": str(settings["recentsReplaceShelfId"])[:64] if isinstance(settings.get("recentsReplaceShelfId"), str) else None, "hideHomeTabs": bool(settings.get("hideHomeTabs", False)), "shelfHeroBackground": bool(settings.get("shelfHeroBackground", False)), "forceCssLoaderThemes": bool(settings.get("forceCssLoaderThemes", False)), "globalMatchNativeSize": bool(settings.get("globalMatchNativeSize", False)), "globalHighlightFirst": bool(settings.get("globalHighlightFirst", False)), "globalHighlightAll": bool(settings.get("globalHighlightAll", False)), "globalHighlightRandom": bool(settings.get("globalHighlightRandom", False)), "globalEnableLogo": bool(settings.get("globalEnableLogo", False)), "globalEnableIcon": bool(settings.get("globalEnableIcon", False)), "globalEnableDescription": bool(settings.get("globalEnableDescription", False)), "globalDescriptionBelowLogo": bool(settings.get("globalDescriptionBelowLogo", False)), "globalLogoPosition": (settings.get("globalLogoPosition") if settings.get("globalLogoPosition") in ("left", "center", "right") else None), "globalDescriptionPosition": (settings.get("globalDescriptionPosition") if settings.get("globalDescriptionPosition") in ("left", "center", "right") else None), "globalLogoSize": (max(50, min(200, int(settings["globalLogoSize"]))) if isinstance(settings.get("globalLogoSize"), (int, float)) else None), "globalLogoTopOffset": (max(-50, min(100, int(settings["globalLogoTopOffset"]))) if isinstance(settings.get("globalLogoTopOffset"), (int, float)) else None), "globalFullPageShelf": bool(settings.get("globalFullPageShelf", False)), "settingsPageEnabled": bool(settings.get("settingsPageEnabled", True)), "globalIconVerticalAlign": (settings.get("globalIconVerticalAlign") if settings.get("globalIconVerticalAlign") in ("top", "center", "bottom") else None), "globalShelfTitlePosition": (settings.get("globalShelfTitlePosition") if settings.get("globalShelfTitlePosition") in ("left", "center", "right") else None), "globalGameNamePosition": (settings.get("globalGameNamePosition") if settings.get("globalGameNamePosition") in ("left", "center", "right") else None), "globalPlaytimePosition": (settings.get("globalPlaytimePosition") if settings.get("globalPlaytimePosition") in ("left", "center", "right") else None), "globalDescriptionHeight": (max(1, min(3, int(settings["globalDescriptionHeight"]))) if isinstance(settings.get("globalDescriptionHeight"), (int, float)) else None), "globalDescriptionLogoGap": (max(-40, min(80, int(settings["globalDescriptionLogoGap"]))) if isinstance(settings.get("globalDescriptionLogoGap"), (int, float)) else None), "contextSearchEnabled": None if settings.get("contextSearchEnabled") is None else bool(settings.get("contextSearchEnabled", False)), "contextSearchKeyboardEnabled": None if settings.get("contextSearchKeyboardEnabled") is None else bool(settings.get("contextSearchKeyboardEnabled", True)), "contextSearchOnEnter": None if settings.get("contextSearchOnEnter") is None else bool(settings.get("contextSearchOnEnter", False)), "sideNavEnabled": None if settings.get("sideNavEnabled") is None else bool(settings.get("sideNavEnabled", False)), "globalHideStatusLine": bool(settings.get("globalHideStatusLine", False)), "globalHideNewBadge": bool(settings.get("globalHideNewBadge", False)), "globalHideDiscountBadge": bool(settings.get("globalHideDiscountBadge", False)), "globalHideCompatIcons": bool(settings.get("globalHideCompatIcons", False)), "globalHideNonSteamBadge": bool(settings.get("globalHideNonSteamBadge", False)), "globalHideShelfTitle": bool(settings.get("globalHideShelfTitle", False)), "globalHideGameNames": bool(settings.get("globalHideGameNames", False)), "globalHideInstallIndicator": bool(settings.get("globalHideInstallIndicator", False)), "globalHideSeeMore": bool(settings.get("globalHideSeeMore", False)), "globalHideRefreshCard": bool(settings.get("globalHideRefreshCard", False)), "globalDedupeByName": bool(settings.get("globalDedupeByName", False)), "globalHeroEnabled": bool(settings.get("globalHeroEnabled", False)), "shelves": sanitized, "smartShelvesEnabled": bool(settings.get("smartShelvesEnabled", False)), "smartShelvesAtBottom": bool(settings.get("smartShelvesAtBottom", False)), "smartShelves": sanitized_smart, "smartSurpriseMe": bool(settings.get("smartSurpriseMe", False)), "smartSurpriseMeCount": surprise_count, "savedFilters": sanitized_saved, "savedSmartFilters": sanitized_saved_smart, "updateNotifyEnabled": bool(settings.get("updateNotifyEnabled", True)), "updateNotifyDismissedVersion": update_dismissed, "onlineFeaturesEnabled": None if settings.get("onlineFeaturesEnabled") is None else bool(settings.get("onlineFeaturesEnabled", False)), "onlineWishlistEnabled": None if settings.get("onlineWishlistEnabled") is None else bool(settings.get("onlineWishlistEnabled", True)), "onlinePriceSortEnabled": None if settings.get("onlinePriceSortEnabled") is None else bool(settings.get("onlinePriceSortEnabled", True)), "onlinePrivacyAccepted": None if settings.get("onlinePrivacyAccepted") is None else bool(settings.get("onlinePrivacyAccepted", False)), "onlineHideOwnedGames": None if settings.get("onlineHideOwnedGames") is None else bool(settings.get("onlineHideOwnedGames", False)), "onlineHideOwnedNonSteam": None if settings.get("onlineHideOwnedNonSteam") is None else bool(settings.get("onlineHideOwnedNonSteam", False)), "onlineHideOwnedNonSteamCloud": None if settings.get("onlineHideOwnedNonSteamCloud") is None else bool(settings.get("onlineHideOwnedNonSteamCloud", False)), "qamHiddenToggles": qam_hidden_toggles, "qamHiddenSections": qam_hidden_sections, "unifiedListEnabled": unified_list_enabled, "allShelvesOrder": all_shelves_order, "lightModeEnabled": light_mode_enabled, "featureToggles": feature_toggles, "activeProfileName": active_profile_name, "profiles": sanitized_profiles, "integrationsEnabled": integrations_enabled, "buttonBindings": button_bindings, "buttonBindingsDisabled": button_bindings_disabled}
