# ShelvesHub: the new recommended way to install Deck Shelves

**No Decky Loader required.**

Up until now, the only way to run Deck Shelves was through Decky Loader —
install Decky first, then install the plugin from the Decky Store. That's
still fully supported and unchanged. But if you're setting up a fresh Deck
(or just don't want to deal with a plugin loader), there's now a simpler
path: **ShelvesHub**, a standalone host built specifically for Deck Shelves.

## What ShelvesHub actually is

ShelvesHub is a small background service. It watches for the Steam client,
injects Deck Shelves directly, and gives it everything it needs to run — no
plugin loader in the middle. Practically, that means:

- **One-click install**, no Decky setup step first.
- **Automatic updates** — for itself and for Deck Shelves, each with its own
  optional pre-release channel.
- **Its own Quick Access Menu tab**, with the full settings editor.
- Works on **Steam Deck, Linux, macOS, and Windows**.

If you already have Decky Loader installed, ShelvesHub coexists with it
cleanly — install both, and they share the same settings. Exactly one Deck
Shelves tab shows up at a time so it doesn't look doubled.

## How to install it

1. Grab the installer for your platform from the
   [ShelvesHub releases page](https://github.com/santojon/ShelvesHub/releases/latest).
2. Run it:
   - **Steam Deck / SteamOS**: double-click the `.desktop` file in Desktop
     Mode and follow the terminal prompt. No sudo needed.
   - **Linux**: one-click `.desktop` file, or a package + `install.sh` for a
     system-wide install.
   - **macOS**: `Install ShelvesHub.app` — double-click, then right-click →
     Open on first run to get past Gatekeeper.
   - **Windows**: `shelveshub-setup.exe`, accept the UAC prompt.
3. Restart Steam if prompted. Deck Shelves shows up in your Quick Access
   Menu automatically — no separate plugin install step.

Full details and every platform's exact steps: the
[ShelvesHub README](https://github.com/santojon/ShelvesHub#installation).

## Uninstalling

Every platform ships a matching one-click uninstaller alongside the
installer (same download page). Your Deck Shelves settings are kept unless
you explicitly pass `--purge` on the uninstall script — so if you're just
troubleshooting, a plain uninstall/reinstall won't wipe your shelves.

## Troubleshooting

- **Nothing shows up after installing.** Restart Steam completely (not just
  the game — the actual client). ShelvesHub needs to catch Steam on launch
  to inject.
- **I have Decky Loader too and now I see two tabs, or settings look out of
  sync.** This shouldn't happen — file a bug report with both hosts'
  versions. As designed, only one tab should show and both should read/write
  the same settings file.
- **Updates aren't showing up.** Check the ShelvesHub tab's own update
  section — it has independent update channels for itself and for the Deck
  Shelves bundle, each with an opt-in pre-release toggle.
- Full troubleshooting reference (port conflicts, coexistence edge cases,
  recovery): [ShelvesHub's troubleshooting doc](https://github.com/santojon/ShelvesHub/blob/main/docs/troubleshooting.md).

## Still want Decky Loader?

Nothing changes for you — install Decky Loader, then grab Deck Shelves from
the Decky Store like always. ShelvesHub is additive, not a replacement.
