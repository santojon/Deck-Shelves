"""The neutral host's config entity: sanitized shape + per-key merge on save."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from sanitizer import _sanitize_hub_config, _sanitize_settings, merge_hub_config  # noqa: E402


def test_sanitize_keeps_scalars_and_clocks_only():
    raw = {"values": {"auto_update": True, "interval": 30, "name": "x" * 300, "bad": {"nested": 1}, 7: "no"}, "updatedAt": {"auto_update": 5, "interval": "soon", "orphan": 9}}
    out = _sanitize_hub_config(raw)
    assert out["values"] == {"auto_update": True, "interval": 30, "name": "x" * 256}
    assert out["updatedAt"] == {"auto_update": 5.0}
    assert _sanitize_hub_config(None) is None
    assert _sanitize_hub_config({"values": "nope"}) is None


def test_merge_is_per_key_lww_and_never_erases_with_empty():
    cur = {"values": {"a": 1, "b": 1}, "updatedAt": {"a": 10, "b": 20}}
    new = {"values": {"a": 2, "b": 2, "c": 3}, "updatedAt": {"a": 15, "b": 20, "c": 1}}
    out = merge_hub_config(cur, new)
    assert out["values"] == {"a": 2, "b": 1, "c": 3}
    assert out["updatedAt"] == {"a": 15.0, "b": 20.0, "c": 1.0}
    assert merge_hub_config(cur, {"values": {}, "updatedAt": {}}) == _sanitize_hub_config(cur)
    assert merge_hub_config(None, new) == _sanitize_hub_config(new)
    assert merge_hub_config(cur, None) == _sanitize_hub_config(cur)


def test_settings_sanitizer_carries_the_entity():
    out = _sanitize_settings({"hubConfig": {"values": {"k": "v"}, "updatedAt": {"k": 1}}})
    assert out["hubConfig"] == {"values": {"k": "v"}, "updatedAt": {"k": 1.0}}
    assert _sanitize_settings({})["hubConfig"] is None
