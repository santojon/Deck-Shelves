# Deck Shelves' own Quick Access tab (experimental)

*[Leia em português](pt-BR/own-qam-tab.md)*

If you're on Decky Loader and wish Deck Shelves had its own tab in the
Quick Access Menu — like a first-party Steam feature, not a plugin inside
Decky's own tab — you can turn that on.

## What it does

Normally, opening Deck Shelves' settings means going into Decky Loader's
own plugin tab, then finding Deck Shelves in the list. With this on, Deck
Shelves gets a real, dedicated tab in the Quick Access strip itself, right
after Performance — same editor, one tap away instead of two. Deck Shelves
also stays in Decky's plugin list, as before.

If another host already shows a Deck Shelves tab, this setting is hidden
automatically, and that tab is the one you see.

## How to enable it

1. Open Deck Shelves' settings.
2. Find **Experimental** (it's grouped there while it's still being
   polished).
3. Turn on **"Own Quick Access tab (experimental)"**.
4. You'll get a prompt to restart Steam — do it. The tab appears after
   Steam restarts, from the first time you open the Quick Access Menu.

Turning it back off also asks for a restart: the tab may stay visible
until Steam restarts.

## Troubleshooting

- **I turned it on, restarted, and still don't see the tab.** Make sure it
  was a full Steam restart (not a sleep and resume). If the tab failed to
  draw on two Steam starts in a row, it pauses itself for 12 hours to keep
  the Quick Access Menu safe; turning the option off and on again, then
  restarting Steam, ends the pause sooner. If it still doesn't show, file a bug report with your Decky
  Loader version.
- **The tab looks slightly different from the rest of the strip (if you
  use a CSS Loader theme).** A cosmetic limitation: a few themes style the
  strip's tabs by their position or their internal names and may not pick
  this one up. A theme that hides tabs by their position may hide a
  different tab while this one is shown.
- **Why is this "experimental"?** It adds a tab to Steam's own Quick
  Access panel, which is more invasive than a normal plugin panel. It stays
  opt-in and off by default until it has had more time in the wild.

Off by default. No data or settings implications either way — it's purely
about where the same editor shows up.
