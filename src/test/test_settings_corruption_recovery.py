"""
Unit tests for the settings-corruption recovery path:
a truncated/unparseable primary settings.json used to silently reset to
defaults AND, on the very next save, get rotated over the last known-good
`.bak` — destroying it too. `_read_state` now recovers from `.bak` or the
newest `backups/*` snapshot instead, and `_write_state` never rotates an
unreadable primary into `.bak`.

The `decky` module is mocked before importing storage/main, matching
test_main.py's and test_storage_mirror.py's convention.
"""
import json
import os
import sys
import types as pytypes

decky_mock = pytypes.ModuleType("decky")
decky_mock.logger = pytypes.SimpleNamespace(
    error=lambda *a, **kw: None,
    info=lambda *a, **kw: None,
    warning=lambda *a, **kw: None,
)
decky_mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/test-deck-shelves-settings"
sys.modules["decky"] = decky_mock

import storage  # noqa: E402
from main import Plugin  # noqa: E402


def _isolate(monkeypatch, settings_dir):
    monkeypatch.setenv("DECK_SHELVES_SETTINGS_DIR", str(settings_dir))
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(settings_dir))


def _primary_path(settings_dir):
    return os.path.join(str(settings_dir), "settings.json")


def _write_wrapped(path, state, rev=1, updated_at=1.0):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"state": state, "rev": rev, "updatedAt": updated_at}, f)


def test_read_state_recovers_from_bak_when_primary_is_corrupt(tmp_path, monkeypatch):
    settings_dir = tmp_path / "settings"
    _isolate(monkeypatch, settings_dir)
    primary = _primary_path(settings_dir)
    good_state = {"enabled": True, "shelves": [{"id": "s1", "title": "Good", "source": {"type": "tab", "tab": "all"}}]}
    _write_wrapped(primary + ".bak", good_state, rev=5)
    with open(primary, "w", encoding="utf-8") as f:
        f.write("{not valid json")

    Plugin._corruption_recovered = False
    result = Plugin()._read_state()

    assert result["enabled"] is True
    assert result["shelves"][0]["id"] == "s1"
    assert Plugin._corruption_recovered is True
    backups = os.listdir(os.path.join(str(settings_dir), "backups"))
    assert any(f.endswith("-corrupt.json") for f in backups)


def test_read_state_recovers_from_newest_backup_when_no_bak(tmp_path, monkeypatch):
    settings_dir = tmp_path / "settings"
    _isolate(monkeypatch, settings_dir)
    primary = _primary_path(settings_dir)
    bdir = os.path.join(str(settings_dir), "backups")
    os.makedirs(bdir, exist_ok=True)
    _write_wrapped(os.path.join(bdir, "settings-20260101-000000.json"), {"enabled": False, "shelves": []}, rev=1)
    _write_wrapped(os.path.join(bdir, "settings-20260201-000000.json"), {"enabled": True, "shelves": []}, rev=2)
    with open(primary, "w", encoding="utf-8") as f:
        f.write("")

    result = Plugin()._read_state()

    assert result["enabled"] is True


def test_read_state_falls_back_to_defaults_when_nothing_recoverable(tmp_path, monkeypatch):
    settings_dir = tmp_path / "settings"
    _isolate(monkeypatch, settings_dir)
    primary = _primary_path(settings_dir)
    os.makedirs(str(settings_dir), exist_ok=True)
    with open(primary, "w", encoding="utf-8") as f:
        f.write("{corrupt")

    result = Plugin()._read_state()

    assert result["enabled"] is False


def test_write_state_never_rotates_a_corrupt_primary_into_bak(tmp_path, monkeypatch):
    settings_dir = tmp_path / "settings"
    _isolate(monkeypatch, settings_dir)
    primary = _primary_path(settings_dir)
    good_bak_state = {"enabled": True, "shelves": [{"id": "keep-me", "title": "Keep", "source": {"type": "tab", "tab": "all"}}]}
    _write_wrapped(primary + ".bak", good_bak_state, rev=3)
    with open(primary, "w", encoding="utf-8") as f:
        f.write("{still not valid")

    Plugin()._write_state({"enabled": True, "shelves": []})

    with open(primary + ".bak", encoding="utf-8") as f:
        bak_after = json.load(f)
    assert bak_after["state"]["shelves"][0]["id"] == "keep-me"
    with open(primary, encoding="utf-8") as f:
        primary_after = json.load(f)
    assert primary_after["state"]["enabled"] is True
    backups = os.listdir(os.path.join(str(settings_dir), "backups"))
    assert any(f.endswith("-corrupt.json") for f in backups)


def test_was_settings_recovered_is_one_shot():
    import asyncio
    Plugin._corruption_recovered = True
    plugin = Plugin()
    result_first = asyncio.run(plugin.was_settings_recovered())
    result_second = asyncio.run(plugin.was_settings_recovered())
    assert result_first is True
    assert result_second is False
