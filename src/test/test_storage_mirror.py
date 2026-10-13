"""
Unit tests for storage.py's canonical-store mirroring (dual-host install data
safety): reconcile_settings (adopt-by-copy + rev-LWW on read) and sync_mirror
(rev-gated propagation on write).

The `decky` module is mocked before importing storage/main, matching
test_main.py's convention.
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


def _write_wrapped(path, state, rev=1, updated_at=1.0):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"state": state, "rev": rev, "updatedAt": updated_at}, f)


def _isolate(monkeypatch, canonical_dir, loader_dir, loader_installed=True):
    """A neutral session on a Linux machine: the canonical var is set, the
    loader's settings dir is known, and — unless told otherwise — a loader is
    installed (its plugins dir plus service binary under DECKY_HOME)."""
    monkeypatch.setenv("DECK_SHELVES_SETTINGS_DIR", str(canonical_dir))
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(loader_dir))
    monkeypatch.setattr(sys, "platform", "linux")
    home = canonical_dir.parent / "homebrew"
    monkeypatch.setenv("DECKY_HOME", str(home))
    if loader_installed:
        (home / "plugins").mkdir(parents=True, exist_ok=True)
        (home / "services").mkdir(parents=True, exist_ok=True)
        (home / "services" / "PluginLoader").write_text("")


# ─── reconcile_settings ─────────────────────────────────────────────────────

def test_reconcile_neither_present_returns_none(tmp_path, monkeypatch):
    _isolate(monkeypatch, tmp_path / "canonical", tmp_path / "loader")
    assert storage.reconcile_settings() is None


def test_reconcile_adopts_loader_into_missing_canonical(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    _write_wrapped(str(loader_dir / "settings.json"), {"enabled": True, "shelves": []}, rev=3)

    result = storage.reconcile_settings()

    assert result["state"]["enabled"] is True
    assert result["rev"] == 3
    # Adopt-by-copy: the loader's own file must survive untouched.
    assert os.path.exists(loader_dir / "settings.json")
    # And canonical gets bootstrapped to match.
    canonical_data = json.loads((canonical_dir / "settings.json").read_text())
    assert canonical_data["state"]["enabled"] is True
    assert canonical_data["rev"] == 3


def test_reconcile_adopts_canonical_into_missing_loader(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    loader_dir.mkdir()  # the installed loader's settings dir holds no copy yet
    _write_wrapped(str(canonical_dir / "settings.json"), {"enabled": True, "shelves": [{"id": "s1"}]}, rev=5)

    result = storage.reconcile_settings()

    assert result["rev"] == 5
    assert os.path.exists(canonical_dir / "settings.json")
    loader_data = json.loads((loader_dir / "settings.json").read_text())
    assert loader_data["rev"] == 5
    assert loader_data["state"]["shelves"] == [{"id": "s1"}]


def test_reconcile_higher_rev_wins_and_syncs_the_other_side(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    _write_wrapped(str(canonical_dir / "settings.json"), {"enabled": True, "note": "old"}, rev=2)
    _write_wrapped(str(loader_dir / "settings.json"), {"enabled": True, "note": "newer"}, rev=7)

    result = storage.reconcile_settings()

    assert result["rev"] == 7
    assert result["state"]["note"] == "newer"
    # The stale canonical side gets refreshed to match the winner.
    canonical_data = json.loads((canonical_dir / "settings.json").read_text())
    assert canonical_data["rev"] == 7
    assert canonical_data["state"]["note"] == "newer"


def test_reconcile_never_deletes_the_losing_side_only_overwrites_it(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    _write_wrapped(str(canonical_dir / "settings.json"), {"enabled": True}, rev=9)
    _write_wrapped(str(loader_dir / "settings.json"), {"enabled": False}, rev=1)

    storage.reconcile_settings()

    # Loser's file still exists (refreshed, never removed) — adopt-by-copy,
    # never a move.
    assert os.path.exists(loader_dir / "settings.json")
    assert os.path.exists(loader_dir / "settings.json.bak")


# ─── sync_mirror ────────────────────────────────────────────────────────────

def test_sync_mirror_noop_when_primary_equals_canonical(tmp_path, monkeypatch):
    # Dev fallback: both env vars point at the same dir.
    monkeypatch.setenv("DECK_SHELVES_SETTINGS_DIR", str(tmp_path))
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path))
    storage.sync_mirror({"enabled": True}, rev=1, updated_at=1.0)
    # No mirror file should appear anywhere else — nothing to assert a path
    # against here beyond "it didn't raise"; the real assertion is that
    # _mirror_paths() collapses to one file, which the other tests confirm.
    canonical, loader = storage._mirror_paths()
    assert canonical == loader


def test_sync_mirror_propagates_to_the_loader_when_primary_is_canonical(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)  # primary == canonical here
    loader_dir.mkdir()
    storage.sync_mirror({"enabled": True, "note": "from-canonical"}, rev=4, updated_at=42.0)

    loader_data = json.loads((loader_dir / "settings.json").read_text())
    assert loader_data["rev"] == 4
    assert loader_data["state"]["note"] == "from-canonical"


def test_sync_mirror_never_clobbers_a_newer_write_on_the_other_side(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    _write_wrapped(str(loader_dir / "settings.json"), {"note": "already-newer"}, rev=10)

    storage.sync_mirror({"note": "stale"}, rev=3, updated_at=1.0)

    loader_data = json.loads((loader_dir / "settings.json").read_text())
    assert loader_data["rev"] == 10
    assert loader_data["state"]["note"] == "already-newer"


# ─── End-to-end via Plugin._write_state / _unload ──────────────────────────

def test_write_state_bumps_rev_and_mirrors_to_canonical(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)  # this session IS the canonical host
    loader_dir.mkdir()

    Plugin()._write_state({"enabled": True, "shelves": []})

    loader_data = json.loads((loader_dir / "settings.json").read_text())
    assert loader_data["rev"] == 1
    assert loader_data["state"]["enabled"] is True

    Plugin()._write_state({"enabled": True, "shelves": [{"id": "s1", "title": "Shelf"}]})
    loader_data2 = json.loads((loader_dir / "settings.json").read_text())
    assert loader_data2["rev"] == 2
    assert loader_data2["state"]["shelves"][0]["id"] == "s1"


def test_unload_exports_current_state_to_the_other_side(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    loader_dir.mkdir()
    Plugin()._write_state({"enabled": True, "shelves": []})
    # Simulate the mirror having failed at write time by wiping the loader
    # copy sync_mirror already produced, then confirm _unload restores it.
    os.remove(loader_dir / "settings.json")

    import asyncio
    asyncio.run(Plugin()._unload())

    assert os.path.exists(loader_dir / "settings.json")
    loader_data = json.loads((loader_dir / "settings.json").read_text())
    assert loader_data["state"]["enabled"] is True


# ─── corrupt copies and steady state ────────────────────────────────────────

def test_reconcile_quarantines_a_corrupt_copy_instead_of_rotating_it_into_bak(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    _write_wrapped(str(canonical_dir / "settings.json"), {"enabled": True, "shelves": []}, rev=4)
    good_bak = {"state": {"enabled": True, "shelves": [{"id": "old"}]}, "rev": 3, "updatedAt": 1.0}
    os.makedirs(loader_dir, exist_ok=True)
    (loader_dir / "settings.json.bak").write_text(json.dumps(good_bak))
    (loader_dir / "settings.json").write_text("{ not json")
    storage.take_reconcile_recovery()

    result = storage.reconcile_settings()

    assert result["rev"] == 4
    assert json.loads((loader_dir / "settings.json").read_text())["rev"] == 4
    # The last known-good `.bak` survives; the broken file is kept aside.
    assert json.loads((loader_dir / "settings.json.bak").read_text()) == good_bak
    quarantined = [f for f in os.listdir(canonical_dir / "backups") if f.endswith("-corrupt.json")]
    assert len(quarantined) == 1
    assert storage.take_reconcile_recovery() is True
    assert storage.take_reconcile_recovery() is False


def test_reconcile_leaves_identical_copies_alone(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    state = {"enabled": True, "shelves": []}
    _write_wrapped(str(canonical_dir / "settings.json"), state, rev=2)
    _write_wrapped(str(loader_dir / "settings.json"), state, rev=2)

    storage.reconcile_settings()

    assert not os.path.exists(loader_dir / "settings.json.bak")
    assert not os.path.exists(canonical_dir / "settings.json.bak")


def test_quarantined_files_are_not_backups():
    assert storage._is_backup_file("settings-20261013-101010-manual.json")
    assert not storage._is_backup_file("settings-20261013-101010-corrupt.json")


# ─── no loader installed (neutral session) ──────────────────────────────────

def test_sync_mirror_never_creates_an_absent_loader_dir(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir, loader_installed=False)  # neutral session, no loader on this machine

    storage.sync_mirror({"enabled": True}, rev=1, updated_at=1.0)

    assert not os.path.exists(loader_dir)


def test_reconcile_never_creates_an_absent_loader_dir(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir, loader_installed=False)
    _write_wrapped(str(canonical_dir / "settings.json"), {"enabled": True, "shelves": []}, rev=3)

    result = storage.reconcile_settings()

    assert result["rev"] == 3
    assert result["state"]["enabled"] is True
    assert not os.path.exists(loader_dir)


def test_unload_never_creates_an_absent_loader_dir(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir, loader_installed=False)
    Plugin()._write_state({"enabled": True, "shelves": []})

    import asyncio
    asyncio.run(Plugin()._unload())

    assert os.path.exists(canonical_dir / "settings.json")
    assert not os.path.exists(loader_dir)


def _loader_session(monkeypatch, canonical_dir, loader_dir):
    """The loader launched this session: only its own env var is set, and the
    canonical location resolves as the per-OS guess would."""
    monkeypatch.delenv("DECK_SHELVES_SETTINGS_DIR", raising=False)
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(loader_dir))
    monkeypatch.setattr(storage, "_canonical_settings_dir", lambda: str(canonical_dir))


def test_loader_session_still_adopts_canonical_into_its_own_missing_dir(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _loader_session(monkeypatch, canonical_dir, loader_dir)
    _write_wrapped(str(canonical_dir / "settings.json"), {"enabled": True, "note": "from-canonical"}, rev=5)

    result = storage.reconcile_settings()

    assert result["rev"] == 5
    loader_data = json.loads((loader_dir / "settings.json").read_text())
    assert loader_data["rev"] == 5
    assert loader_data["state"]["note"] == "from-canonical"


def test_loader_session_still_mirrors_into_a_missing_canonical_dir(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _loader_session(monkeypatch, canonical_dir, loader_dir)

    storage.sync_mirror({"enabled": True, "note": "from-loader"}, rev=2, updated_at=2.0)

    canonical_data = json.loads((canonical_dir / "settings.json").read_text())
    assert canonical_data["rev"] == 2
    assert canonical_data["state"]["note"] == "from-loader"


# ─── what counts as an installed loader ─────────────────────────────────────

def test_sync_mirror_ignores_a_stale_loader_dir_on_macos(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    monkeypatch.setattr(sys, "platform", "darwin")
    loader_dir.mkdir()  # left behind by an earlier backend version

    storage.sync_mirror({"enabled": True}, rev=1, updated_at=1.0)

    assert not os.path.exists(loader_dir / "settings.json")


def test_reconcile_ignores_a_stale_loader_copy_on_macos(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir)
    monkeypatch.setattr(sys, "platform", "darwin")
    _write_wrapped(str(loader_dir / "settings.json"), {"enabled": False, "note": "stale"}, rev=9)
    _write_wrapped(str(canonical_dir / "settings.json"), {"enabled": True}, rev=2)

    result = storage.reconcile_settings()

    assert result["rev"] == 2
    assert json.loads((loader_dir / "settings.json").read_text())["rev"] == 9


def test_a_plugins_dir_alone_is_not_an_installed_loader(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir, loader_installed=False)
    (tmp_path / "homebrew" / "plugins").mkdir(parents=True)  # no service binary, no version marker

    storage.sync_mirror({"enabled": True}, rev=1, updated_at=1.0)

    assert not storage._loader_installed()
    assert not os.path.exists(loader_dir)


def test_the_loader_version_marker_counts_as_installed(tmp_path, monkeypatch):
    canonical_dir, loader_dir = tmp_path / "canonical", tmp_path / "loader"
    _isolate(monkeypatch, canonical_dir, loader_dir, loader_installed=False)
    (tmp_path / "homebrew" / "plugins").mkdir(parents=True)
    (tmp_path / "homebrew" / "services").mkdir()
    (tmp_path / "homebrew" / "services" / ".loader.version").write_text("v3.1.0")

    storage.sync_mirror({"enabled": True, "note": "mirrored"}, rev=1, updated_at=1.0)

    assert storage._loader_installed()
    assert json.loads((loader_dir / "settings.json").read_text())["state"]["note"] == "mirrored"
