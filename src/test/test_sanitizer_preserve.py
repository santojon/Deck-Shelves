"""Tests for sanitizer forward-compat (§4A): known fields are validated, but
UNKNOWN fields (written by a newer plugin version) are preserved, not dropped —
so a mixed-version dual-host install never loses newer-only settings."""
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
    # §4B: schemaVersion isn't a whitelisted field, but must survive (preserved)
    # so an older version can't strip a newer document's version stamp.
    out = sanitizer._sanitize_settings({"enabled": True, "schemaVersion": 3})
    assert out["schemaVersion"] == 3


def test_known_invalid_field_not_resurrected_as_unknown():
    # A known field with an invalid value is validated to a default in the
    # whitelist; _preserve_unknown must not copy the raw (invalid) value back.
    out = sanitizer._sanitize_settings({"globalLogoPosition": "diagonal"})
    assert out["globalLogoPosition"] is None
