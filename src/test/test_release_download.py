"""Tests for the manual-update download helpers in main.py — the URL allowlist
and the filename sanitiser that together keep `download_release` from fetching
an arbitrary host or writing outside the download dir."""
import asyncio
import hashlib
import sys
import types as pytypes

decky_mock = pytypes.ModuleType("decky")
decky_mock.logger = pytypes.SimpleNamespace(
    error=lambda *a, **kw: None, info=lambda *a, **kw: None, warning=lambda *a, **kw: None)
decky_mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/test-deck-shelves-settings"
sys.modules["decky"] = decky_mock

import main  # noqa: E402

_URL = "https://github.com/x/y/releases/download/v1/a.zip"


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def test_github_asset_url_allowed():
    assert main._is_github_asset_url("https://github.com/santojon/Deck-Shelves/releases/download/v3.1.0/deck-shelves-v3.1.0.zip")
    assert main._is_github_asset_url("https://objects.githubusercontent.com/foo/bar.zip")
    assert main._is_github_asset_url("https://release-assets.githubusercontent.com/foo.zip")


def test_non_github_or_insecure_url_rejected():
    assert not main._is_github_asset_url("http://github.com/x.zip")
    assert not main._is_github_asset_url("https://evil.example.com/x.zip")
    assert not main._is_github_asset_url("https://github.com.evil.com/x.zip")
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
    assert main._download_to(_URL, dest, "sha256:" + _sha(b"PKzip")) == dest
    assert open(dest, "rb").read() == b"PKzip"
    assert not (tmp_path / "deck-shelves-v1.zip.part").exists()


def test_download_rejects_redirect_off_release_hosts_and_cleans_up(tmp_path, monkeypatch):
    dest = str(tmp_path / "a.zip")
    monkeypatch.setattr(main.urllib.request, "urlopen",
                        lambda req, timeout, context: _FakeResp("https://evil.example.com/a.zip", [b"x"]))
    try:
        main._download_to(_URL, dest, _sha(b"x"))
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
        main._download_to(_URL, dest, _sha(b"123456"))
        assert False, "expected the cap to trip"
    except ValueError:
        pass
    assert not (tmp_path / "a.zip.part").exists()


def test_release_download_url_is_this_project_only():
    assert main._is_release_download_url("https://github.com/santojon/Deck-Shelves/releases/download/v3.4.0/deck-shelves-v3.4.0.zip")
    assert not main._is_release_download_url("https://github.com/someone/else/releases/download/v1/x.zip")
    assert not main._is_release_download_url("https://objects.githubusercontent.com/foo/bar.zip")
    assert not main._is_release_download_url("http://github.com/santojon/Deck-Shelves/releases/download/v1/x.zip")


def _serve(monkeypatch, chunks):
    monkeypatch.setattr(main.urllib.request, "urlopen",
                        lambda req, timeout, context: _FakeResp("https://objects.githubusercontent.com/a.zip", chunks))


def test_download_hashes_every_chunk_of_a_multi_chunk_body(tmp_path, monkeypatch):
    chunks = [bytes([i]) * 65536 for i in range(5)] + [b"tail"]
    body = b"".join(chunks)
    _serve(monkeypatch, chunks)
    dest = str(tmp_path / "a.zip")
    assert main._download_to(_URL, dest, "SHA256:" + _sha(body).upper()) == dest
    assert open(dest, "rb").read() == body


def test_digest_mismatch_deletes_the_temp_file_and_saves_nothing(tmp_path, monkeypatch):
    _serve(monkeypatch, [b"PK", b"tampered"])
    dest = str(tmp_path / "a.zip")
    try:
        main._download_to(_URL, dest, "sha256:" + _sha(b"PKzip"))
        assert False, "expected a digest mismatch"
    except main.DigestError as e:
        assert str(e) == "digest_mismatch"
    assert list(tmp_path.iterdir()) == []


def test_missing_invalid_or_other_algorithm_digest_fails_before_any_request(tmp_path, monkeypatch):
    def no_network(*a, **kw):
        raise AssertionError("must not download without a valid digest")
    monkeypatch.setattr(main.urllib.request, "urlopen", no_network)
    cases = {None: "digest_missing", "": "digest_missing", "  ": "digest_missing",
             "sha256:abc": "digest_invalid", "sha256:" + "g" * 64: "digest_invalid",
             "sha512:" + "a" * 128: "digest_unsupported", "md5:" + "a" * 32: "digest_unsupported",
             "sha1:" + "a" * 64: "digest_unsupported"}
    for digest, code in cases.items():
        try:
            main._download_to(_URL, str(tmp_path / "a.zip"), digest)
            assert False, f"expected {code} for {digest!r}"
        except main.DigestError as e:
            assert str(e) == code
    assert list(tmp_path.iterdir()) == []


def test_download_release_refuses_without_a_digest(tmp_path, monkeypatch):
    def no_network(*a, **kw):
        raise AssertionError("must not download without a digest")
    monkeypatch.setattr(main.urllib.request, "urlopen", no_network)
    p = main.Plugin()
    url = "https://github.com/santojon/Deck-Shelves/releases/download/v9.9.9/deck-shelves.zip"
    assert asyncio.run(p.download_release({"url": url, "filename": "deck-shelves.zip"})) == {"ok": False, "error": "digest_missing"}
    assert asyncio.run(p.download_release(url, "deck-shelves.zip")) == {"ok": False, "error": "digest_missing"}
    res = asyncio.run(p.download_release({"url": url, "filename": "deck-shelves.zip", "sha256": "sha512:" + "a" * 128}))
    assert res == {"ok": False, "error": "digest_unsupported"}


def test_download_release_saves_only_a_matching_body(tmp_path, monkeypatch):
    p = main.Plugin()

    async def desktop():
        return str(tmp_path)
    monkeypatch.setattr(p, "get_user_desktop", desktop)
    url = "https://github.com/santojon/Deck-Shelves/releases/download/v9.9.9/deck-shelves.zip"
    _serve(monkeypatch, [b"PK", b"zip"])
    ok = asyncio.run(p.download_release({"url": url, "filename": "deck-shelves.zip", "sha256": "sha256:" + _sha(b"PKzip")}))
    assert ok == {"ok": True, "path": str(tmp_path / "deck-shelves.zip")}
    (tmp_path / "deck-shelves.zip").unlink()
    _serve(monkeypatch, [b"PK", b"zap"])
    bad = asyncio.run(p.download_release({"url": url, "filename": "deck-shelves.zip", "sha256": "sha256:" + _sha(b"PKzip")}))
    assert bad == {"ok": False, "error": "digest_mismatch"}
    assert list(tmp_path.iterdir()) == []
