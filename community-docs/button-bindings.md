# Gamepad button bindings

*[Leia em português](pt-BR/button-bindings.md)*

Every card action and navigation shortcut in Deck Shelves is remappable to
whichever gamepad button (or combo) you'd rather use — not locked to the
defaults.

## What's bindable

- **Hide/remove a card** — default X.
- **Toggle highlight on a card** — default Y.
- **Quick launch** — default View button; triggers the same
  Install/Play/Resume/Uninstall/Pause flow the game's normal action would.
- **Quick Search** — default L1+R1 (see
  [Quick Search & Side Nav](quick-search-and-side-nav.md)).
- **Side Nav** — default L1 twice.
- **Open/close the QAM sidecar** — default double dpad-right / dpad-left.

## How to rebind

1. Open Deck Shelves' settings, find the bindings screen.
2. Select the action, press the button or combo you want.
3. Supports single buttons, chords (two held together), and double-taps.
   Back grips and stick-clicks are all bindable too.

The three card-level actions (hide/remove, highlight, quick launch) can
also be set to **nothing** if you'd rather disable that shortcut entirely
— the two navigation bindings (Quick Search, Side Nav) can be remapped but
not fully turned off.

A few buttons are reserved system-wide and can't be bound to anything: A,
B, the Menu button, the Steam button, and the screenshot button.

## Collision detection

If you try to bind two different actions to the same combo, the bindings
screen catches it and won't let you save until it's resolved — same
protection [keyboard bindings](keyboard-bindings.md) has.

## Troubleshooting

- **My binding doesn't seem to fire.** Double-check it's not one of the
  reserved buttons above — those never register regardless of the setting.
- **I want gamepad and keyboard to both trigger the same action.** They
  already can — keyboard bindings are a completely separate, independent
  slot from gamepad ones, so binding both doesn't conflict.
