"""Tests for peripherals.py — bluetoothctl device parsing + wpctl headphone
detection (pure parsers; the subprocess layer is fail-soft and platform-gated)."""
import peripherals

_WPCTL_HDMI = """Audio
 ├─ Sinks:
 │      60. ACP Speaker [vol: 0.00 MUTED]
 │      61. ACP Headphones [vol: 1.00]
 │  *   90. Rembrandt Digital Stereo (HDMI 3) [vol: 0.61]
 ├─ Sources:
 │      62. Internal Microphone
"""

_WPCTL_HEADPHONES = """Audio
 ├─ Sinks:
 │      60. ACP Speaker [vol: 0.00 MUTED]
 │  *   61. ACP Headphones [vol: 1.00]
 │      90. Rembrandt Digital Stereo (HDMI 3) [vol: 0.61]
 ├─ Sources:
"""


def test_default_sink_headphones_detection():
    assert peripherals._default_sink_is_headphones(_WPCTL_HDMI) is False
    assert peripherals._default_sink_is_headphones(_WPCTL_HEADPHONES) is True
    assert peripherals._default_sink_is_headphones("") is False


def test_parse_bluetooth_devices():
    text = "Device AA:BB:CC:DD:EE:FF WH-1000XM4\nDevice 11:22:33:44:55:66 Keyboard K380\ngarbage line\n"
    out = peripherals._parse_devices(text)
    assert out == [
        {"mac": "AA:BB:CC:DD:EE:FF", "name": "WH-1000XM4"},
        {"mac": "11:22:33:44:55:66", "name": "Keyboard K380"},
    ]


def test_parse_bluetooth_empty():
    assert peripherals._parse_devices("") == []
