# Deck Shelves' own Quick Access tab (experimental)

*[Leia em português](pt-BR/own-qam-tab.md)*

If you're on Decky Loader and wish Deck Shelves had its own tab in the
Quick Access Menu — like a first-party Steam feature, not a plugin buried
in Decky's own tab — you can turn that on now.

## What it does

Normally, opening Deck Shelves' settings means going into Decky Loader's
own plugin tab, then finding Deck Shelves in the list. With this on, Deck
Shelves gets a real, dedicated tab in the Quick Access strip itself — same
editor, one tap away instead of two.

This is the same tab mechanism [ShelvesHub](shelveshub-install.md) already
gives you — this setting brings it to Decky-only installs, no ShelvesHub
required. If you do have ShelvesHub installed too, this setting is hidden
automatically, since ShelvesHub is already providing the tab.

## How to enable it

1. Open Deck Shelves' settings.
2. Find **Experimental** (it's grouped there for now, since this is still
   being polished).
3. Turn on **"Own QAM tab"**.
4. You'll get a prompt to restart Steam — do it. The tab is patched in once
   at boot, so it won't appear until Steam restarts.

Turning it back off doesn't need a restart — the tab disappears
immediately.

## Troubleshooting

- **I turned it on, restarted, and still don't see the tab.** Try a full
  Steam Client restart (not a quick-resume/sleep cycle) — the setting is
  read fresh each boot, but a genuinely stuck session can miss it. If it
  still doesn't show, file a bug report with your Decky Loader version.
- **The tab looks slightly different from the rest of the strip (styling,
  if you use a CSS Loader theme).** Known, cosmetic-only limitation — a
  couple of themes that target the tab by its internal class name won't
  pick this one up yet. Doesn't affect functionality.
- **Why is this "experimental"?** It patches Decky's own tab list directly,
  which is a bit more invasive than a normal plugin panel. It's been
  verified working on a real Deck, but stays opt-in and off by default
  until it's had more time in the wild.

Off by default. No data or settings implications either way — it's purely
about where the same editor shows up.
