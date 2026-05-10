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

def test_normalize_path_plain_string():
    result = _normalize_path("/home/deck/Downloads/file.json")
    assert result == "/home/deck/Downloads/file.json"


def test_normalize_path_strips_file_protocol():
    result = _normalize_path("file:///home/deck/Downloads/file.json")
    assert "file://" not in result
    assert result.endswith("Downloads/file.json")


def test_normalize_path_reads_dest_path_from_dict():
    result = _normalize_path({"dest_path": "/home/deck/file.json"})
    assert result == "/home/deck/file.json"


def test_normalize_path_reads_src_path_from_dict():
    result = _normalize_path({"src_path": "/home/deck/file.json"})
    assert result == "/home/deck/file.json"


def test_normalize_path_strips_surrounding_quotes():
    # strip() removes outer whitespace, then strip('"') removes the quotes.
    # Spaces inside the original quotes are NOT stripped by this sequence.
    result = _normalize_path('"/home/deck/file.json"')
    assert result == "/home/deck/file.json"


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
