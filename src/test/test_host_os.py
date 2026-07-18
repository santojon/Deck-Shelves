"""Tests for host_os.py — cross-OS host identity (SteamOS / Linux / Windows /
macOS), fail-soft and never raising."""
import platform

import host_os


def test_real_host_never_raises():
    r = host_os.get_host_os()
    assert r["supported"] is True
    assert r["name"] and r["system"]


def test_steamos_from_os_release(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Linux")
    monkeypatch.setattr(platform, "machine", lambda: "x86_64")
    monkeypatch.setattr(host_os, "_os_release", lambda: {
        "ID": "steamos", "PRETTY_NAME": "SteamOS 3.5.7", "VERSION_ID": "3.5.7"})
    r = host_os.get_host_os()
    assert r["name"] == "SteamOS"
    assert r["isSteamOS"] is True
    assert r["distroId"] == "steamos"
    assert r["version"] == "3.5.7"


def test_bazzite_is_linux_not_steamos(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Linux")
    monkeypatch.setattr(host_os, "_os_release", lambda: {
        "ID": "bazzite", "ID_LIKE": "fedora", "PRETTY_NAME": "Bazzite", "VERSION_ID": "40"})
    r = host_os.get_host_os()
    assert r["name"] == "Linux"
    assert r["isSteamOS"] is False
    assert r["distroId"] == "bazzite"


def test_windows(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Windows")
    monkeypatch.setattr(platform, "win32_ver", lambda: ("11", "10.0.22631", "", ""))
    r = host_os.get_host_os()
    assert r["name"] == "Windows"
    assert r["isSteamOS"] is False
    assert r["version"] == "11"


def test_macos(monkeypatch):
    monkeypatch.setattr(platform, "system", lambda: "Darwin")
    monkeypatch.setattr(platform, "mac_ver", lambda: ("14.5", ("", "", ""), "arm64"))
    r = host_os.get_host_os()
    assert r["name"] == "macOS"
    assert r["version"] == "14.5"
    assert r["isSteamOS"] is False
