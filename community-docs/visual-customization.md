# Visual customization

Deck Shelves gives you control over how your shelves and cards look, from
small per-card tweaks to full-shelf treatments. Everything here can be set
**globally** (applies to every shelf) or **per-shelf** (overrides just that
one) — global toggles act as a master switch, so if a global option is off,
no individual shelf can turn it on by itself.

## Card content

- **Highlight** — feature the first card, all cards, or a random one in a
  larger landscape layout instead of the default portrait.
- **Hide individual elements** — status line, "New" badge, discount badge,
  compatibility icons, non-Steam badge, shelf title, game names, install
  indicator, the "see more" / refresh trailing cards. Each is its own
  independent toggle.
- **Match native size** — makes your custom shelf's cards the exact same
  size as Steam's own native rows, for a more built-in look.
- **Deduplicate by name** — collapses entries that are really the same
  game showing up twice (e.g. a Steam copy and a non-Steam shortcut with
  the same title).

## Logo, icon & description

Three optional enrichments per card, each with its own position/size
controls:
- **Logo** — the game's logo art overlaid on the card, position and size
  adjustable.
- **Icon** — a small icon, with vertical alignment control.
- **Description** — a short text snippet from the store page, positionable
  relative to the logo with an adjustable gap between them (same idea the
  [screensaver's own description overlay](idle-screensaver.md) borrows).

## Hero art

Paints the focused card's artwork as a full background behind the shelf —
available per-shelf or globally. There's also a dedicated option to promote
one shelf to a full-page layout (the same treatment the first shelf gets
when native Recents is hidden).

## Decoration cards

Pin fixed, non-game cards at any position in a shelf:
- A **text label**.
- An **image banner** (can double as that shelf's hero background when
  focused).
- A **focusable link** — jump to a URL or another app/game.
- A **transparent gap**, for visual spacing.

Image cards support a configurable shadow (never / on focus / always) for
clean framing around transparent art.

## Home-wide options

A few toggles affect the whole Home screen rather than one shelf:
- **Hide native Recents** — replaces or removes Steam's own Recents row.
- **Hide Home tabs** — removes the native tab strip at the top.
- **Hero background on the first shelf**, sourced from whatever's focused.
- **Force CSS Loader theme styling** across every shelf, not just the one
  in the native Recents slot — useful with themes that normally only
  target that specific position.

## Where to set these

Global versions of most of these live under **Visual** in the main
settings; per-shelf overrides are in each shelf's own edit screen.
