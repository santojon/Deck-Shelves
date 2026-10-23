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


class _FakeResp:
    def __init__(self, url, chunks):
        self._url, self._chunks = url, list(chunks)

    def geturl(self):
        return self._url

    def read(self, _n):
        return self._chunks.pop(0) if self._chunks else b""

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_download_writes_file_and_leaves_no_part(tmp_path, monkeypatch):
    dest = str(tmp_path / "deck-shelves-v1.zip")
    monkeypatch.setattr(main.urllib.request, "urlopen",
                        lambda req, timeout, context: _FakeResp("https://objects.githubusercontent.com/a.zip", [b"PK", b"zip"]))
    assert main._download_to("https://github.com/x/y/releases/download/v1/a.zip", dest) == dest
    assert open(dest, "rb").read() == b"PKzip"
    assert not (tmp_path / "deck-shelves-v1.zip.part").exists()


def test_download_rejects_redirect_off_release_hosts_and_cleans_up(tmp_path, monkeypatch):
    dest = str(tmp_path / "a.zip")
    monkeypatch.setattr(main.urllib.request, "urlopen",
                        lambda req, timeout, context: _FakeResp("https://evil.example.com/a.zip", [b"x"]))
    try:
        main._download_to("https://github.com/x/y/releases/download/v1/a.zip", dest)
        assert False, "expected a rejection"
    except ValueError:
        pass
    assert not (tmp_path / "a.zip").exists() and not (tmp_path / "a.zip.part").exists()


def test_download_enforces_the_size_cap(tmp_path, monkeypatch):
    dest = str(tmp_path / "a.zip")
    monkeypatch.setattr(main, "_DOWNLOAD_MAX_BYTES", 4)
    monkeypatch.setattr(main.urllib.request, "urlopen",
                        lambda req, timeout, context: _FakeResp("https://github.com/a.zip", [b"123", b"456"]))
    try:
        main._download_to("https://github.com/x/y/releases/download/v1/a.zip", dest)
        assert False, "expected the cap to trip"
    except ValueError:
        pass
    assert not (tmp_path / "a.zip.part").exists()


def test_release_download_url_is_this_project_only():
    assert main._is_release_download_url("https://github.com/santojon/Deck-Shelves/releases/download/v3.4.0/deck-shelves-v3.4.0.zip")
    assert not main._is_release_download_url("https://github.com/someone/else/releases/download/v1/x.zip")
    assert not main._is_release_download_url("https://objects.githubusercontent.com/foo/bar.zip")  # redirect target only
    assert not main._is_release_download_url("http://github.com/santojon/Deck-Shelves/releases/download/v1/x.zip")
