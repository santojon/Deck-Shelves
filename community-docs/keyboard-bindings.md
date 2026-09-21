# Keyboard bindings

Every gamepad shortcut in Deck Shelves — hiding/highlighting a card,
quick-launching a game, opening Quick Search, opening the Side Nav, opening
or closing the sidecar panel — can now also be bound to a keyboard key.
Handy if you're running Deck Shelves on a PC or in Desktop Mode with a
keyboard attached, or just prefer keys for some actions.

## How it works

Keyboard bindings are a **separate, independent slot** from your gamepad
bindings — binding a key doesn't remove or replace the gamepad combo for
that action. Either input fires the same action; you can use both, either
one, or neither.

Supports modifier combos (Ctrl+F, for example), and a bound key never fires
while you're actively typing in a text field, so it won't fight with normal
typing.

## How to set one up

1. Open Deck Shelves' settings and find the bindings screen (same place
   your gamepad bindings live).
2. Each action now has a second capture slot next to the gamepad one —
   select it and press the key (or key combo) you want.
3. Done — no restart needed, it's live immediately.

To remove a binding, open its capture slot and clear it (or reset that
action back to its default).

## What can and can't be bound

Almost every action works. Arrow keys are the one exception — they can't be
captured as keyboard bindings at all. This isn't a Deck Shelves limitation:
on the current Steam beta, arrow key presses are intercepted as virtual
D-pad navigation before any app-level key event ever fires, so there's
nothing for us to catch.

## Troubleshooting

- **My key press does nothing.** Double-check it's not an arrow key (see
  above — genuinely not capturable right now). Also make sure focus isn't
  inside a text field, since bound keys are intentionally ignored there.
- **I bound the same key to two different actions.** The bindings screen
  flags collisions the same way it already does for gamepad bindings — fix
  one of them before it'll let you save.
- **A third-party plugin can see what I've bound.** By design — Deck
  Shelves exposes a read-only list of your keyboard bindings through its
  public API (`api.listKeyboardShortcuts()`), the same way it already does
  for gamepad shortcuts, so other plugins can display or avoid your
  bindings if they want to.

No settings, no toggle to turn this off globally — it's just an extra,
optional capture slot on bindings you already have. Leave a slot empty and
that action simply has no keyboard binding.
