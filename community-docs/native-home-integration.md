# Native Home integration

How Deck Shelves fits alongside (or replaces parts of) Steam's own Home
screen — hiding/replacing the native Recents row, hiding the tab strip, and
reordering your shelves and cards by hand.

## Replacing native Recents

Two independent toggles work together:
- **Hide native Recents** — removes Steam's own Recents row from Home.
- **Replace with a shelf** — instead of leaving a gap, promotes one of your
  Deck Shelves shelves into that exact spot, matching the recents row's
  own layout and behavior (including things like the "featured item"
  treatment).

You can hide Recents without replacing it (just removes the row) or turn on
replacement without hiding anything (if you want your shelf to show
alongside native Recents rather than instead of it) — the two toggles are
independent.

## Hiding the Home tab strip

A separate toggle removes the native tab row at the top of Home entirely,
if you want a cleaner look. Keep in mind this is a Home-wide setting, not
per-shelf.

## Manual ordering & drag reorder

Set a shelf's sort to **Manual** to arrange its cards by hand — several
ways to do it, pick whichever's comfortable:
- **Side arrows** on a focused card shift it one position at a time (works
  with touch, mouse, or the D-pad + A).
- **Press-and-hold to grab**, then move a card with the D-pad and confirm —
  works the same with a controller as it does with touch/mouse dragging.

Shelf order itself (which shelf appears where on Home) is also
drag-reorderable the same way, from the shelf list in settings.

## Troubleshooting

- **My replacement shelf doesn't look right in the recents slot.** A few
  CSS Loader themes target the native Recents row specifically by its own
  internal classes — see [Theme compatibility](theme-compatibility.md) for
  what's currently supported there.
- **Drag reorder feels unresponsive with a controller.** The press-and-hold
  grab has a short intentional delay (so a quick tap doesn't accidentally
  start a drag) — hold a beat longer before moving.
