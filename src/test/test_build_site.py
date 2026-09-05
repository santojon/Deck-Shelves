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


def _stats_row():
    return (
        '<div class="stats-row" data-stats-row style="display:none">'
        '<a class="stat-chip" href="https://decky.xyz"><b data-stat="installs">—</b> Decky Store installs</a>'
        '<a class="stat-chip" href="https://github.com/santojon/Deck-Shelves/releases"><b data-stat="downloads">—</b> GitHub downloads</a>'
        '<a class="stat-chip" href="https://github.com/santojon/Deck-Shelves"><b data-stat="views">—</b> views (14d)</a>'
        '<a class="stat-chip" href="https://www.npmjs.com/package/@deck-shelves/api"><b data-stat="npm">—</b> npm downloads</a>'
        '</div>'
    )


def test_stats_values_covers_every_source():
    values = build_site._stats_values({
        "deckyStoreInstalls": 12173,
        "githubDownloads": 2692,
        "traffic": {"main": {"views": 453}},
        "npm": {"api": 230, "host": 210},
    })
    assert values == {"installs": "12,173", "downloads": "2,692", "views": "453", "npm": "440"}


def test_stats_values_omits_missing_sources_instead_of_a_placeholder():
    # A source that failed this run (e.g. traffic, needing a broader CI
    # token for the sibling repos) is simply absent, not zeroed out.
    assert build_site._stats_values({"deckyStoreInstalls": 100}) == {"installs": "100"}


def test_inject_stats_row_fills_chips_and_reveals_the_row():
    out = build_site._inject_stats_row(_stats_row(), {
        "date": "2026-09-01", "deckyStoreInstalls": 12173, "githubDownloads": 2692,
        "traffic": {"main": {"views": 453}}, "npm": {"api": 230, "host": 210},
    })
    assert '<b data-stat="installs">12,173</b>' in out
    assert '<b data-stat="downloads">2,692</b>' in out
    assert 'style="display:none"' not in out
    assert 'title="Last snapshot: 2026-09-01"' in out


def test_inject_stats_row_keeps_the_dash_for_a_missing_source():
    out = build_site._inject_stats_row(_stats_row(), {"deckyStoreInstalls": 100})
    assert '<b data-stat="installs">100</b>' in out
    assert '<b data-stat="views">—</b>' in out


def test_inject_stats_row_is_re_runnable_across_snapshots():
    once = build_site._inject_stats_row(_stats_row(), {"date": "2026-09-01", "deckyStoreInstalls": 100})
    twice = build_site._inject_stats_row(once, {"date": "2026-09-08", "deckyStoreInstalls": 200})
    assert '<b data-stat="installs">200</b>' in twice
    assert "100" not in twice
    # The date tooltip must also update on a re-run, not just the numbers —
    # a plain string .replace() on the pre-injection row tag would stop
    # matching after the first run (the same bug _inject_download guards
    # against), silently freezing the tooltip on the first snapshot forever.
    assert 'title="Last snapshot: 2026-09-08"' in twice
    assert "2026-09-01" not in twice


def test_inject_stats_row_returns_none_without_a_snapshot():
    # No history.json yet (fetch_stats.py hasn't run) — keep the row hidden.
    assert build_site._inject_stats_row(_stats_row(), None) is None
