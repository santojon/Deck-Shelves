"""Tests for sanitizer forward-compat: known fields are validated, but
UNKNOWN fields (written by a newer plugin version) are preserved, not dropped —
so a mixed-version dual-host install never loses newer-only settings."""
import pytest

import sanitizer


def test_known_fields_still_validated():
    out = sanitizer._sanitize_settings({"enabled": "yes", "hideRecents": 1})
    assert out["enabled"] is True and out["hideRecents"] is True


def test_unknown_field_is_preserved():
    out = sanitizer._sanitize_settings({"enabled": True, "futureFeatureX": {"a": 1, "b": [2, 3]}})
    assert out["futureFeatureX"] == {"a": 1, "b": [2, 3]}


def test_unknown_scalar_preserved():
    out = sanitizer._sanitize_settings({"someNewFlag": True, "someNewNumber": 42})
    assert out["someNewFlag"] is True and out["someNewNumber"] == 42


def test_non_json_value_dropped():
    out = sanitizer._sanitize_settings({"bad": {1, 2, 3}})
    assert "bad" not in out


def test_overlong_key_dropped():
    key = "x" * 100
    out = sanitizer._sanitize_settings({key: "v"})
    assert key not in out


def test_oversize_value_dropped():
    out = sanitizer._sanitize_settings({"huge": "z" * (64 * 1024 + 10)})
    assert "huge" not in out


def test_unknown_key_cap():
    raw = {f"future_{i}": i for i in range(200)}
    out = sanitizer._sanitize_settings(raw)
    kept = [k for k in out if k.startswith("future_")]
    assert len(kept) == 64


def test_schema_version_round_trips():
    out = sanitizer._sanitize_settings({"enabled": True, "schemaVersion": 3})
    assert out["schemaVersion"] == 3


def test_known_invalid_field_not_resurrected_as_unknown():
    out = sanitizer._sanitize_settings({"globalLogoPosition": "diagonal"})
    assert out["globalLogoPosition"] is None


def test_entity_clocks_survive_sanitizing():
    """Cloud-sync merge picks the newer copy of each entity by `updatedAt`;
    saved filters, saved smart filters and profiles must keep it."""
    out = sanitizer._sanitize_settings({
        "savedFilters": [{"id": "f1", "name": "F", "group": {"mode": "and", "items": []}, "updatedAt": 222}],
        "savedSmartFilters": [{"id": "g1", "name": "G", "mode": "recently_played", "updatedAt": 333}],
        "profiles": [{"id": "p1", "name": "P", "createdAt": "x", "snapshot": {}, "updatedAt": 444}],
    })
    assert out["savedFilters"][0]["updatedAt"] == 222
    assert out["savedSmartFilters"][0]["updatedAt"] == 333
    assert out["profiles"][0]["updatedAt"] == 444


def test_invalid_entity_clock_is_dropped():
    out = sanitizer._sanitize_settings({
        "profiles": [{"id": "p1", "name": "P", "createdAt": "x", "snapshot": {}, "updatedAt": -5},
                     {"id": "p2", "name": "Q", "createdAt": "x", "snapshot": {}, "updatedAt": "soon"}],
    })
    assert all("updatedAt" not in p for p in out["profiles"])


def test_profile_link_shelves_survives():
    out = sanitizer._sanitize_settings({
        "profiles": [{"id": "p1", "name": "P", "createdAt": "x", "snapshot": {}, "linkShelves": True}],
    })
    assert out["profiles"][0]["linkShelves"] is True


def test_sidecar_gestures_can_be_disabled():
    out = sanitizer._sanitize_settings({"buttonBindingsDisabled": ["navSidecarOpen", "navSidecarClose", "bogus"]})
    assert out["buttonBindingsDisabled"] == ["navSidecarOpen", "navSidecarClose"]


def test_smart_shelf_logo_offset_keeps_the_regular_range():
    smart = {"id": "sm1", "title": "Smart", "mode": "recently_played", "enabled": True}
    out = sanitizer._sanitize_settings({"smartShelves": [
        {**smart, "logoTopOffset": -30},
        {**smart, "id": "sm2", "logoTopOffset": -80},
        {**smart, "id": "sm3", "logoTopOffset": 140},
    ]})
    assert [s["logoTopOffset"] for s in out["smartShelves"]] == [-30, -50, 100]


def test_a_smart_shelf_keeps_its_sort_when_there_is_no_regular_shelf():
    doc = {"enabled": True, "shelves": [], "smartShelves": [{"id": "sm1", "title": "Quick", "mode": "quick_play", "sort": "recent"}]}
    out = sanitizer._sanitize_settings(doc)
    assert [s["id"] for s in out["smartShelves"]] == ["sm1"]
    assert out["smartShelves"][0]["sort"] == "recent"


def test_a_smart_shelf_sort_is_the_same_with_or_without_regular_shelves():
    smart = {"id": "sm1", "title": "Quick", "mode": "quick_play", "sort": "playtime", "sortReverse": True}
    regular = {"id": "s1", "title": "A", "source": {"type": "filter", "filter": {"sort": "recent"}}}
    alone = sanitizer._sanitize_settings({"enabled": True, "shelves": [], "smartShelves": [dict(smart)]})
    beside = sanitizer._sanitize_settings({"enabled": True, "shelves": [regular], "smartShelves": [dict(smart)]})
    assert alone["smartShelves"] == beside["smartShelves"]


# The sort keys and smart modes the backend listed by name before it kept any text id.
_BUILT_IN_SORTS = [
    "alphabetical", "recent", "playtime", "release_date", "size_on_disk", "metacritic", "review_score",
    "added", "random", "manual", "price_low", "discount_high", "original_price_high",
    "app_status", "deck_compat", "controller_support", "friends_playing_now", "owned_games",
    "completion_percent", "closest_to_completion", "most_friends_owning", "trending_among_friends",
    "family_shared_games", "source_order",
]
_BUILT_IN_MODES = [
    "quick_play", "not_started", "deck_picks", "rediscover", "best_unplayed",
    "interrupted", "time_of_day", "daily_pick", "on_deck", "recently_played",
    "long_session", "non_steam", "random_pick", "forgotten", "spare_time",
    "soundtracks", "videos", "demos", "cloud_games",
    "backlog_rescue", "forgotten_gems", "weekly_rotation",
    "short_battery", "travel_mode", "recent_hidden_installs",
    "low_battery_mode", "friends_playing", "almost_finished", "couch_gaming", "coop_ready",
    "party_games", "custom",
    "long_session_night", "hidden_gems", "never_touched_classics", "monthly_spotlight",
    "seasonal_rotation",
]


def _shelf(**fields):
    return {"id": "s1", "title": "A", "source": {"type": "filter", "filter": {}}, **fields}


def _smart(**fields):
    return {"id": "sm1", "title": "Quick", "mode": "quick_play", **fields}


def _sanitized_shelf(**fields):
    return sanitizer._sanitize_settings({"enabled": True, "shelves": [_shelf(**fields)]})["shelves"][0]


def _sanitized_smart(**fields):
    return sanitizer._sanitize_settings({"enabled": True, "smartShelves": [_smart(**fields)]})["smartShelves"]


def test_a_smart_shelf_in_a_mode_the_backend_does_not_know_is_kept():
    out = _sanitized_smart(mode="acme.mode")
    assert [s["mode"] for s in out] == ["acme.mode"]


def test_a_single_unknown_sort_key_is_kept_on_both_shelf_kinds():
    assert _sanitized_shelf(sort="acme.order")["sort"] == "acme.order"
    assert _sanitized_smart(sort="acme.order")[0]["sort"] == "acme.order"


def test_an_unknown_base_order_is_kept_on_a_smart_shelf():
    assert _sanitized_smart(manualBaseSort="acme.order")[0]["manualBaseSort"] == "acme.order"


def test_an_old_single_sort_key_is_kept():
    assert _sanitized_shelf(sort="newest_purchased")["sort"] == "newest_purchased"


@pytest.mark.parametrize("bad", ["", 3, True, {"k": 1}, "x" * 65])
def test_a_sort_that_is_not_stored_text_is_dropped(bad):
    assert "sort" not in _sanitized_shelf(sort=bad)
    assert "sort" not in _sanitized_smart(sort=bad)[0]


@pytest.mark.parametrize("bad", ["", 3, True, {"k": 1}, ["recent"], "x" * 65, "manual"])
def test_a_smart_base_order_that_is_not_stored_text_or_is_manual_is_dropped(bad):
    assert "manualBaseSort" not in _sanitized_smart(manualBaseSort=bad)[0]


@pytest.mark.parametrize("bad", ["", 3, True, {"k": 1}, "x" * 65])
def test_a_smart_shelf_whose_mode_is_not_stored_text_is_dropped(bad):
    assert _sanitized_smart(mode=bad) == []


@pytest.mark.parametrize("key", _BUILT_IN_SORTS)
def test_every_built_in_sort_key_comes_back_as_it_went_in(key):
    assert _sanitized_shelf(sort=key)["sort"] == key
    assert _sanitized_smart(sort=key)[0]["sort"] == key
    base = _sanitized_smart(manualBaseSort=key)[0]
    if key == "manual":
        assert "manualBaseSort" not in base
    else:
        assert base["manualBaseSort"] == key


@pytest.mark.parametrize("mode", _BUILT_IN_MODES)
def test_every_built_in_mode_comes_back_as_it_went_in(mode):
    assert [s["mode"] for s in _sanitized_smart(mode=mode)] == [mode]
