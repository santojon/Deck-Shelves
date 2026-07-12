"""
Unit tests for main.py — covers _sanitize_settings and _normalize_path.

The `decky` module is mocked before importing main, since it is only
available in the Decky Loader runtime environment.
"""
import sys
import types as pytypes

# Mock the decky module before any import of main
decky_mock = pytypes.ModuleType("decky")
decky_mock.logger = pytypes.SimpleNamespace(
    error=lambda *a, **kw: None,
    info=lambda *a, **kw: None,
    warning=lambda *a, **kw: None,
)
decky_mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/test-deck-shelves-settings"
sys.modules["decky"] = decky_mock

from main import _sanitize_settings, _normalize_path  # noqa: E402


# ─── _sanitize_settings ────────────────────────────────────────────────────────

def test_sanitize_settings_empty_input():
    result = _sanitize_settings({})
    assert result["enabled"] is False
    assert result["shelves"] == []


def test_sanitize_settings_preserves_enabled_true():
    result = _sanitize_settings({"enabled": True, "shelves": []})
    assert result["enabled"] is True


def test_sanitize_settings_preserves_verbose_logging():
    # The sanitizer whitelists top-level keys — a setting missing here is
    # silently dropped on every save (regression: the verbose-logging toggle).
    assert _sanitize_settings({"verboseLoggingEnabled": True, "shelves": []})["verboseLoggingEnabled"] is True
    assert _sanitize_settings({"shelves": []})["verboseLoggingEnabled"] is False


def test_sanitize_settings_non_dict_input_treated_as_empty():
    result = _sanitize_settings("not a dict")
    assert result["enabled"] is False
    assert result["shelves"] == []


def test_sanitize_settings_non_list_shelves_treated_as_empty():
    result = _sanitize_settings({"enabled": True, "shelves": "invalid"})
    assert result["shelves"] == []


def test_sanitize_settings_valid_shelf_passes_through():
    result = _sanitize_settings({
        "enabled": True,
        "shelves": [{
            "id": "my-shelf",
            "title": "My Shelf",
            "source": {"type": "tab", "tab": "all"},
            "limit": 10,
            "hidden": False,
            "enabled": True,
        }],
    })
    assert len(result["shelves"]) == 1
    shelf = result["shelves"][0]
    assert shelf["id"] == "my-shelf"
    assert shelf["title"] == "My Shelf"
    assert shelf["limit"] == 10
    assert shelf["hidden"] is False
    assert shelf["enabled"] is True


def test_sanitize_settings_rejects_shelf_with_empty_id():
    result = _sanitize_settings({
        "shelves": [{"id": "", "title": "Bad", "source": {"type": "tab", "tab": "all"}}],
    })
    assert result["shelves"] == []


def test_sanitize_settings_rejects_non_dict_shelf():
    result = _sanitize_settings({"shelves": ["not a dict", 42, None]})
    assert result["shelves"] == []


def test_sanitize_settings_truncates_id_to_64_chars():
    long_id = "a" * 100
    result = _sanitize_settings({
        "shelves": [{"id": long_id, "title": "T", "source": {"type": "tab", "tab": "all"}}],
    })
    assert len(result["shelves"][0]["id"]) == 64


def test_sanitize_settings_truncates_title_to_64_chars():
    long_title = "T" * 100
    result = _sanitize_settings({
        "shelves": [{"id": "x", "title": long_title, "source": {"type": "tab", "tab": "all"}}],
    })
    assert len(result["shelves"][0]["title"]) == 64


def test_sanitize_settings_replaces_object_object_title():
    result = _sanitize_settings({
        "shelves": [{"id": "x", "title": "[object Object]", "source": {"type": "tab", "tab": "all"}}],
    })
    assert result["shelves"][0]["title"] == "Shelf"


def test_sanitize_settings_defaults_missing_title_to_shelf():
    result = _sanitize_settings({
        "shelves": [{"id": "x", "source": {"type": "tab", "tab": "all"}}],
    })
    assert result["shelves"][0]["title"] == "Shelf"


def test_sanitize_settings_clamps_limit_to_100():
    result = _sanitize_settings({
        "shelves": [{"id": "x", "title": "T", "source": {"type": "tab", "tab": "all"}, "limit": 9999}],
    })
    assert result["shelves"][0]["limit"] == 100


def test_sanitize_settings_clamps_limit_minimum_to_1():
    # limit=0 is falsy in Python: `int(0 or 12)` → 12, then clamped to max(1,12) = 12
    result = _sanitize_settings({
        "shelves": [{"id": "x", "title": "T", "source": {"type": "tab", "tab": "all"}, "limit": 0}],
    })
    assert result["shelves"][0]["limit"] == 12


def test_sanitize_settings_invalid_limit_defaults_to_12():
    result = _sanitize_settings({
        "shelves": [{"id": "x", "title": "T", "source": {"type": "tab", "tab": "all"}, "limit": "bad"}],
    })
    assert result["shelves"][0]["limit"] == 12


def test_sanitize_settings_defaults_missing_source():
    result = _sanitize_settings({
        "shelves": [{"id": "x", "title": "T"}],
    })
    assert result["shelves"][0]["source"] == {"type": "tab", "tab": "all"}


def test_sanitize_settings_multiple_shelves():
    result = _sanitize_settings({
        "shelves": [
            {"id": "a", "title": "A", "source": {"type": "tab", "tab": "all"}},
            {"id": "b", "title": "B", "source": {"type": "tab", "tab": "all"}},
        ],
    })
    assert len(result["shelves"]) == 2
    assert result["shelves"][0]["id"] == "a"
    assert result["shelves"][1]["id"] == "b"


# ─── _normalize_path ───────────────────────────────────────────────────────────

import os as _os

_HOME = _os.path.realpath(_os.path.expanduser("~"))


def test_normalize_path_plain_string():
    # Path must be under home to be accepted by the security guard.
    p = _os.path.join(_HOME, "Downloads", "file.json")
    result = _normalize_path(p)
    assert result == _os.path.realpath(p)


def test_normalize_path_strips_file_protocol():
    p = _os.path.join(_HOME, "Downloads", "file.json")
    result = _normalize_path(f"file://{p}")
    assert "file://" not in result
    assert result.endswith("file.json")


def test_normalize_path_reads_dest_path_from_dict():
    p = _os.path.join(_HOME, "file.json")
    result = _normalize_path({"dest_path": p})
    assert result == _os.path.realpath(p)


def test_normalize_path_reads_src_path_from_dict():
    p = _os.path.join(_HOME, "file.json")
    result = _normalize_path({"src_path": p})
    assert result == _os.path.realpath(p)


def test_normalize_path_strips_surrounding_quotes():
    p = _os.path.join(_HOME, "file.json")
    result = _normalize_path(f'"{p}"')
    assert result == _os.path.realpath(p)


def test_normalize_path_rejects_outside_home():
    # Path traversal / system paths must be blocked.
    assert _normalize_path("/etc/passwd") == ""
    assert _normalize_path("/root/.ssh/id_rsa") == ""
    assert _normalize_path(_HOME + "/../../../etc/passwd") == ""


def test_normalize_path_non_string_non_dict_returns_empty():
    assert _normalize_path(12345) == ""
    assert _normalize_path(None) == ""
    assert _normalize_path([]) == ""


# ─── updateNotify* sanitizer (regression for null-on-load bug) ────────────────

def test_sanitize_settings_updateNotifyEnabled_default_true():
    result = _sanitize_settings({})
    assert result["updateNotifyEnabled"] is True


def test_sanitize_settings_updateNotifyEnabled_preserved():
    result = _sanitize_settings({"updateNotifyEnabled": False})
    assert result["updateNotifyEnabled"] is False


def test_sanitize_settings_updateNotifyDismissedVersion_unset_returns_null():
    # The frontend Zod schema must accept null here (covered separately in
    # the TS regression suite); this just pins the sanitizer's contract.
    result = _sanitize_settings({})
    assert result["updateNotifyDismissedVersion"] is None


def test_sanitize_settings_updateNotifyDismissedVersion_string_truncated():
    long = "v" + "9" * 200
    result = _sanitize_settings({"updateNotifyDismissedVersion": long})
    assert isinstance(result["updateNotifyDismissedVersion"], str)
    assert len(result["updateNotifyDismissedVersion"]) <= 64


def test_sanitize_settings_updateNotifyDismissedVersion_non_string_returns_null():
    result = _sanitize_settings({"updateNotifyDismissedVersion": 123})
    assert result["updateNotifyDismissedVersion"] is None


def test_sanitize_settings_round_trip_preserves_shelves_with_updateNotify_null():
    # Reproduces the user-reported regression: shelves were silently wiped
    # because the frontend Zod schema rejected the sanitizer's null fields.
    initial = {
        "enabled": True,
        "shelves": [
            {"id": "s1", "title": "T", "limit": 10, "source": {"type": "tab", "tab": "favorites"}}
        ],
    }
    sanitized = _sanitize_settings(initial)
    assert len(sanitized["shelves"]) == 1
    assert sanitized["shelves"][0]["id"] == "s1"
    # Both new fields appear in output and either include real values or null.
    assert "updateNotifyEnabled" in sanitized
    assert "updateNotifyDismissedVersion" in sanitized


# ─── heroEnabled sanitizer (regular + smart shelves) ─────────────────────────

def test_sanitize_settings_heroEnabled_regular_shelf():
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "favorites"},
                     "heroEnabled": True}]
    })
    assert result["shelves"][0].get("heroEnabled") is True


def test_sanitize_settings_heroEnabled_false_omitted():
    # False is the default — sanitizer should omit it to keep storage minimal.
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "favorites"},
                     "heroEnabled": False}]
    })
    assert result["shelves"][0].get("heroEnabled") is not True


def test_sanitize_settings_heroEnabled_smart_shelf():
    result = _sanitize_settings({
        "smartShelves": [{"id": "sm1", "title": "Smart", "mode": "recently_played",
                          "heroEnabled": True}]
    })
    assert result["smartShelves"][0].get("heroEnabled") is True


# ─── gameInfoAbove sanitizer (regular + smart + global) ──────────────────────

def test_sanitize_settings_gameInfoAbove_regular_shelf():
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "favorites"},
                     "gameInfoAbove": True}]
    })
    assert result["shelves"][0].get("gameInfoAbove") is True


def test_sanitize_settings_gameInfoAbove_false_omitted():
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "favorites"},
                     "gameInfoAbove": False}]
    })
    assert result["shelves"][0].get("gameInfoAbove") is not True


def test_sanitize_settings_gameInfoAbove_smart_shelf():
    result = _sanitize_settings({
        "smartShelves": [{"id": "sm1", "title": "Smart", "mode": "recently_played",
                          "gameInfoAbove": True}]
    })
    assert result["smartShelves"][0].get("gameInfoAbove") is True


def test_sanitize_settings_global_gameInfoAbove():
    assert _sanitize_settings({"globalGameInfoAbove": True}).get("globalGameInfoAbove") is True
    assert _sanitize_settings({}).get("globalGameInfoAbove") is False


# ─── hiddenAppIds in smart shelves ───────────────────────────────────────────

def test_sanitize_settings_hiddenAppIds_smart_shelf():
    result = _sanitize_settings({
        "smartShelves": [{"id": "sm1", "title": "Smart", "mode": "recently_played",
                          "hiddenAppIds": [730, 570, 0, -1, "bad"]}]
    })
    # Only positive integers survive.
    assert result["smartShelves"][0].get("hiddenAppIds") == [730, 570]


def test_sanitize_settings_highlightedAppIds_smart_shelf():
    result = _sanitize_settings({
        "smartShelves": [{"id": "sm1", "title": "Smart", "mode": "recently_played",
                          "highlightedAppIds": [440, 0]}]
    })
    assert result["smartShelves"][0].get("highlightedAppIds") == [440]


# ─── forceCssLoaderThemes sanitizer ──────────────────────────────────────────

def test_sanitize_settings_forceCssLoaderThemes_true():
    result = _sanitize_settings({"forceCssLoaderThemes": True})
    assert result.get("forceCssLoaderThemes") is True


def test_sanitize_settings_forceCssLoaderThemes_default_false():
    result = _sanitize_settings({})
    assert result.get("forceCssLoaderThemes") is False


# ─── sortReverse in context-menu persist path ─────────────────────────────────

def test_sanitize_settings_sortReverse_shelf():
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "favorites"},
                     "sortReverse": True}]
    })
    assert result["shelves"][0].get("sortReverse") is True


def test_sanitize_settings_sortReverse_smart_shelf():
    result = _sanitize_settings({
        "smartShelves": [{"id": "sm1", "title": "Smart", "mode": "recently_played",
                          "sortReverse": True}]
    })
    assert result["smartShelves"][0].get("sortReverse") is True


# ─── Multi-key sort persistence (regression) ────────────────────────────────
# Pre-fix, `str(s.get("sort"))` coerced arrays into their Python repr
# ("['recent', 'alphabetical']") which failed the valid_sorts check and
# dropped the field silently. The editor's multi-key chains never reached
# the JS resolver because of this. These tests pin the array passthrough.

def test_sanitize_settings_sort_multi_key_array_passthrough():
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "all"},
                     "sort": ["recent", "alphabetical"]}]
    })
    assert result["shelves"][0].get("sort") == ["recent", "alphabetical"]


def test_sanitize_settings_sortReverse_multi_key_array_passthrough():
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "all"},
                     "sort": ["recent", "alphabetical"],
                     "sortReverse": [True, False]}]
    })
    assert result["shelves"][0].get("sortReverse") == [True, False]


def test_sanitize_settings_sortReverse_all_false_array_omitted():
    # `[False, False]` carries no real signal — the sanitizer omits the
    # field, matching the single-key bool=False omission policy.
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "all"},
                     "sort": ["recent", "alphabetical"],
                     "sortReverse": [False, False]}]
    })
    assert "sortReverse" not in result["shelves"][0]


def test_sanitize_settings_sort_array_with_unknown_string_passes_through():
    # Unknown sort ids (external sort plugins) ride alongside known
    # enums in the array. The sanitizer must NOT filter them, since the
    # registry that knows them lives in the frontend.
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "all"},
                     "sort": ["external:my_plugin_sort", "alphabetical"]}]
    })
    assert result["shelves"][0].get("sort") == ["external:my_plugin_sort", "alphabetical"]


def test_sanitize_settings_sort_array_empty_treated_as_missing():
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "all"},
                     "sort": []}]
    })
    assert "sort" not in result["shelves"][0]


def test_sanitize_settings_smart_sort_multi_key_array_passthrough():
    result = _sanitize_settings({
        "smartShelves": [{"id": "sm1", "title": "Smart", "mode": "recently_played",
                          "sort": ["playtime", "alphabetical"],
                          "sortReverse": [True, False]}]
    })
    assert result["smartShelves"][0].get("sort") == ["playtime", "alphabetical"]
    assert result["smartShelves"][0].get("sortReverse") == [True, False]


def test_sanitize_settings_single_key_sort_still_works():
    # Back-compat: single-key string sort behavior unchanged after the
    # multi-key extension.
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "limit": 10,
                     "source": {"type": "tab", "tab": "all"},
                     "sort": "recent",
                     "sortReverse": True}]
    })
    assert result["shelves"][0].get("sort") == "recent"
    assert result["shelves"][0].get("sortReverse") is True


def test_sanitize_settings_buttonBindings_passthrough():
    result = _sanitize_settings({
        "buttonBindings": {
            "cardHideRemove": "X",
            "cardHighlightToggle": "Y",
            "cardQuickLaunch": None,
            "navSearch": "L1+R1",
            "navSideNav": "L1+L1",
        }
    })
    bb = result.get("buttonBindings")
    assert bb is not None
    assert bb.get("cardHideRemove") == "X"
    assert bb.get("cardHighlightToggle") == "Y"
    assert bb.get("cardQuickLaunch") is None
    assert bb.get("navSearch") == "L1+R1"
    assert bb.get("navSideNav") == "L1+L1"


def test_sanitize_settings_buttonBindings_missing_yields_empty_dict():
    result = _sanitize_settings({})
    assert result.get("buttonBindings") == {}


def test_sanitize_settings_buttonBindings_uppercases_and_trims():
    result = _sanitize_settings({
        "buttonBindings": {"cardHideRemove": "  l1+r1  "}
    })
    assert result["buttonBindings"]["cardHideRemove"] == "L1+R1"


# ─── Logo / icon / description tri-state preservation ──────────────────────────

def test_sanitize_shelf_enableLogo_true_round_trip():
    result = _sanitize_settings({
        "shelves": [{
            "id": "s1",
            "title": "S1",
            "source": {"type": "tab", "tab": "all"},
            "enableLogo": True,
        }]
    })
    assert result["shelves"][0].get("enableLogo") is True


def test_sanitize_shelf_enableLogo_false_round_trip():
    """Explicit per-shelf opt-out must survive sanitisation. A previous bug
    collapsed `False` to `None` on output, so the global master switch had
    no way to override per-shelf state. The tri-state semantic
    (True / False / None=follow-global) requires both booleans to round-trip."""
    result = _sanitize_settings({
        "shelves": [{
            "id": "s1",
            "title": "S1",
            "source": {"type": "tab", "tab": "all"},
            "enableLogo": False,
        }]
    })
    assert result["shelves"][0].get("enableLogo") is False


def test_sanitize_shelf_enableLogo_missing_omitted_from_output():
    """`None` (follow-global) means the key is absent on output so the
    settings blob stays small for the default case."""
    result = _sanitize_settings({
        "shelves": [{
            "id": "s1",
            "title": "S1",
            "source": {"type": "tab", "tab": "all"},
        }]
    })
    assert "enableLogo" not in result["shelves"][0]
    assert "enableIcon" not in result["shelves"][0]
    assert "enableDescription" not in result["shelves"][0]


def test_sanitize_shelf_enableIcon_enableDescription_round_trip():
    result = _sanitize_settings({
        "shelves": [{
            "id": "s1",
            "title": "S1",
            "source": {"type": "tab", "tab": "all"},
            "enableIcon": False,
            "enableDescription": True,
        }]
    })
    sh = result["shelves"][0]
    assert sh.get("enableIcon") is False
    assert sh.get("enableDescription") is True


# ─── Composite source shape ────────────────────────────────────────────────────

def test_sanitize_composite_source_passes_through():
    result = _sanitize_settings({
        "shelves": [{
            "id": "s1",
            "title": "Composite",
            "source": {
                "type": "composite",
                "combine": "union",
                "sources": [
                    {"type": "tab", "tab": "installed"},
                    {"type": "wishlist"},
                ],
            },
        }]
    })
    sh = result["shelves"][0]
    assert sh["source"]["type"] == "composite"
    assert sh["source"]["combine"] == "union"
    assert len(sh["source"]["sources"]) == 2


def test_sanitize_composite_intersection_passes_through():
    result = _sanitize_settings({
        "shelves": [{
            "id": "s1",
            "title": "Both",
            "source": {
                "type": "composite",
                "combine": "intersection",
                "sources": [
                    {"type": "tab", "tab": "installed"},
                    {"type": "filter", "filter": {"group": {"mode": "and", "items": []}}},
                ],
            },
        }]
    })
    assert result["shelves"][0]["source"]["combine"] == "intersection"


# ─── Profiles (snapshot + trigger round-trip) ──────────────────────────────────

def test_sanitize_profiles_round_trip():
    result = _sanitize_settings({
        "profiles": [{
            "id": "p1",
            "name": "Travel",
            "createdAt": "2026-06-17T00:00:00Z",
            "snapshot": {"hideRecents": True},
        }],
        "activeProfileName": "Travel",
    })
    assert len(result.get("profiles", [])) == 1
    p = result["profiles"][0]
    assert p["id"] == "p1"
    assert p["name"] == "Travel"
    assert p["snapshot"] == {"hideRecents": True}
    assert result.get("activeProfileName") == "Travel"


def test_sanitize_profile_trigger_round_trip():
    """Profiles ship a forward-compat `trigger?: unknown` slot for the
    Visibility Rules v2 resolver. The sanitizer round-trips it verbatim
    when it's a dict — older clients that don't know about it just preserve."""
    result = _sanitize_settings({
        "profiles": [{
            "id": "p1",
            "name": "Low battery",
            "createdAt": "2026-06-17T00:00:00Z",
            "snapshot": {},
            "trigger": {"kind": "battery", "below": 20},
        }]
    })
    p = result["profiles"][0]
    assert p.get("trigger") == {"kind": "battery", "below": 20}


def test_sanitize_profile_trigger_invalid_dropped():
    result = _sanitize_settings({
        "profiles": [{
            "id": "p1",
            "name": "Travel",
            "createdAt": "2026-06-17T00:00:00Z",
            "snapshot": {},
            "trigger": "not a dict",
        }]
    })
    p = result["profiles"][0]
    assert "trigger" not in p


# ─── integrationsEnabled (opt-out only) ────────────────────────────────────────

def test_sanitize_integrationsEnabled_round_trip():
    result = _sanitize_settings({
        "integrationsEnabled": {
            "ext-plugin.foo": False,
            "ext-plugin.bar": True,
        }
    })
    ie = result.get("integrationsEnabled") or {}
    assert ie.get("ext-plugin.foo") is False
    assert ie.get("ext-plugin.bar") is True


def test_sanitize_integrationsEnabled_default_empty():
    result = _sanitize_settings({})
    assert result.get("integrationsEnabled") == {}


# ─── featureToggles + lightMode + unifiedListEnabled ───────────────────────────

def test_sanitize_featureToggles_round_trip():
    result = _sanitize_settings({
        "featureToggles": {"feature_widgets": False, "feature_smart_shelves": True}
    })
    ft = result.get("featureToggles") or {}
    assert ft.get("feature_widgets") is False
    assert ft.get("feature_smart_shelves") is True


def test_sanitize_lightModeEnabled_true():
    result = _sanitize_settings({"lightModeEnabled": True})
    assert result.get("lightModeEnabled") is True


def test_sanitize_unifiedListEnabled_with_allShelvesOrder():
    result = _sanitize_settings({
        "unifiedListEnabled": True,
        "allShelvesOrder": ["s1", "s2", "smart1"],
    })
    assert result.get("unifiedListEnabled") is True
    assert result.get("allShelvesOrder") == ["s1", "s2", "smart1"]


def test_sanitize_allShelvesOrder_non_list_treated_as_empty():
    result = _sanitize_settings({"allShelvesOrder": "not a list"})
    assert result.get("allShelvesOrder") == []


# ─── qamHiddenToggles / qamHiddenSections ──────────────────────────────────────

def test_sanitize_qamHiddenToggles_round_trip():
    result = _sanitize_settings({
        "qamHiddenToggles": ["hideRecents", "shelfHeroBackground"],
        "qamHiddenSections": ["smart", "additional"],
    })
    assert "hideRecents" in result.get("qamHiddenToggles", [])
    assert "smart" in result.get("qamHiddenSections", [])


def test_sanitize_qamHiddenToggles_drops_non_strings():
    result = _sanitize_settings({
        "qamHiddenToggles": ["hideRecents", 42, None, "shelfHeroBackground"]
    })
    qht = result.get("qamHiddenToggles") or []
    assert "hideRecents" in qht
    assert "shelfHeroBackground" in qht
    assert 42 not in qht
    assert None not in qht


# ─── Visibility Rules v2 (visibility tree round-trip) ─────────────────────────

_VIS = {"mode": "all", "rules": [
    {"kind": "timeWindow", "start": 19, "end": 23, "days": [5, 6]},
    {"kind": "dayOfWeek", "days": [0, 6]},
]}


def test_sanitize_visibility_round_trips_on_smart_shelf():
    result = _sanitize_settings({
        "smartShelves": [{"id": "sm1", "title": "S", "mode": "recently_played", "visibility": _VIS}]
    })
    assert result["smartShelves"][0].get("visibility") == _VIS


def test_sanitize_visibility_round_trips_on_regular_shelf():
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "source": {"type": "tab", "tab": "all"}, "visibility": _VIS}]
    })
    assert result["shelves"][0].get("visibility") == _VIS


def test_sanitize_visibility_round_trips_on_saved_smart_filter():
    result = _sanitize_settings({
        "savedSmartFilters": [{"id": "sf1", "name": "F", "mode": "recently_played", "visibility": _VIS}]
    })
    assert result["savedSmartFilters"][0].get("visibility") == _VIS


def test_sanitize_autopin_round_trips_on_shelves():
    _PIN = {"mode": "any", "rules": [{"kind": "externalDisplay"}]}
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "source": {"type": "tab", "tab": "all"}, "autoPin": _PIN}],
        "smartShelves": [{"id": "sm1", "title": "S", "mode": "recently_played", "autoPin": _PIN}],
    })
    assert result["shelves"][0].get("autoPin") == _PIN
    assert result["smartShelves"][0].get("autoPin") == _PIN


def test_sanitize_visibility_empty_rules_omitted():
    # No usable rules == no restriction: the field is dropped, not persisted empty.
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "source": {"type": "tab", "tab": "all"},
                     "visibility": {"mode": "any", "rules": []}}]
    })
    assert "visibility" not in result["shelves"][0]


def test_sanitize_visibility_forward_compat_unknown_kind_preserved():
    # A device-state kind (added in a later phase) must round-trip verbatim so an
    # older backend never drops a rule a newer build wrote.
    vis = {"mode": "any", "rules": [{"kind": "battery", "below": 20, "charging": False}]}
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "source": {"type": "tab", "tab": "all"}, "visibility": vis}]
    })
    assert result["shelves"][0].get("visibility") == vis


def test_sanitize_visibility_drops_rule_without_kind():
    vis = {"mode": "any", "rules": [{"nope": 1}, {"kind": "dayOfWeek", "days": [1]}]}
    result = _sanitize_settings({
        "shelves": [{"id": "s1", "title": "T", "source": {"type": "tab", "tab": "all"}, "visibility": vis}]
    })
    rules = result["shelves"][0]["visibility"]["rules"]
    assert rules == [{"kind": "dayOfWeek", "days": [1]}]


def test_sanitize_profile_trigger_round_trips():
    result = _sanitize_settings({
        "profiles": [{"id": "p1", "name": "Evening", "createdAt": "x", "snapshot": {}, "trigger": _VIS}]
    })
    assert result["profiles"][0].get("trigger") == _VIS


def test_sanitize_profile_triggers_enabled_toggle():
    assert _sanitize_settings({"profileTriggersEnabled": True})["profileTriggersEnabled"] is True
    assert _sanitize_settings({})["profileTriggersEnabled"] is False


# ─── CSS Loader theme reader (Phase D) ───────────────────────────────────────

def _make_theme(themes_dir, folder, active, name=None):
    import os as _os
    import json as _json
    d = _os.path.join(themes_dir, folder)
    _os.makedirs(d, exist_ok=True)
    if name is not None:
        with open(_os.path.join(d, "theme.json"), "w", encoding="utf-8") as f:
            _json.dump({"name": name}, f)
    with open(_os.path.join(d, "config_USER.json"), "w", encoding="utf-8") as f:
        _json.dump({"active": active}, f)


def test_read_css_loader_themes(tmp_path, monkeypatch):
    from css_themes import read_css_loader_themes
    themes = tmp_path / "themes"
    themes.mkdir()
    _make_theme(str(themes), "Clean Gameview", True, name="Clean Gameview")
    _make_theme(str(themes), "MoreRound", True, name="More Round")   # name overrides folder
    _make_theme(str(themes), "Disabled Theme", False, name="Disabled")
    _make_theme(str(themes), "NoNameFolder", True)                    # falls back to folder name
    (themes / "Default.profile").mkdir()                              # profiles are skipped
    monkeypatch.setenv("DECKY_HOME", str(tmp_path))
    out = read_css_loader_themes()
    assert out["active"] == ["Clean Gameview", "More Round", "NoNameFolder"]  # sorted, disabled excluded
    assert out["installed"] == 4  # 4 theme folders (profile excluded)


def test_read_css_loader_themes_missing_dir(tmp_path, monkeypatch):
    from css_themes import read_css_loader_themes
    monkeypatch.setenv("DECKY_HOME", str(tmp_path / "nope"))
    assert read_css_loader_themes() == {"active": [], "installed": 0}


def _make_connector(root, name, status):
    d = root / name
    d.mkdir()
    (d / "status").write_text(status + "\n", encoding="utf-8")


def test_read_display_state_external_connector(tmp_path):
    from display_state import read_display_state
    _make_connector(tmp_path, "card0-eDP-1", "connected")       # internal panel
    _make_connector(tmp_path, "card0-DP-1", "connected")        # external -> docked
    _make_connector(tmp_path, "card0-Writeback-1", "unknown")   # virtual, ignored
    out = read_display_state(str(tmp_path))
    assert out == {"external": True, "supported": True}


def test_read_display_state_internal_only(tmp_path):
    from display_state import read_display_state
    _make_connector(tmp_path, "card0-eDP-1", "connected")
    _make_connector(tmp_path, "card0-DP-1", "disconnected")     # external present but unplugged
    out = read_display_state(str(tmp_path))
    assert out == {"external": False, "supported": True}


def test_read_display_state_unsupported_off_linux(tmp_path):
    from display_state import read_display_state
    # No DRM sysfs present (Windows / macOS): supported False, never mis-classifies.
    out = read_display_state(str(tmp_path / "nope"))
    assert out == {"external": False, "supported": False}


def test_perf_cpu_percent_math():
    from perf_probe import _parse_cpu_line, _cpu_percent
    a = _parse_cpu_line("cpu 100 0 50 800 50 0 0 0 0 0")  # idle+iowait = 800+50 = 850, total 1000
    b = _parse_cpu_line("cpu 200 0 100 850 100 0 0 0 0 0")  # idle 950, total 1250 → delta idle 100, total 250
    assert _cpu_percent(a, b) == 60.0  # 1 - 100/250 = 0.6
    assert _cpu_percent(a, a) is None  # no delta


def test_perf_read_mem_available_percent(tmp_path):
    from perf_probe import read_mem_available_percent
    p = tmp_path / "meminfo"
    p.write_text("MemTotal:       1000 kB\nMemFree:        100 kB\nMemAvailable:   250 kB\n", encoding="utf-8")
    assert read_mem_available_percent(str(p)) == 25.0


def test_perf_snapshot_unsupported_off_linux(tmp_path):
    from perf_probe import read_perf_snapshot
    out = read_perf_snapshot(str(tmp_path / "nostat"), str(tmp_path / "nomem"))
    assert out == {"cpuPercent": None, "memAvailablePercent": None, "supported": False}
