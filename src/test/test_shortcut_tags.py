import struct

import pytest

from shortcuts import parse_binary_vdf, shortcut_tags


def _s(key, value):
    return b"\x01" + key.encode() + b"\x00" + value.encode() + b"\x00"


def _i(key, value):
    return b"\x02" + key.encode() + b"\x00" + struct.pack("<i", value)


def _map(key, body):
    return b"\x00" + key.encode() + b"\x00" + body + b"\x08"


def _shortcuts(*entries):
    body = b"".join(_map(str(n), e) for n, e in enumerate(entries))
    return _map("shortcuts", body) + b"\x08"


def test_reads_tags_per_shortcut_with_unsigned_appids(tmp_path):
    data = _shortcuts(
        _i("appid", -1234567890) + _s("AppName", "Emu game") + _map("tags", _s("0", "Nintendo") + _s("1", "RPG")),
        _i("appid", 42) + _s("AppName", "No tags") + _map("tags", b""),
    )
    path = tmp_path / "shortcuts.vdf"
    path.write_bytes(data)
    assert shortcut_tags(str(path)) == {str(-1234567890 & 0xFFFFFFFF): ["Nintendo", "RPG"]}


def test_key_case_does_not_matter(tmp_path):
    data = _shortcuts(_i("AppID", 7) + _map("Tags", _s("0", "Epic")))
    path = tmp_path / "shortcuts.vdf"
    path.write_bytes(data)
    assert shortcut_tags(str(path)) == {"7": ["Epic"]}


def test_unknown_type_is_refused():
    with pytest.raises(ValueError):
        parse_binary_vdf(b"\x05key\x00\x00\x00\x00\x00\x08")


def test_oversized_file_yields_nothing(tmp_path, monkeypatch):
    import shortcuts
    monkeypatch.setattr(shortcuts, "_MAX_FILE_BYTES", 8)
    path = tmp_path / "shortcuts.vdf"
    path.write_bytes(_shortcuts(_i("appid", 7) + _map("tags", _s("0", "Epic"))))
    assert shortcut_tags(str(path)) == {}


def test_rpc_reads_the_logged_in_accounts_file(tmp_path, monkeypatch):
    import main
    account = "151436628"
    cfg = tmp_path / "userdata" / account / "config"
    cfg.mkdir(parents=True)
    (cfg / "shortcuts.vdf").write_bytes(_shortcuts(_i("appid", 9) + _map("tags", _s("0", "GOG"))))
    monkeypatch.setattr(main, "_steam_install_candidates", lambda: [str(tmp_path)])
    plugin = main.Plugin()
    monkeypatch.setattr(plugin, "_get_steam_id64", lambda: str(76561197960265728 + int(account)))
    assert plugin._get_shortcut_tags_sync() == {"ok": True, "tags": {"9": ["GOG"]}}
    monkeypatch.setattr(plugin, "_get_steam_id64", lambda: None)
    assert plugin._get_shortcut_tags_sync()["ok"] is False
