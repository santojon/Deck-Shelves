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
    monkeypatch.setattr(plugin, "_get_steam_id64", lambda requested=None: str(76561197960265728 + int(account)))
    assert plugin._get_shortcut_tags_sync() == {"ok": True, "tags": {"9": ["GOG"]}}
    monkeypatch.setattr(plugin, "_get_steam_id64", lambda requested=None: None)
    assert plugin._get_shortcut_tags_sync()["ok"] is False


def test_rpc_takes_the_account_the_client_reports_over_the_newest_folder(tmp_path, monkeypatch):
    import main
    for account, appid in (("151436628", 9), ("222", 7)):
        cfg = tmp_path / "userdata" / account / "config"
        cfg.mkdir(parents=True)
        (cfg / "shortcuts.vdf").write_bytes(_shortcuts(_i("appid", appid) + _map("tags", _s("0", account))))
    monkeypatch.setattr(main, "_steam_install_candidates", lambda: [str(tmp_path)])
    plugin = main.Plugin()
    requested = main._requested_steam_id64({"steamid": str(76561197960265728 + 151436628)})
    assert plugin._get_shortcut_tags_sync(requested) == {"ok": True, "tags": {"9": ["151436628"]}}


def test_only_an_individual_account_id_is_taken_from_the_frontend():
    import main
    assert main._requested_steam_id64({"steamid": "76561198000000042"}) == "76561198000000042"
    for bad in ("76561197960265728", "76561190000000000", "7656119800000004", "765611980000000420",
                "76561198000000042/../x", " 76561198000000042", 76561198000000042, None):
        assert main._requested_steam_id64({"steamid": bad}) is None
    assert main._requested_steam_id64("76561198000000042") is None
    assert main._requested_steam_id64(None) is None


def test_wishlist_asks_for_the_account_the_client_reports(monkeypatch):
    import asyncio
    import main
    seen = []
    monkeypatch.setattr(main, "_fetch_json_page", lambda req: (seen.append(req.full_url), (200, {"response": {"items": [{"appid": 10}]}}))[1])
    plugin = main.Plugin()
    monkeypatch.setattr(plugin, "_get_steam_id64", lambda requested=None: requested or "76561198000000001")
    result = asyncio.run(plugin.get_wishlist({"community_url": "", "steamid": "76561198000000042"}))
    assert result["ok"] is True and result["ids"] == [10]
    assert "steamid=76561198000000042" in seen[0]
    asyncio.run(plugin.get_wishlist({"community_url": "", "steamid": "x"}))
    assert "steamid=76561198000000001" in seen[1]
