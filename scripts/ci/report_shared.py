#!/usr/bin/env python3
"""Shared site chrome for the report pages — the landing-matching top nav and
the common footer, plus the inline logo they both use.

Split out of report.py so both stay under the per-file code-line cap (same
reason report_dashboard.py is separate). Pure string builders, no imports —
also reused by the site builder (scripts/site/build_site.py) so the landing,
features page and every report render an identical footer/header."""
from __future__ import annotations

_LOGO_SVG = (
    '<svg class="brand-mark" viewBox="217 444 854 378">'
    '<g fill="#0080FF"><circle cx="300" cy="620" r="80"/>'
    '<rect rx="8" x="550" y="460" width="80" height="285"/>'
    '<rect rx="8" x="645" y="500" width="75" height="245"/></g>'
    '<g fill="#fff"><path d="M 312.5,461.5 C 373.539,463.763 419.039,491.43 449,544.5C 475.648,600.403 '
    '473.314,655.069 442,708.5C 411.013,754.246 367.846,777.913 312.5,779.5C 312.333,760.497 312.5,741.497 '
    '313,722.5C 361.661,715.155 391.661,687.488 403,639.5C 408.643,596.312 394.143,561.812 359.5,536C '
    '344.981,527.105 329.315,521.938 312.5,520.5C 312.5,500.833 312.5,481.167 312.5,461.5 Z"/>'
    '<rect rx="8" x="740" y="530" width="75" height="215"/>'
    '<rect rx="8" x="840" y="470" width="75" height="275"/>'
    '<rect rx="8" x="500" y="750" width="570" height="25"/></g></svg>'
)


def _report_nav(landing: str, reports_home: str, dash: str) -> str:
    """Landing-matching top bar so reports share the site's header + logo and
    always offer a one-click path back to the home page."""
    return (
        '<div class="nav"><div class="container nav-inner">'
        f'<a class="brand" href="{landing}">{_LOGO_SVG}'
        '<div><div class="brand-name">DECK <b>SHELVES</b></div>'
        '<div class="brand-tag">Validation reports</div></div></a>'
        f'<nav class="nav-links"><a href="{reports_home}">All reports</a>'
        f'<a href="{dash}">Dashboard</a></nav>'
        f'<a class="btn btn-ghost" href="{landing}">&larr; Back to site</a>'
        '</div></div>'
    )


def _site_footer(prefix: str) -> str:
    """The shared site footer — identical across the landing, features page and
    every report page. `prefix` is the relative path from the current page back
    to the site root ('' landing/features, '../' reports/, '../../' reports/<scope>/)."""
    p = prefix
    return (
        '<footer><div class="container"><div class="foot-grid">'
        f'<div class="foot-brand"><a class="brand" href="{p}index.html">{_LOGO_SVG}'
        '<div><div class="brand-name">DECK <b>SHELVES</b></div>'
        '<div class="brand-tag">Customize your Steam Deck Home.</div></div></a>'
        '<p>Built with <span class="heart">&hearts;</span> by '
        '<a href="https://github.com/santojon">Jonathan Santos</a>. An open source plugin '
        'that gives you complete control over your Steam Deck home screen.</p></div>'
        '<div class="foot-col"><h4>Explore</h4>'
        f'<a href="{p}index.html#features">Features</a>'
        f'<a href="{p}index.html#showcase">Screenshots</a>'
        f'<a href="{p}index.html#install">Installation</a>'
        '<a href="https://github.com/santojon/Deck-Shelves/tree/main/docs">Docs</a></div>'
        '<div class="foot-col"><h4>Community</h4>'
        '<a href="https://github.com/santojon/Deck-Shelves">GitHub</a>'
        '<a href="https://discord.gg/EChuVEDakk">Discord</a>'
        '<a href="https://www.reddit.com/r/DeckShelves/">Reddit</a>'
        '<a href="https://ko-fi.com/santojon">Support on Ko-fi</a>'
        '<a href="https://www.npmjs.com/package/@deck-shelves/api">API on npm</a></div>'
        '<div class="foot-col"><h4>Reports</h4>'
        f'<a href="{p}reports/index.html">Validation reports</a>'
        f'<a href="{p}reports/dashboard.html">Reports dashboard</a>'
        f'<a href="{p}reports/ci/index.html">CI reports</a>'
        f'<a href="{p}reports/release/index.html">Release reports</a></div>'
        '</div></div>'
        '<hr class="foot-rule">'
        '<div class="container"><div class="foot-disclaimer">Steam Deck and Steam are trademarks '
        'and/or registered trademarks of Valve Corporation. Decky and Decky Loader are trademarks of '
        'their respective owners. Deck Shelves is an independent plugin and is not '
        'affiliated with, endorsed, or sponsored by Valve Corporation or the Decky Loader project.</div></div>'
        '<hr class="foot-rule">'
        '<div class="container"><div class="foot-bottom"><span>&copy; 2026 Deck Shelves &middot; BSD 3-Clause &middot; by '
        '<a href="https://github.com/santojon">Jonathan Santos</a></span>'
        '<span>Made for Steam Deck.</span></div></div>'
        '</footer>'
    )
