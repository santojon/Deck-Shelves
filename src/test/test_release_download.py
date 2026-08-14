"""Tests for the manual-update download helpers in main.py — the URL allowlist
and the filename sanitiser that together keep `download_release` from fetching
an arbitrary host or writing outside the download dir."""
import sys
import types as pytypes

decky_mock = pytypes.ModuleType("decky")
decky_mock.logger = pytypes.SimpleNamespace(
    error=lambda *a, **kw: None, info=lambda *a, **kw: None, warning=lambda *a, **kw: None)
decky_mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/test-deck-shelves-settings"
sys.modules["decky"] = decky_mock

import main  # noqa: E402


def test_github_asset_url_allowed():
    assert main._is_github_asset_url("https://github.com/santojon/Deck-Shelves/releases/download/v3.1.0/deck-shelves-v3.1.0.zip")
    assert main._is_github_asset_url("https://objects.githubusercontent.com/foo/bar.zip")
    assert main._is_github_asset_url("https://release-assets.githubusercontent.com/foo.zip")


def test_non_github_or_insecure_url_rejected():
    assert not main._is_github_asset_url("http://github.com/x.zip")          # not https
    assert not main._is_github_asset_url("https://evil.example.com/x.zip")   # wrong host
    assert not main._is_github_asset_url("https://github.com.evil.com/x.zip")  # suffix trick
    assert not main._is_github_asset_url("")
    assert not main._is_github_asset_url("file:///etc/passwd")


def test_safe_zip_name_strips_traversal_and_requires_zip():
    assert main._safe_zip_name("deck-shelves-v3.1.0.zip") == "deck-shelves-v3.1.0.zip"
    assert main._safe_zip_name("../../etc/evil.zip") == "evil.zip"
    assert main._safe_zip_name("/abs/path/pkg.zip") == "pkg.zip"
    assert main._safe_zip_name("no-extension") == ""
    assert main._safe_zip_name("run.sh") == ""
    assert main._safe_zip_name("") == ""
