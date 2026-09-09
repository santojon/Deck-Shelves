#!/usr/bin/env python3
"""Build the Deck Shelves project site from the repo's own sources.

Keeps the landing page in sync with the project without hand-editing HTML:

  * Injects the latest released version, date and highlights (parsed from
    RELEASE_NOTES.md) into the "What's New" block of site/index.html.
  * Generates site/features.html from the README "Features" section, so the
    "Explore all features" link always mirrors the current feature list.
  * Copies the validation reports into site/reports/ so the footer links
    resolve both in local preview and on the published Pages site.

Safe to run repeatedly and never hard-fails: parsing problems are reported
as warnings and leave the existing committed content untouched.

Usage: python3 scripts/site/build_site.py [--root .]
"""
from __future__ import annotations

import html
import json
import os
import re
import shutil
import sys
from pathlib import Path

# Reuse the exact shared footer from the report generator so every page
# (landing, features, reports) renders an identical footer.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ci"))
from report_shared import _site_footer  # type: ignore[import-not-found]  # noqa: E402

_MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

MAX_RELEASE_ITEMS = 4


def _root() -> Path:
    if "--root" in sys.argv:
        return Path(sys.argv[sys.argv.index("--root") + 1]).resolve()
    return Path(__file__).resolve().parents[2]


def _md_inline(text: str) -> str:
    """Convert a small subset of Markdown (bold, code, links) to HTML."""
    s = html.escape(text.strip(), quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"`([^`]+?)`", r"<code>\1</code>", s)
    s = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', s)
    return s


def _fmt_date(iso: str) -> str:
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", iso)
    if not m:
        return iso
    y, mo, d = int(m[1]), int(m[2]), int(m[3])
    if 1 <= mo <= 12:
        return f"{_MONTHS[mo - 1]} {d}, {y}"
    return iso


# ── Release notes ────────────────────────────────────────────────────────────

def _parse_release(root: Path):
    """Return (version, iso_date, [(title, desc), ...]) for the latest release."""
    notes = root / "RELEASE_NOTES.md"
    if not notes.is_file():
        return None
    text = notes.read_text(encoding="utf-8")

    m = re.search(r"^##\s*\[(\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})",
                  text, re.MULTILINE)
    if not m:
        return None
    version, iso = m.group(1), m.group(2)

    # Body of this release: from the header to the next "## [" heading.
    body = text[m.end():]
    nxt = re.search(r"^##\s*\[", body, re.MULTILINE)
    if nxt:
        body = body[:nxt.start()]

    items = []
    for line in body.splitlines():
        bullet = re.match(r"-\s+\*\*(.+?)\*\*(.*)", line.strip())
        if not bullet:
            continue
        title = bullet.group(1).strip().rstrip(".")
        rest = bullet.group(2).strip()
        # First sentence or a trimmed lead-in keeps the card compact.
        sentence = re.split(r"(?<=[.!?])\s", rest, maxsplit=1)[0] if rest else ""
        if len(sentence) > 210:
            sentence = sentence[:207].rsplit(" ", 1)[0] + "…"
        items.append((title, sentence))
        if len(items) >= MAX_RELEASE_ITEMS:
            break

    if not items:
        return None
    return version, iso, items


def _inject_release(page: str, version: str, iso: str, items) -> str:
    date_str = _fmt_date(iso)
    li = "\n".join(
        f"          <li>\n            <b>{html.escape(t)}</b>\n"
        f"            <p>{_md_inline(d)}</p>\n          </li>"
        for t, d in items
    )

    page = re.sub(r"(<span data-rn-version>).*?(</span>)",
                  lambda mo: mo.group(1) + f"v{version}" + mo.group(2), page, flags=re.DOTALL)
    page = re.sub(r"(<span data-rn-date>).*?(</span>)",
                  lambda mo: mo.group(1) + date_str + mo.group(2), page, flags=re.DOTALL)
    page = re.sub(r'(<ul class="rn-list" data-rn-list>).*?(</ul>)',
                  lambda mo: mo.group(1) + "\n" + li + "\n        " + mo.group(2),
                  page, flags=re.DOTALL)
    return page


# ── Download ─────────────────────────────────────────────────────────────────

REPO = "https://github.com/santojon/Deck-Shelves"


def _pkg_version(root: Path) -> str | None:
    pkg = root / "package.json"
    if not pkg.is_file():
        return None
    m = re.search(r'"version"\s*:\s*"([^"]+)"', pkg.read_text(encoding="utf-8"))
    return m.group(1) if m else None


def _inject_download(page: str, version: str) -> str:
    """Point the "Download latest release" buttons straight at the zip asset.

    GitHub serves `releases/latest/download/<asset>` as a redirect to the
    matching asset on the newest release, so the link stays current without
    hardcoding a release tag — but the *filename* in that URL still has to
    match the real asset name exactly, so it must be re-derived from the
    current version on every run. A plain string `.replace()` on the
    pre-injection marker (`releases/latest` with no `/download/...` suffix)
    is only idempotent for a single run: the marker is consumed by the first
    injection, so every later run silently no-ops and the button is stuck on
    whatever version first generated the file. Matched by regex instead, so
    it finds and rewrites the link whether it's still the bare marker or
    already points at an older version's asset.
    """
    direct = f'{REPO}/releases/latest/download/deck-shelves-v{version}.zip'
    pattern = re.compile(
        re.escape(f'href="{REPO}/releases/latest') +
        r'(?:/download/deck-shelves-v[^"]+)?"(?:\s+download)?'
    )
    return pattern.sub(f'href="{direct}" download', page)


# ── Usage stats ──────────────────────────────────────────────────────────────

def _parse_stats(root: Path):
    """Latest usage-stats snapshot written weekly by fetch_stats.py. Returns
    None (leaves the placeholder text untouched) if it hasn't run yet."""
    path = root / "site" / "reports" / "stats" / "history.json"
    if not path.is_file():
        return None
    try:
        history = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return history[-1] if isinstance(history, list) and history else None


def _stats_values(stats: dict) -> dict:
    """Map each stat card's data-stat key to its display string, omitting
    any source that didn't come back this run instead of showing a zero."""
    values = {}
    installs = stats.get("deckyStoreInstalls")
    if installs is not None:
        values["installs"] = f"{installs:,}"
    downloads = stats.get("githubDownloads")
    if downloads is not None:
        values["downloads"] = f"{downloads:,}"
    main_traffic = (stats.get("traffic") or {}).get("main") or {}
    if "views" in main_traffic:
        values["views"] = f"{main_traffic['views']:,}"
    npm = stats.get("npm") or {}
    npm_total = sum(v for v in npm.values() if isinstance(v, int))
    if npm_total:
        values["npm"] = f"{npm_total:,}"
    return values


def _inject_stat(page: str, key: str, value: str) -> str:
    pattern = re.compile(rf'(<b data-stat="{key}">).*?(</b>)', re.DOTALL)
    return pattern.sub(lambda mo: mo.group(1) + html.escape(value) + mo.group(2), page)


def _inject_stats_row(page: str, stats: dict | None) -> str | None:
    """Fill in the chips left at their placeholder "—" and reveal the row
    (hidden by default so a page built before the first snapshot doesn't
    show four dashes). A chip with no value this run just keeps "—" rather
    than a stale or fabricated number. The snapshot date goes on the row's
    own title attribute — a hover tooltip, no extra visible text."""
    if not stats:
        return None
    values = _stats_values(stats)
    if not values:
        return None
    for key, value in values.items():
        page = _inject_stat(page, key, value)
    date = stats.get("date")
    # Matched by regex, not a plain string .replace() — re-runnable across
    # snapshots, since a later run's row already carries attributes from
    # the run before it (same class of bug _inject_download guards against).
    row_pattern = re.compile(r'<div class="stats-row" data-stats-row(?:\s+style="display:none")?(?:\s+title="[^"]*")?>')
    title_attr = f' title="Last snapshot: {html.escape(date)}"' if date else ''
    page = row_pattern.sub(f'<div class="stats-row" data-stats-row{title_attr}>', page)
    return page


# ── Features page ────────────────────────────────────────────────────────────

_SCREENS = ("https://raw.githubusercontent.com/santojon/Deck-Shelves/main/"
            "assets/screenshots/")

# Curated visual highlights shown at the top of the features page. Kept short
# and hand-picked so the screenshots stay relevant; the full, always-current
# list is generated from the README below them.
_SHOWCASE = [
    ("shelf-edit-filters.png", "Advanced filter groups",
     "Build precise queries with AND/OR logic across playtime, genre, status, "
     "achievements, friends, tags and dozens more criteria — saved and reused."),
    ("home-shelves.png", "Multiple sources per shelf",
     "Stack collections, library tabs, wishlist and store into one shelf via "
     "Union or Intersection, with online-only filters on merged results."),
    ("smart-shelf-modal.png", "Smart shelves",
     "30+ heuristic shelves like Deck Picks, Never Played or Time of Day that "
     "appear automatically when they're relevant and disappear when they're not."),
    ("settings-statistics.png", "Statistics & suggestions",
     "Real charts for activity, most-played games and library breakdowns, plus "
     "one-tap suggestions to create or clean up shelves."),
    ("shelf-edit-visual.png", "Decoration cards & visuals",
     "Pin banners, logos, URL shortcuts or gaps, set your own hero art, and "
     "fine-tune position and sizing per shelf in a live preview."),
    ("settings-shortcuts.png", "Remappable shortcuts",
     "Change or disable the gamepad buttons for hide, highlight, quick-launch, "
     "Quick Search and Side Navigation — single, chord or double-tap."),
]


def _showcase_html() -> str:
    rows = []
    for img, title, desc in _SHOWCASE:
        rows.append(
            '<div class="feature-row">'
            f'<div class="fr-media"><img loading="lazy" src="{_SCREENS}{img}" alt="{html.escape(title)}"></div>'
            f'<div class="fr-text"><h3>{html.escape(title)}</h3><p>{html.escape(desc)}</p></div>'
            '</div>')
    return "\n".join(rows)


def _parse_features(root: Path):
    readme = root / "README.md"
    if not readme.is_file():
        return None
    text = readme.read_text(encoding="utf-8")
    m = re.search(r"^##\s+Features\s*$", text, re.MULTILINE)
    if not m:
        return None
    body = text[m.end():]
    nxt = re.search(r"^##\s+", body, re.MULTILINE)
    if nxt:
        body = body[:nxt.start()]

    html_items = []
    for raw in body.splitlines():
        if not raw.strip():
            continue
        indent = len(raw) - len(raw.lstrip(" "))
        content = raw.strip()
        if not content.startswith("- "):
            continue
        html_items.append((indent, _md_inline(content[2:])))
    return html_items or None


def _features_list_html(items) -> str:
    """Render one level of nesting from (indent, html) tuples."""
    out = []
    i = 0
    n = len(items)
    while i < n:
        indent, content = items[i]
        # gather children (deeper indent) that follow
        children = []
        j = i + 1
        while j < n and items[j][0] > indent:
            children.append(items[j])
            j += 1
        if children:
            sub = "".join(f"<li>{c}</li>" for _, c in children)
            out.append(f'<li>{content}<ul class="sub">{sub}</ul></li>')
        else:
            out.append(f"<li>{content}</li>")
        i = j if children else i + 1
    return "".join(out)


_FEATURES_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Deck Shelves — All Features</title>
<meta name="description" content="The full Deck Shelves feature list.">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="nav"><div class="container nav-inner">
<a class="brand" href="index.html">
<svg class="brand-mark" viewBox="217 444 854 378"><g fill="#0080FF">
<circle cx="300" cy="620" r="80"/><rect rx="8" x="550" y="460" width="80" height="285"/>
<rect rx="8" x="645" y="500" width="75" height="245"/></g>
<g fill="#fff"><path d="M 312.5,461.5 C 373.539,463.763 419.039,491.43 449,544.5C 475.648,600.403 473.314,655.069 442,708.5C 411.013,754.246 367.846,777.913 312.5,779.5C 312.333,760.497 312.5,741.497 313,722.5C 361.661,715.155 391.661,687.488 403,639.5C 408.643,596.312 394.143,561.812 359.5,536C 344.981,527.105 329.315,521.938 312.5,520.5C 312.5,500.833 312.5,481.167 312.5,461.5 Z"/>
<rect rx="8" x="740" y="530" width="75" height="215"/><rect rx="8" x="840" y="470" width="75" height="275"/>
<rect rx="8" x="500" y="750" width="570" height="25"/></g></svg>
<div><div class="brand-name">DECK <b>SHELVES</b></div><div class="brand-tag">Your Steam Deck Home Screen. Your Way.</div></div>
</a>
<a class="nav-back" href="index.html">&larr; Back to home</a>
</div></header>

<header class="page-hero"><div class="container">
<span class="eyebrow">Everything Deck Shelves can do</span>
<h1>All Features</h1>
<p>The complete, always-current feature list — generated straight from the project README.</p>
</div></header>

<main class="block" style="padding-top:0"><div class="container">
<div class="feature-rows">
{showcase}
</div>
<h2 class="features-list-title">Complete feature list</h2>
<div class="panel-block">
<ul class="features-list">
{items}
</ul>
</div>
</div></main>

{footer}
</body>
</html>
"""


# ── Integration pages (site/integrations/<slug>.html) ────────────────────────
#
# Real behavior only — no fabricated screenshots of another project's own UI.
# Each entry's steps describe what the code actually does (see NOTICE.md and
# src/integrations/*.ts); the one screenshot available (the Integrations
# settings tab, showing live detection) is reused across all three pages
# since no per-integration capture exists — that would need the other
# plugin actually installed on the capture device, which this project's own
# QA/screenshot harness doesn't set up (it only exercises Deck Shelves).

_INTEGRATIONS = [
    {
        "slug": "tabmaster",
        "name": "TabMaster",
        "repo": "https://github.com/Tormak9970/TabMaster",
        "screenshot": "integration-tabmaster.png",
        "tagline": "Use your TabMaster tabs — including filter-based ones — as shelf sources, "
                   "or import them as independent shelves in one click.",
        "steps": [
            ("Install TabMaster", "Get it from the Decky Store if you don't already have it."),
            ("Option A — live source", 'Create a shelf, set its source to "Library tab", and '
             "pick the TabMaster tab from the dropdown. It stays in sync with TabMaster "
             "forever — no separate sync step, no duplicated configuration."),
            ("Option B — one-click import", 'Open the Import menu → "Import from TabMaster" and '
             "click any tab (including hidden ones, listed separately) to create an independent "
             "Deck Shelves shelf from it instantly. A filter-based tab has its filters converted "
             "into an equivalent Deck Shelves filter group; a plain tab imports as a live "
             "tab-source shelf, same as Option A."),
            ("Pick whichever fits", "The live source always mirrors TabMaster; an imported shelf "
             "is yours to further customize with Deck Shelves' own filters, sorts and "
             "decorations, with or without TabMaster still installed."),
        ],
        "note": "Deck Shelves reads TabMaster's tab list at runtime through its public "
                "context (or its settings file, for the import) — it never modifies "
                "TabMaster's own settings or data.",
    },
    {
        "slug": "unifideck",
        "name": "UnifiDeck",
        "repo": "https://github.com/mubaraknumann/unifideck",
        "screenshot": "integration-unifideck.png",
        "tagline": "Bring your unified library — Steam, Epic, GOG, Amazon, Ubisoft and more — "
                   "into your customized Home.",
        "steps": [
            ("Install and set up UnifiDeck", "Follow UnifiDeck's own setup to unify your "
             "storefronts into your Steam library."),
            ("Point a shelf at one of its tabs", 'Create a shelf with source "Library tab" '
             "and pick any UnifiDeck tab (All, Installed, Steam, Epic, GOG, and so on) — "
             "Deck Shelves detects them the same way it detects any other library tab."),
            ("Optional: exclude what you already own", 'On a wishlist or store shelf, turn on '
             '"Exclude owned games" → its non-Steam sub-toggle. It checks UnifiDeck-unified '
             "non-Steam shortcuts too, so a game you already own on another store doesn't "
             "show up as a promotion."),
        ],
        "note": "Deck Shelves also recognizes UnifiDeck's cloud-play catalogue stubs, so "
                "promotions for cloud-gaming services aren't mistaken for owned games.",
    },
    {
        "slug": "css-loader",
        "name": "CSS Loader",
        "repo": "https://github.com/DeckThemes/SDH-CssLoader",
        "screenshot": "integration-css-loader.png",
        "tagline": "Keep your shelves visually consistent with the CSS Loader themes you "
                   "already have installed.",
        "steps": [
            ("Install CSS Loader and apply a theme", "Any theme from the DeckThemes catalogue."),
            ("Nothing else to configure", "Deck Shelves detects the active theme automatically "
             "and adjusts shelf styling to match it — no toggle needed for basic compatibility."),
            ("Optional: Force CSS Loader themes", 'In Settings → Experimental, this promotes '
             "every shelf into the same selector space as the first one, so the theme applies "
             "consistently across all of them, not just the first."),
        ],
        "note": "Detected today: ArtHero, TiltedHome / Renaissance, SLH (“Switch Like "
                "Home”), and Centered Home. Other themes still work — these four get "
                "extra, theme-specific visual adjustments.",
    },
]

_INTEGRATION_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Deck Shelves + {name} — Integration Guide</title>
<meta name="description" content="How Deck Shelves works with {name}: {tagline}">
<link rel="icon" type="image/svg+xml" href="../favicon.svg">
<link rel="stylesheet" href="../style.css">
</head>
<body>
<header class="nav"><div class="container nav-inner">
<a class="brand" href="../index.html">
<svg class="brand-mark" viewBox="217 444 854 378"><g fill="#0080FF">
<circle cx="300" cy="620" r="80"/><rect rx="8" x="550" y="460" width="80" height="285"/>
<rect rx="8" x="645" y="500" width="75" height="245"/></g>
<g fill="#fff"><path d="M 312.5,461.5 C 373.539,463.763 419.039,491.43 449,544.5C 475.648,600.403 473.314,655.069 442,708.5C 411.013,754.246 367.846,777.913 312.5,779.5C 312.333,760.497 312.5,741.497 313,722.5C 361.661,715.155 391.661,687.488 403,639.5C 408.643,596.312 394.143,561.812 359.5,536C 344.981,527.105 329.315,521.938 312.5,520.5C 312.5,500.833 312.5,481.167 312.5,461.5 Z"/>
<rect rx="8" x="740" y="530" width="75" height="215"/><rect rx="8" x="840" y="470" width="75" height="275"/>
<rect rx="8" x="500" y="750" width="570" height="25"/></g></svg>
<div><div class="brand-name">DECK <b>SHELVES</b></div><div class="brand-tag">Your Steam Deck Home Screen. Your Way.</div></div>
</a>
<a class="nav-back" href="../index.html#ecosystem">&larr; Back to home</a>
</div></header>

<header class="page-hero"><div class="container">
<span class="eyebrow">Works with your setup</span>
<h1>Deck Shelves + {name}</h1>
<p>{tagline}</p>
</div></header>

<main class="block" style="padding-top:0"><div class="container">
<div class="panel-block" style="max-width:820px;margin:0 auto">
<img loading="lazy" src="{screenshot}" alt="{screenshot_alt}" style="width:100%;border-radius:12px;border:1px solid var(--border);margin-bottom:28px">
<h2 style="margin-top:0">How it works</h2>
<ol class="steps">
{steps}
</ol>
<p style="color:var(--muted);font-size:0.9rem;border-top:1px solid var(--border);padding-top:16px;margin-top:24px">{note}</p>
<p style="color:var(--muted);font-size:0.85rem">Learn more about {name} on its own
<a href="{repo}" target="_blank" rel="noopener">GitHub page</a>. Deck Shelves is not affiliated
with, endorsed by, or sponsored by {name} — see the disclaimer in the footer.</p>
</div>
</div></main>

{footer}
</body>
</html>
"""


def _integration_steps_html(steps) -> str:
    return "".join(
        f"<li><strong>{html.escape(title)}</strong><p>{html.escape(body)}</p></li>"
        for title, body in steps
    )


def _write_integration_pages(root: Path, site: Path) -> None:
    out_dir = site / "integrations"
    out_dir.mkdir(parents=True, exist_ok=True)
    fallback = _SCREENS + "settings-integrations.png"
    generic = 0
    for entry in _INTEGRATIONS:
        # Prefer the real, integration-specific capture (from the optional
        # `integration_*` screenshot scenarios) once it exists in the repo;
        # fall back to the generic Integrations-tab shot otherwise, since
        # those scenarios only produce a file on a device where that
        # specific integration is actually detected active.
        own_shot = root / "assets" / "screenshots" / entry["screenshot"]
        has_own_shot = own_shot.is_file()
        screenshot = _SCREENS + entry["screenshot"] if has_own_shot else fallback
        screenshot_alt = (f"Deck Shelves detecting {entry['name']} in System information"
                          if has_own_shot else "Deck Shelves Integrations settings tab")
        if not has_own_shot:
            generic += 1
        page = _INTEGRATION_TEMPLATE.format(
            name=entry["name"],
            tagline=html.escape(entry["tagline"]),
            repo=entry["repo"],
            screenshot=screenshot,
            screenshot_alt=screenshot_alt,
            steps=_integration_steps_html(entry["steps"]),
            note=html.escape(entry["note"]),
            footer=_site_footer("../"),
        )
        (out_dir / f"{entry['slug']}.html").write_text(page, encoding="utf-8")
    print(f"[build_site] integrations/: {len(_INTEGRATIONS)} pages "
          f"({len(_INTEGRATIONS) - generic} with a dedicated screenshot, {generic} on the generic fallback)")


# ── Main ─────────────────────────────────────────────────────────────────────

def _copy_shared_assets(root: Path, site: Path) -> None:
    """Materialise the images the site shares with the plugin. They live once,
    in `assets/` (source of truth), and are copied into the Pages tree here so
    the served paths resolve with the right content type — a raw GitHub SVG URL
    is delivered as text/plain and would not render as a favicon. Generated, so
    both copies are gitignored (like features.html)."""
    for src_rel, dest_rel in (("assets/icon.svg", "favicon.svg"),
                              ("assets/steam-deck.png", "img/steam-deck.png")):
        src = root / src_rel
        if not src.is_file():
            print(f"[build_site] WARN: {src_rel} missing — {dest_rel} not refreshed", file=sys.stderr)
            continue
        dest = site / dest_rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, dest)
        print(f"[build_site] copied {src_rel} → site/{dest_rel}")


def main() -> int:
    root = _root()
    site = root / "site"
    index = site / "index.html"
    if not index.is_file():
        print(f"[build_site] site/index.html not found under {root}", file=sys.stderr)
        return 0

    _copy_shared_assets(root, site)

    page = index.read_text(encoding="utf-8")

    rel = _parse_release(root)
    version = None
    if rel:
        version, iso, items = rel
        page = _inject_release(page, version, iso, items)
        print(f"[build_site] release: v{version} ({iso}), {len(items)} highlights")
    else:
        print("[build_site] WARN: could not parse RELEASE_NOTES.md; kept existing block")

    version = version or _pkg_version(root)
    if version:
        page = _inject_download(page, version)
        print(f"[build_site] download links point to deck-shelves-v{version}.zip")
    else:
        print("[build_site] WARN: no version found; download links kept as release page")

    stats = _parse_stats(root)
    stats_page = _inject_stats_row(page, stats)
    if stats_page is not None:
        page = stats_page
        print(f"[build_site] stats row: {_stats_values(stats)}")
    else:
        print("[build_site] stats: no snapshot yet, row stays hidden")

    index.write_text(page, encoding="utf-8")

    feats = _parse_features(root)
    if feats:
        html_list = _features_list_html(feats)
        (site / "features.html").write_text(
            _FEATURES_TEMPLATE.format(showcase=_showcase_html(), items=html_list,
                                      footer=_site_footer("")),
            encoding="utf-8")
        print(f"[build_site] features.html: {len(feats)} lines + {len(_SHOWCASE)} showcases")
    else:
        print("[build_site] WARN: could not parse README Features section")

    _write_integration_pages(root, site)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
