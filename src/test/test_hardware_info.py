"""Tests for hardware_info.py — static machine specs, cross-OS, fail-soft and
never raising."""
import hardware_info


def test_real_host_never_raises():
    r = hardware_info.get_hardware_info()
    assert r["supported"] is True
    for key in ("model", "cpu", "cpuCores", "arch", "memTotalBytes",
                "diskTotalBytes", "diskFreeBytes", "gpu", "vendor", "board"):
        assert key in r


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
