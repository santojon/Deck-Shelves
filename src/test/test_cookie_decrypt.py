"""Tests for the OS-dispatched Chromium cookie decryption in main.py — verifies
each platform branch and that everything is fail-soft (never raises, returns ''
so callers fall back to the public/unauthenticated path)."""
import sys
import types as pytypes

decky_mock = pytypes.ModuleType("decky")
decky_mock.logger = pytypes.SimpleNamespace(
    error=lambda *a, **kw: None, info=lambda *a, **kw: None, warning=lambda *a, **kw: None)
decky_mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/test-deck-shelves-settings"
sys.modules["decky"] = decky_mock

import main  # noqa: E402

plugin = main.Plugin()


def test_non_v10_value_passthrough():
    assert plugin._decrypt_chromium_cookie(b"plain-value") == "plain-value"
    assert plugin._decrypt_chromium_cookie(b"") == ""


def test_windows_gcm_dispatch(monkeypatch):
    monkeypatch.setattr(main.sys, "platform", "win32")
    # v10 + nonce(12) + ciphertext(10) + tag(16) — a valid Windows structure.
    ev = b"v10" + b"N" * 12 + b"C" * 10 + b"T" * 16
    # No DPAPI key available → '' (public fallback), no crypto attempted.
    monkeypatch.setattr(main.Plugin, "_windows_aes_key", staticmethod(lambda: b""))
    assert plugin._decrypt_chromium_cookie(ev) == ""
    # Key present → GCM path is invoked with the parsed nonce/ct/tag.
    seen = {}
    def fake_gcm(key, nonce, ct, tag):
        seen.update(key=key, nonce=nonce, ct=ct, tag=tag)
        return b"WIN_DECRYPTED"
    monkeypatch.setattr(main.Plugin, "_windows_aes_key", staticmethod(lambda: b"k" * 32))
    monkeypatch.setattr(main.Plugin, "_bcrypt_aes_gcm_decrypt", staticmethod(fake_gcm))
    assert plugin._decrypt_chromium_cookie(ev) == "WIN_DECRYPTED"
    assert seen["nonce"] == b"N" * 12 and seen["ct"] == b"C" * 10 and seen["tag"] == b"T" * 16


def test_windows_short_value_is_safe(monkeypatch):
    monkeypatch.setattr(main.sys, "platform", "win32")
    assert plugin._decrypt_chromium_cookie(b"v10tooShort") == ""  # < nonce+tag → ''


def test_linux_uses_cbc_with_peanuts_key(monkeypatch):
    monkeypatch.setattr(main.sys, "platform", "linux")
    seen = {}
    def fake_cbc(key, body):
        seen["key"], seen["body"] = key, body
        return "LINUX_DECRYPTED"
    monkeypatch.setattr(main.Plugin, "_aes_128_cbc", staticmethod(fake_cbc))
    assert plugin._decrypt_chromium_cookie(b"v10cipher") == "LINUX_DECRYPTED"
    assert seen["body"] == b"cipher"  # v10 prefix stripped


def test_macos_uses_keychain_key_or_falls_back(monkeypatch):
    monkeypatch.setattr(main.sys, "platform", "darwin")
    monkeypatch.setattr(main.Plugin, "_macos_safe_storage_password", staticmethod(lambda: None))
    assert plugin._decrypt_chromium_cookie(b"v10cipher") == ""  # no keychain → public path
    monkeypatch.setattr(main.Plugin, "_macos_safe_storage_password", staticmethod(lambda: b"pw"))
    monkeypatch.setattr(main.Plugin, "_aes_128_cbc", staticmethod(lambda k, b: "MAC_DECRYPTED"))
    assert plugin._decrypt_chromium_cookie(b"v10cipher") == "MAC_DECRYPTED"


def test_redact_secrets_strips_tokens():
    # An error that stringified the request URL must not leak the token.
    leaked = "<urlopen error https://api.steampowered.com/x?cc=us&access_token=eyJABC.def-GHI>"
    out = main._redact_secrets(leaked)
    assert "eyJABC.def-GHI" not in out
    assert "access_token=REDACTED" in out
    # Non-secret text is untouched.
    assert main._redact_secrets("HTTP 500 timeout") == "HTTP 500 timeout"


def test_decrypt_is_fail_soft(monkeypatch):
    monkeypatch.setattr(main.sys, "platform", "linux")
    def boom(key, body):
        raise RuntimeError("openssl exploded")
    monkeypatch.setattr(main.Plugin, "_aes_128_cbc", staticmethod(boom))
    # An exception inside must not propagate — cookie read stays fail-soft.
    assert plugin._decrypt_chromium_cookie(b"v10cipher") == ""
