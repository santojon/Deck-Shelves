"""Settings per Steam account in the backend: the sanitizer keeps them (past the
unknown-field size cap) and checks their shape, and a full export never carries them.
The salt behind the account keys is kept beside the settings file, never inside it."""
import asyncio
import json
import os
import sys
import types as pytypes

decky_mock = pytypes.ModuleType("decky")
decky_mock.logger = pytypes.SimpleNamespace(error=lambda *a, **kw: None, info=lambda *a, **kw: None, warning=lambda *a, **kw: None)
decky_mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/test-deck-shelves-settings"
sys.modules.setdefault("decky", decky_mock)

import sanitizer  # noqa: E402
import storage  # noqa: E402
from main import Plugin  # noqa: E402

A = "aaaaaaaaaaaaaaaa"
B = "bbbbbbbbbbbbbbbb"


def test_kept_with_its_shape_checked():
    big = [{"id": f"s{i}", "title": "x" * 200} for i in range(400)]  # far past the 64 KiB unknown-field cap
    out = sanitizer._sanitize_settings({"enabled": True, "accountSettings": {
        "owner": A, "mode": "shared",
        "buckets": {B: {"shelves": big, "theme": "dark"}, "legacy": {"profiles": []}, "76561198000000001": {"shelves": []}, "../x": {}},
    }})
    acc = out["accountSettings"]
    assert acc["owner"] == A and acc["mode"] == "shared"
    assert set(acc["buckets"]) == {B, "legacy"}          # an account id or a path is never a key
    assert len(acc["buckets"][B]["shelves"]) == 400      # nothing dropped by the size cap
    assert "theme" not in acc["buckets"][B]              # only an account's own fields


def test_bad_values_are_dropped():
    assert sanitizer._sanitize_settings({"accountSettings": "nope"})["accountSettings"] is None
    out = sanitizer._sanitize_settings({"accountSettings": {"owner": "76561198000000001", "mode": "weird"}})
    assert out["accountSettings"] == {}


def test_full_export_leaves_other_accounts_out(monkeypatch, tmp_path):
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path))
    monkeypatch.setenv("DECK_SHELVES_SETTINGS_DIR", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))
    p = Plugin()
    p._write_state({"enabled": True, "shelves": [], "accountSettings": {"owner": A, "buckets": {B: {"shelves": []}}}})
    dest = os.path.join(str(tmp_path), "Downloads", "deck-shelves.json")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    monkeypatch.setattr("main._json_export_roots", lambda: [os.path.join(str(tmp_path), "Downloads")])
    assert asyncio.run(p.export_settings({"dest_path": dest})) is True
    with open(dest, encoding="utf-8") as f:
        assert "accountSettings" not in json.load(f)["state"]


SALT = "0123456789abcdef" * 2
OTHER = "fedcba9876543210" * 2


def _one_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(tmp_path))
    monkeypatch.setenv("DECK_SHELVES_SETTINGS_DIR", str(tmp_path))
    monkeypatch.setenv("HOME", str(tmp_path))
    return str(tmp_path)


def test_salt_first_kept_stays(monkeypatch, tmp_path):
    d = _one_dir(monkeypatch, tmp_path)
    assert storage.keep_account_salt("nope") == ""                 # only a 32-hex salt is kept
    assert not os.path.exists(os.path.join(d, storage.ACCOUNT_FILE))
    assert storage.keep_account_salt(SALT) == SALT
    assert storage.keep_account_salt(OTHER) == SALT                # never replaced
    with open(os.path.join(d, storage.ACCOUNT_FILE), encoding="utf-8") as f:
        assert json.load(f) == {"salt": SALT}


def test_salt_unreadable_file_takes_the_offered_one(monkeypatch, tmp_path):
    d = _one_dir(monkeypatch, tmp_path)
    with open(os.path.join(d, storage.ACCOUNT_FILE), "w", encoding="utf-8") as f:
        f.write("{broken")
    assert storage.keep_account_salt(OTHER) == OTHER
    assert storage._read_salt(d) == OTHER


def test_salt_found_in_the_other_settings_folder(monkeypatch, tmp_path):
    canonical, loader = tmp_path / "canonical", tmp_path / "loader"
    canonical.mkdir()
    loader.mkdir()
    monkeypatch.setenv("DECK_SHELVES_SETTINGS_DIR", str(canonical))
    monkeypatch.setenv("DECKY_PLUGIN_SETTINGS_DIR", str(loader))
    storage._write_salt(str(loader), SALT)
    assert storage.keep_account_salt(OTHER) == SALT
    assert storage._read_salt(str(canonical)) == SALT              # copied where it was missing


def test_salt_never_in_settings_snapshots_or_export(monkeypatch, tmp_path):
    d = _one_dir(monkeypatch, tmp_path)
    p = Plugin()
    assert asyncio.run(p.keep_account_salt({"salt": SALT})) == {"salt": SALT}
    p._write_state({"enabled": True, "shelves": []})
    p._write_state({"enabled": True, "shelves": [{"id": "a", "title": "A"}]})
    assert asyncio.run(p.create_backup())["ok"] is True
    downloads = os.path.join(d, "Downloads")
    os.makedirs(downloads, exist_ok=True)
    monkeypatch.setattr("main._json_export_roots", lambda: [downloads])
    assert asyncio.run(p.export_settings({"dest_path": os.path.join(downloads, "deck-shelves.json")})) is True
    asyncio.run(p.reset_settings())
    for root, _dirs, files in os.walk(d):
        for name in files:
            if name == storage.ACCOUNT_FILE:
                continue
            with open(os.path.join(root, name), encoding="utf-8") as f:
                assert SALT not in f.read(), name
    assert storage._read_salt(d) == SALT                            # a reset keeps it
