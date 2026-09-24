# Deck Shelves' own idle screensaver

*[Leia em português](pt-BR/idle-screensaver.md)*

Instead of Steam's built-in idle screensaver, Deck Shelves can show its own
full-screen slideshow — built from the same games your shelves and Home
screen already show, optionally mixed with your own local screenshots.

## What it shows

By default, the slideshow draws from:
- Every game on your enabled, visible shelves.
- Whatever's currently in the "recents" slot on your Home screen — the
  native Recents row, or whatever shelf you've configured to replace it, if
  anything.
- Your own local screenshots, if you turn that on — filtered the same way
  Steam's own screensaver setting would (all screenshots, or a "general
  audience" filter that skips mature content), and shown with the game's
  logo too, since Steam already knows which game each screenshot belongs
  to.

It fairly samples across **all** of your shelves rather than favoring
whichever one happens to come first — if you've got a lot of shelves, you
can control exactly how many games it pulls from each one before moving to
the next (see "Fine-tuning" below).

Each slide gets an optional logo overlay (any corner, resizable) and, new,
an optional game description shown right next to the logo, above or below
it with an adjustable gap.

## How to enable it

1. Open Deck Shelves' settings and find **Screensaver**.
2. Turn it on. Steam's own native idle screensaver is disabled for as long
   as this stays on, and restored to exactly what it was before the moment
   you turn it back off.
3. Optionally turn on "Include screenshots" if you want your own shots
   mixed in.

That's the whole setup — it starts working the next time you go idle.

## Fine-tuning

All under the same Screensaver section:
- **Start after** — how long you have to be idle before it kicks in.
- **Time per item** — how long each slide stays up.
- **Games per shelf** — how many games it pulls from one shelf before
  moving to the next when building the slideshow. Lower this if you want
  more variety across many shelves quickly; raise it if you'd rather see
  more from each shelf before it moves on.
- **Show game logo** — on by default, with size, corner position, and edge
  offset all adjustable. Has its own independent toggle for whether it
  shows on screenshot slides too.
- **Show game description** — off by default. When on, shows the game's
  store description snippet next to the logo, with a choice of above or
  below it and an adjustable gap between them.

Coming back to Home (moving the stick, pressing a button, touching the
screen) closes the screensaver immediately. Going idle again afterward
picks the slideshow back up where it left off, rather than starting over
from the first slide.

## Troubleshooting

- **It never seems to trigger, even with the QAM open and idle for a
  while.** Should work correctly now — an earlier version had a bug where
  real activity elsewhere could keep resetting the idle timer even while
  you weren't touching anything. If you still see this, file a bug report.
- **It's only ever showing games from one shelf.** Fixed — an earlier
  version could end up pulling almost entirely from whichever shelf came
  first if you had several shelves configured. It now fairly rotates
  through every shelf; "Games per shelf" above controls exactly how.
- **It restarts from the beginning every time instead of continuing.**
  Fixed — it now resumes from where it left off.
- **Steam's idle timeout looks wrong after using this.** Turning the
  screensaver toggle off restores your original Steam idle-timeout value
  exactly. If something still looks off, toggle Deck Shelves' screensaver
  on and back off once — that re-triggers the restore.

Off by default, and still marked experimental.
