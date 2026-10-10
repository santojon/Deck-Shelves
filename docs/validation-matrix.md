# Validation matrix

*[Leia em português](pt-BR/validation-matrix.md)*

What has actually been exercised on real devices for the current release line
(plugin 3.3.4, standalone host 0.5.0 beta), and what still needs a validator.
"Validated" means the device gates in `docs/performance.md` ran on that setup
(cold boot, return to Home, keep selection, plugin reload, Steam restart,
sleep/wake, idle CPU and battery). Anything not listed as validated is
**untested for this release**, not known-broken.

## Current state

| Platform | Steam channel | Host | Status | Evidence |
|---|---|---|---|---|
| Steam Deck (LCD) | Client Beta, Big Art home | Decky Loader (with CSS Loader and other plugins) | Validated 2026-10-10 | 20× return-to-Home gate, 20/20 reload, 99/100 Steam restarts, 50/50 sleep/wake, idle CPU and battery soaks — records in `site/reports/perf/` |
| Steam Deck (LCD) | Client Beta | Standalone host only | Validated 2026-10-10 | Boot, Home layout, idle CPU, 30-min battery half |
| Steam Deck (LCD) | Client Beta | Decky Loader + standalone host at once | Validated 2026-10-10 | 10/10 Steam restarts, 5/5 plugin reloads, one root and one shelf panel every cycle |
| macOS (Apple silicon) | Stable | Standalone host only | Validated (basic) 2026-10-10 | Home renders, hero band, idle pause — no gamepad connected, keyboard/controller feel not covered |
| Steam Deck (OLED) | any | any | Needs a validator | Only LCD hardware available |
| SteamOS | Stable / Preview | any | Needs a validator | Only the Client Beta was available this cycle |
| Bazzite | any | Decky Loader or standalone host | Needs a validator | Reports #57, #96 and #101 came from Bazzite; nothing retested there since |
| Windows | Stable | Standalone host | Needs a validator | Installer exists; not exercised this cycle |
| Linux desktop (non-SteamOS) | Stable | Standalone host | Needs a validator | — |
| ARM64 / aarch64 | any | Standalone host (experimental) | Needs a validator | No hardware; CI builds only |

## How to validate a cell

Ten minutes with the plugin installed and at least three shelves configured:

1. **Cold boot:** restart Steam. Shelves appear within a few seconds of the native home; focus
   lands on a card, not in the search field.
2. **Return to Home:** open a game's page, press B. The shelves are back at once, your selected
   card is still selected, the native home does not flash in between.
3. **Plugin reload / host restart:** restart the loader or the standalone host. Exactly one copy
   of the shelves is on screen afterwards.
4. **Sleep / wake:** suspend and resume. Shelves intact, navigation works.
5. **With a game running:** launch a game, press the Steam button, go Home. Shelves present and
   navigable; back in the game nothing changed.
6. **Idle:** leave the Home untouched for two minutes. No stutter when you press a direction again.

Then open **Settings → About → Diagnostics** and use the bug-report copy; paste it into a
GitHub issue titled with the platform and host, or into the Discord validation channel. Include
the Steam client build number (Settings → System) and whether CSS Loader themes are on.

## What a validator gets

A named line in this table, the release notes' thanks, and first access to the next beta of
whichever host you validated on.
