"""Unit tests for the versioned-backup helpers (storage.py) and the
restore RPC guards (main.Plugin). `decky` is mocked before importing."""
import json
import os
import sys
import time
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


def _use_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path))
    return str(tmp_path)


def test_versioned_backup_snapshots_and_lists(monkeypatch, tmp_path):
    d = _use_dir(monkeypatch, tmp_path)
    os.makedirs(d, exist_ok=True)
    settings_path = os.path.join(d, "settings.json")
    with open(settings_path, "w", encoding="utf-8") as f:
        json.dump({"state": {"shelves": [{"id": "a"}], "smartShelves": []}}, f)
    storage._write_versioned_backup(settings_path)
    backups = storage._list_backups()
    assert len(backups) == 1
    assert backups[0]["name"].startswith("settings-")
    assert backups[0]["summary"] == {"shelves": 1, "smartShelves": 0, "profiles": 0, "filters": 0}


def test_rotation_prunes_autos_keeps_manual(monkeypatch, tmp_path):
    _use_dir(monkeypatch, tmp_path)
    bdir = storage._backups_dir()
    os.makedirs(bdir, exist_ok=True)
    for i in range(storage.TOTAL_BACKUP_CAP + 5):
        with open(os.path.join(bdir, f"settings-201801{i:02d}-000000.json"), "w") as f:
            f.write("{}")
    # Manual + imported snapshots must survive: the total cap trims autos first.
    with open(os.path.join(bdir, "settings-20170101-000000-manual.json"), "w") as f:
        f.write("{}")
    with open(os.path.join(bdir, "settings-20170101-000000-import.json"), "w") as f:
        f.write("{}")
    storage._prune_auto_backups(bdir)
    remaining = os.listdir(bdir)
    # Total capped at 10; manual + imported kept, autos trimmed to make room.
    assert len(remaining) == storage.TOTAL_BACKUP_CAP
    assert "settings-20170101-000000-manual.json" in remaining
    assert "settings-20170101-000000-import.json" in remaining


def test_rotation_ages_out_old_autos(monkeypatch, tmp_path):
    _use_dir(monkeypatch, tmp_path)
    bdir = storage._backups_dir()
    os.makedirs(bdir, exist_ok=True)
    fresh = os.path.join(bdir, "settings-20250101-000000.json")
    stale = os.path.join(bdir, "settings-20180101-000000.json")
    stale_manual = os.path.join(bdir, "settings-20180101-000000-manual.json")
    for p in (fresh, stale, stale_manual):
        with open(p, "w") as f:
            f.write("{}")
    old = time.time() - (storage.AUTO_MAX_AGE_SECONDS + 3600)
    os.utime(stale, (old, old))
    os.utime(stale_manual, (old, old))
    storage._prune_auto_backups(bdir)
    remaining = os.listdir(bdir)
    assert os.path.basename(fresh) in remaining          # recent auto kept
    assert os.path.basename(stale) not in remaining      # old auto aged out
    assert os.path.basename(stale_manual) in remaining   # old manual never aged out


def test_summarize_handles_wrapped_and_bare():
    assert storage._summarize_settings({"state": {"shelves": [1, 2], "smartShelves": [1], "profiles": [1, 2, 3], "savedFilters": []}}) == {"shelves": 2, "smartShelves": 1, "profiles": 3, "filters": 0}
    assert storage._summarize_settings({"shelves": [1], "smartShelves": []}) == {"shelves": 1, "smartShelves": 0, "profiles": 0, "filters": 0}
    assert storage._summarize_settings({"shelves": "bad"}) == {"shelves": 0, "smartShelves": 0, "profiles": 0, "filters": 0}


def test_list_backups_missing_dir(monkeypatch, tmp_path):
    _use_dir(monkeypatch, tmp_path / "empty")
    assert storage._list_backups() == []


def test_extract_name_handles_dict_gotcha():
    p = Plugin()
    assert p._extract_name({"name": "settings-x.json"}) == "settings-x.json"
    assert p._extract_name("settings-y.json") == "settings-y.json"
    assert p._extract_name(None) == ""


def test_restore_rejects_unsafe_names(monkeypatch, tmp_path):
    _use_dir(monkeypatch, tmp_path)
    p = Plugin()
    assert p._restore_backup("../evil.json")["ok"] is False
    assert p._restore_backup("settings-a/b.json")["ok"] is False
    assert p._restore_backup("other.json")["ok"] is False
    assert p._restore_backup("settings-missing.json")["ok"] is False


def test_export_backup_copies_to_dest(monkeypatch, tmp_path):
    _use_dir(monkeypatch, tmp_path)
    bdir = storage._backups_dir()
    os.makedirs(bdir, exist_ok=True)
    name = "settings-20240101-000000.json"
    with open(os.path.join(bdir, name), "w") as f:
        json.dump({"state": {"shelves": []}}, f)
    dest = os.path.join(str(tmp_path), "out", "exported.json")
    assert storage._export_backup(name, dest) is True
    assert os.path.exists(dest)
    assert storage._export_backup("../evil.json", dest) is False
    assert storage._export_backup("settings-missing.json", dest) is False


def test_import_backup_adds_snapshot(monkeypatch, tmp_path):
    _use_dir(monkeypatch, tmp_path)
    src = os.path.join(str(tmp_path), "incoming.json")
    with open(src, "w") as f:
        json.dump({"state": {"enabled": True, "shelves": [{"id": "x"}]}}, f)
    assert storage._import_backup(src) is True
    backups = storage._list_backups()
    assert len(backups) == 1
    assert backups[0]["name"].endswith("-import.json")
    bad = os.path.join(str(tmp_path), "bad.json")
    with open(bad, "w") as f:
        json.dump({"random": 1}, f)
    assert storage._import_backup(bad) is False
    assert storage._import_backup(os.path.join(str(tmp_path), "nope.json")) is False


def test_clear_backups_removes_all(monkeypatch, tmp_path):
    _use_dir(monkeypatch, tmp_path)
    bdir = storage._backups_dir()
    os.makedirs(bdir, exist_ok=True)
    for nm in ("settings-20240101-000000.json", "settings-20240101-000001-manual.json", "settings-20240101-000002-import.json"):
        with open(os.path.join(bdir, nm), "w") as f:
            f.write("{}")
    assert storage._clear_backups() == 3
    assert storage._list_backups() == []


def test_restore_round_trip(monkeypatch, tmp_path):
    _use_dir(monkeypatch, tmp_path)
    p = Plugin()
    shelf = {"id": "s1", "title": "One", "source": {"type": "tab", "tab": "all"}, "limit": 5, "enabled": True, "hidden": False}
    p._write_state({"enabled": True, "shelves": [shelf]})   # first save (no prior file → no backup)
    p._write_state({"enabled": True, "shelves": []})        # second save snapshots the 1-shelf state
    backups = storage._list_backups()
    assert len(backups) >= 1
    res = p._restore_backup(backups[0]["name"])
    assert res["ok"] is True
    assert len(res["state"]["shelves"]) == 1
