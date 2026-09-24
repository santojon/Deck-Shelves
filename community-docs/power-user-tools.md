# Power-user tools

*[Leia em português](pt-BR/power-user-tools.md)*

A set of diagnostic, backup, and insight tools for people who want to look
under the hood or keep tighter control over their setup. Most of this lives
behind [Advanced mode](display-modes.md) — turn that on first.

## Settings snapshots

Every meaningful settings change gets a rolling, versioned backup
automatically (throttled to roughly one a day, keeping the last dozen), so
you can roll back if something goes wrong. You can also make a manual
snapshot before trying something risky, and export/import snapshots as
files — handy for backing up a setup or moving it to another install.
Restoring one is itself undoable, so it's safe to experiment.

## Cache management

See exactly how much space each of Deck Shelves' local caches is using, and
clear them individually or all at once, if you ever want a clean slate
(e.g. after a lot of library changes) without touching your actual shelves
or settings.

## System information

A read-only diagnostic panel: plugin version, OS/Steam version, active CSS
Loader theme, and which other Decky plugins are co-loaded — with a
one-tap Copy button, so pasting your setup into a bug report takes seconds.

## Statistics & Suggestions

Two more tabs, opt-in:
- **Statistics** (needs usage tracking turned on) — trend charts and
  breakdowns of your library and how your shelves are composed, built from
  your own local usage data, nothing sent anywhere.
- **Suggestions** — proactive tips grouped into "things you might want to
  create" and "things you might want to clean up," based on your actual
  setup, with a toast when new ones show up.

## Developer-mode extras

One more toggle inside Advanced mode unlocks a couple of deeper inspection
tools, useful mainly for tracking down a specific problem:
- **Source resolver inspector** — shows exactly which games a shelf's
  filter chain resolved to, step by step.
- **On-screen debug overlay** — live FPS/frame-time, shelf and node counts,
  and render outlines, if you're trying to spot a performance issue.
- **Diagnostic log viewer** — recent plugin events with copy/clear, plus
  quick reset shortcuts (just shelves, just smart shelves, everything).

## Everything here only observes

None of these tools change your shelves or settings on their own — they
read and report. The one exception is the explicit reset shortcuts, which
do exactly what they say and nothing else.
