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
import os
import re
import sys
from pathlib import Path

# Reuse the exact shared footer from the report generator so every page
# (landing, features, reports) renders an identical footer.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ci"))
from report import _site_footer  # type: ignore[import-not-found]  # noqa: E402

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
    hardcoding a tag. Idempotent — the marker href only exists pre-injection.
    """
    direct = f'{REPO}/releases/latest/download/deck-shelves-v{version}.zip'
    return page.replace(f'href="{REPO}/releases/latest"',
                        f'href="{direct}" download')


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
<div><div class="brand-name">DECK <b>SHELVES</b></div><div class="brand-tag">Customize your Steam Deck Home.</div></div>
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


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    root = _root()
    site = root / "site"
    index = site / "index.html"
    if not index.is_file():
        print(f"[build_site] site/index.html not found under {root}", file=sys.stderr)
        return 0

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

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
