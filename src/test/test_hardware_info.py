"""Tests for hardware_info.py — static machine specs, cross-OS, fail-soft and
never raising."""
import hardware_info


def test_real_host_never_raises():
    r = hardware_info.get_hardware_info()
    assert r["supported"] is True
    for key in ("model", "cpu", "cpuCores", "arch", "memTotalBytes",
                "diskTotalBytes", "diskFreeBytes", "gpu", "vendor", "board",
                "externalDisks"):
        assert key in r
    assert isinstance(r["externalDisks"], list)


def test_external_disks_linux_finds_mounted_volumes(tmp_path, monkeypatch):
    monkeypatch.setattr(hardware_info, "_home_dev", lambda: -1)  # never matches
    user_dir = tmp_path / "run_media" / "deck"
    (user_dir / "SD_CARD").mkdir(parents=True)
    (user_dir / "not_a_dir.txt").write_text("x")

    found = hardware_info._external_disks_linux(roots=(str(tmp_path / "run_media"),))

    assert len(found) == 1
    assert found[0]["label"] == "SD_CARD"
    assert isinstance(found[0]["totalBytes"], int)
    assert isinstance(found[0]["freeBytes"], int)


def test_external_disks_linux_excludes_the_home_device(tmp_path, monkeypatch):
    real_home_dev = hardware_info._home_dev()
    monkeypatch.setattr(hardware_info, "_home_dev", lambda: real_home_dev)
    user_dir = tmp_path / "run_media" / "deck"
    # tmp_path is on the same filesystem as home in this test environment,
    # so this mount's st_dev matches home's and must be excluded.
    (user_dir / "SAME_FS").mkdir(parents=True)

    found = hardware_info._external_disks_linux(roots=(str(tmp_path / "run_media"),))

    assert found == []


def test_external_disks_linux_missing_roots_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(hardware_info, "_home_dev", lambda: -1)
    found = hardware_info._external_disks_linux(roots=(str(tmp_path / "does_not_exist"),))
    assert found == []


def test_external_disks_macos_finds_mounted_volumes(tmp_path, monkeypatch):
    monkeypatch.setattr(hardware_info, "_home_dev", lambda: -1)
    (tmp_path / "EXTERNAL_SSD").mkdir()

    found = hardware_info._external_disks_macos(root=str(tmp_path))

    assert len(found) == 1
    assert found[0]["label"] == "EXTERNAL_SSD"


def test_valve_deck_maps_to_friendly_model(monkeypatch):
    fields = {"product_name": "Galileo", "sys_vendor": "Valve", "board_name": "Galileo"}
    monkeypatch.setattr(hardware_info, "_dmi", lambda f: fields.get(f))
    model, product = hardware_info._model()
    assert model == "Steam Deck (OLED)"
    assert product == "Galileo"


def test_lcd_deck_maps_to_lcd(monkeypatch):
    fields = {"product_name": "Jupiter", "sys_vendor": "Valve Software"}
    monkeypatch.setattr(hardware_info, "_dmi", lambda f: fields.get(f))
    model, _ = hardware_info._model()
    assert model == "Steam Deck (LCD)"


def test_non_valve_product_passes_through(monkeypatch):
    fields = {"product_name": "ROG Ally", "sys_vendor": "ASUSTeK"}
    monkeypatch.setattr(hardware_info, "_dmi", lambda f: fields.get(f))
    model, product = hardware_info._model()
    assert model == "ROG Ally" and product == "ROG Ally"


def test_model_falls_back_to_node(monkeypatch):
    monkeypatch.setattr(hardware_info, "_dmi", lambda f: None)
    monkeypatch.setattr(hardware_info.platform, "node", lambda: "some-pc")
    model, product = hardware_info._model()
    assert model == "some-pc" and product is None


def test_mem_total_prefers_linux_then_falls_through(monkeypatch):
    monkeypatch.setattr(hardware_info, "_mem_linux", lambda: 16 * 1024**3)
    monkeypatch.setattr(hardware_info, "_mem_posix", lambda: 1)
    assert hardware_info._mem_total_bytes() == 16 * 1024**3

    monkeypatch.setattr(hardware_info, "_mem_linux", lambda: None)
    monkeypatch.setattr(hardware_info, "_mem_posix", lambda: None)
    monkeypatch.setattr(hardware_info, "_mem_windows", lambda: None)
    assert hardware_info._mem_total_bytes() is None


def test_read_is_fail_soft(monkeypatch):
    assert hardware_info._read("/does/not/exist/deck-shelves") is None
