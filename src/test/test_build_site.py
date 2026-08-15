"""Tests for scripts/site/build_site.py's download-link injection.

Regression coverage for a bug where the "Download latest release" buttons on
the public site got stuck on the first version the script ever ran against:
`_inject_download` did a one-shot string `.replace()` on a marker href that
only exists pre-injection, so every run after the first silently found
nothing to replace and left the stale link in place.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "site"))
import build_site  # noqa: E402

REPO = build_site.REPO


def _button(href, extra=""):
    return f'<a class="btn btn-primary" href="{href}"{extra}>Download latest release</a>'


def test_inject_download_replaces_the_pristine_marker():
    page = _button(f"{REPO}/releases/latest")
    out = build_site._inject_download(page, "3.2.0")
    assert f'href="{REPO}/releases/latest/download/deck-shelves-v3.2.0.zip" download' in out


def test_inject_download_is_re_runnable_across_versions():
    # This is the exact regression: run once for an old version, then again
    # for a newer one — the second run must not be a no-op.
    page = _button(f"{REPO}/releases/latest")
    once = build_site._inject_download(page, "3.0.0")
    assert "deck-shelves-v3.0.0.zip" in once
    twice = build_site._inject_download(once, "3.2.1")
    assert "deck-shelves-v3.2.1.zip" in twice
    assert "deck-shelves-v3.0.0.zip" not in twice


def test_inject_download_does_not_duplicate_the_download_attribute():
    page = _button(f"{REPO}/releases/latest/download/deck-shelves-v3.1.0.zip", " download")
    out = build_site._inject_download(page, "3.2.0")
    assert out.count(" download") == 1


def test_inject_download_leaves_unrelated_release_links_alone():
    page = f'<a href="{REPO}/releases">Older releases</a>'
    out = build_site._inject_download(page, "3.2.0")
    assert out == page


def test_inject_download_handles_multiple_buttons_on_one_page():
    page = "\n".join([_button(f"{REPO}/releases/latest") for _ in range(4)])
    out = build_site._inject_download(page, "3.2.1")
    assert out.count("deck-shelves-v3.2.1.zip") == 4
