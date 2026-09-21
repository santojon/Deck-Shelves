# CSS Loader theme compatibility

Deck Shelves works alongside [CSS Loader](https://github.com/DeckThemes/CSSLoader) themes — it detects the popular ones at runtime and adjusts its own layout to match, rather than fighting them for control of the Home screen.

## What's supported today

- **ArtHero** — works. Deck Shelves' first shelf picks up the theme's hero-art treatment without stripping any of its own styling.
- **TiltedHome (Renaissance)** — works, including all four of its tilt-mode combinations (skew/3D × one-way/opposite-facing).
- **Centered Home** — detected and accounted for in Deck Shelves' own layout math.

## How theme detection works, roughly

Deck Shelves watches for CSS custom properties and classes each supported theme sets on the page, and turns on matching behavior when it sees them — there's no manual "pick your theme" setting to configure. If a theme you use isn't in the list above, Deck Shelves still renders normally; it just won't get any theme-specific layout adjustments, so shelves may look visually inconsistent with the rest of the theme.

## Reporting a theme compatibility issue

Include, if you can:
- The exact theme name (and variant, if it has several).
- A screenshot or short video of the actual problem.
- Whether it's a visual glitch (layout, cropping, overlap) or a functional one (can't navigate to shelves, can't scroll).

This directly speeds up fixing it — theme CSS can't be inspected without knowing which one to look at.
