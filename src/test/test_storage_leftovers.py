"""Snapshot pruning (unchanged from 3.4.0), quarantined copies, write leftovers and
Delete all, in both settings folders (loader and canonical)."""
import asyncio
import json
import os
import sys
import time
import types as pytypes

decky_mock = pytypes.ModuleType("decky")
decky_mock.logger = pytypes.SimpleNamespace(error=lambda *a, **kw: None, info=lambda *a, **kw: None, warning=lambda *a, **kw: None)
decky_mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/test-deck-shelves-settings"
sys.modules.setdefault("decky", decky_mock)

import storage  # noqa: E402
from main import Plugin  # noqa: E402

OLD = time.time() - 3600


def _folders(monkeypatch, tmp_path):
    loader, canonical = tmp_path / "loader", tmp_path / "canonical"
    for d in (loader, canonical):
        (d / "backups").mkdir(parents=True)
        (d / "settings.json").write_text(json.dumps({"state": {"shelves": []}, "rev": 1}))
        (d / "settings.json.bak").write_text("{}")
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(loader))
    monkeypatch.setenv("DECK_SHELVES_SETTINGS_DIR", str(canonical))
    return loader, canonical


def _touch(path, mtime=None):
    path.write_text("{}")
    if mtime is not None:
        os.utime(path, (mtime, mtime))
    return path


def test_snapshot_pruning_is_unchanged_from_340():
    assert storage.TOTAL_BACKUP_CAP == 10
    assert storage.AUTO_MAX_AGE_SECONDS == 7 * 86400


def test_profile_and_account_snapshots_count_as_automatic_but_not_for_the_daily_throttle(tmp_path):
    bdir = str(tmp_path)
    for i in range(10):
        _touch(tmp_path / f"settings-202401{i + 1:02d}-000000-pre-profile.json", OLD - 100 + i)
    _touch(tmp_path / "settings-20230101-000000-manual.json", OLD - 1000)
    _touch(tmp_path / "settings-20240201-000000.json", OLD)
    storage._prune_auto_backups(bdir)
    left = os.listdir(bdir)
    assert len(left) == 10 and "settings-20230101-000000-manual.json" in left   # a manual one is never pushed out
    assert storage._is_auto_backup("settings-20240101-000000-account-switch.json")
    assert not storage._is_auto_backup("settings-20240101-000000-pre-import.json")   # as in 3.4.0
    assert storage._newest_auto_mtime(bdir) == os.path.getmtime(tmp_path / "settings-20240201-000000.json")


def test_a_fourth_quarantined_copy_removes_the_oldest(tmp_path):
    for i in range(3):
        _touch(tmp_path / f"settings-2024010{i + 1}-000000-corrupt.json", OLD + i)
    _touch(tmp_path / "settings-20240104-000000-corrupt.json")
    storage._prune_quarantine(str(tmp_path))
    assert sorted(os.listdir(tmp_path)) == [
        "settings-20240102-000000-corrupt.json", "settings-20240103-000000-corrupt.json", "settings-20240104-000000-corrupt.json",
    ]


def test_quarantined_copies_older_than_seven_days_go(tmp_path):
    _touch(tmp_path / "settings-20240101-000000-corrupt.json", time.time() - 8 * 86400)
    _touch(tmp_path / "settings-20240102-000000-corrupt.json")
    _touch(tmp_path / "settings-20240101-000000.json", time.time() - 8 * 86400)  # snapshots are not this rule's
    storage._prune_quarantine(str(tmp_path))
    assert sorted(os.listdir(tmp_path)) == ["settings-20240101-000000.json", "settings-20240102-000000-corrupt.json"]


def test_quarantine_prunes_itself_when_a_new_copy_is_made(monkeypatch, tmp_path):
    loader, _ = _folders(monkeypatch, tmp_path)
    for i in range(3):
        _touch(loader / "backups" / f"settings-2024010{i + 1}-000000-corrupt.json", OLD + i)
    monkeypatch.setattr(storage, "_backups_dir", lambda: str(loader / "backups"))
    storage._quarantine_corrupt_primary(str(loader / "settings.json"))
    assert sum(storage._is_quarantine_file(f) for f in os.listdir(loader / "backups")) == 3


def test_stale_leftovers_go_in_both_folders_but_never_ours_or_a_recent_one(monkeypatch, tmp_path):
    loader, canonical = _folders(monkeypatch, tmp_path)
    for d in (loader, canonical):
        _touch(d / "settings.json.99999.tmp", OLD)
        _touch(d / "settings.json.tmp", OLD)
        _touch(d / "settings.json.88888.tmp")                            # recent: maybe the other host's write
        _touch(d / f"settings.json.{os.getpid()}.tmp", OLD)              # ours: a write may be under way
        _touch(d / "notes.tmp", OLD)                                     # not ours to touch
    storage.sweep_leftovers()
    for d in (loader, canonical):
        assert sorted(f for f in os.listdir(d) if f.endswith(".tmp")) == sorted(
            ["settings.json.88888.tmp", f"settings.json.{os.getpid()}.tmp", "notes.tmp"])


def test_delete_all_clears_history_and_leftovers_in_both_folders_and_keeps_the_live_settings(monkeypatch, tmp_path):
    loader, canonical = _folders(monkeypatch, tmp_path)
    for d in (loader, canonical):
        for name in ("settings-20240101-000000.json", "settings-20240101-000000-manual.json",
                     "settings-20240101-000000-pre-profile.json", "settings-20240101-000000-corrupt.json"):
            _touch(d / "backups" / name)
        _touch(d / "settings.json.77777.tmp", time.time() - 60)
    removed = storage._clear_backups()
    assert removed == 10
    for d in (loader, canonical):
        assert os.listdir(d / "backups") == []
        assert sorted(os.listdir(d)) == ["backups", "settings.json", "settings.json.bak"]


def test_the_mirror_writer_leaves_no_leftover_when_it_fails(monkeypatch, tmp_path):
    target = tmp_path / "mirror" / "settings.json"
    target.parent.mkdir()
    monkeypatch.setattr(storage.os, "replace", lambda *a: (_ for _ in ()).throw(OSError("disk full")))
    storage._atomic_write_wrapped(str(target), {"state": {}, "rev": 1, "updatedAt": 0})
    assert not any(f.endswith(".tmp") for f in os.listdir(target.parent))


def test_export_leftovers_go_only_from_the_export_folder_and_only_when_finished_or_stale(tmp_path):
    folder = tmp_path / "Downloads"
    folder.mkdir()
    _touch(folder / "a.json")
    _touch(folder / "a.json.tmp", time.time() - 120)          # its export finished: goes
    _touch(folder / "b.json.tmp", OLD)                        # stale: goes
    _touch(folder / "c.json.tmp", time.time() - 120)          # unfinished and recent: stays
    _touch(folder / "photo.tmp", OLD)                         # not an export of ours
    other = tmp_path / "Desktop"
    other.mkdir()
    _touch(other / "d.json.tmp", OLD)                         # another folder: never scanned
    storage.sweep_export_tmps(str(folder / "deck-shelves.json"))
    assert sorted(os.listdir(folder)) == ["a.json", "c.json.tmp", "photo.tmp"]
    assert os.listdir(other) == ["d.json.tmp"]


def test_list_backups_tells_how_many_copies_are_quarantined(monkeypatch, tmp_path):
    loader, canonical = _folders(monkeypatch, tmp_path)
    _touch(loader / "backups" / "settings-20240101-000000-corrupt.json")
    _touch(canonical / "backups" / "settings-20240102-000000-corrupt.json")
    out = asyncio.run(Plugin().list_backups())
    assert out["quarantined"] == 2
