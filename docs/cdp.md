# Device inspection

The plugin's frontend runs inside the Steam client's embedded browser (CEF), so
the usual way to look at it on a running device is Chrome DevTools over CEF
remote debugging. This page covers how to reach it, which page to attach to,
and the in-plugin tools that save you from opening DevTools at all.

## Enable remote debugging

- **Steam Deck / SteamOS**: Decky Loader turns on Steam's local debug port
  (`8080`, reachable only on the device). To reach the device from another
  machine, either enable **CEF Remote Debugging** in Steam's Developer settings
  (the client then listens on `8081` on the network), or tunnel the local port
  over SSH:

  ```bash
  ssh -N -L 8080:127.0.0.1:8080 deck@steamdeck
  ```

- **Linux desktop**: `touch ~/.steam/steam/.cef-enable-remote-debugging`, then restart Steam.
- **Windows**: start Steam with `steam.exe -cef-enable-remote-debugging`.
- **macOS**: `open -a Steam --args -cef-enable-remote-debugging`.

Set the endpoint in `.env` (see [development.md](./development.md#environment-variables-env)):

| Target | `DECK_CDP_HOST` | `DECK_CDP_PORT` |
|---|---|---|
| Deck on your network, CEF Remote Debugging on | the Deck's IP | `8081` |
| Deck through the SSH tunnel above | `127.0.0.1` | `8080` |
| Steam on the machine you are working on | `127.0.0.1` | `8080` |

`DECK_CDP_HOST` defaults to `DECK_HOST`. Then run:

```bash
pnpm run deck:debug   # opens http://<host>:<port> in your browser
```

That page lists every debuggable surface; click one to open DevTools on it.
Chrome's `chrome://inspect` works too: add `<host>:<port>` under
"Discover network targets".

## Which page to attach to

| Title contains | What it is |
|---|---|
| `SharedJSContext` | Where the plugin's code runs: the settings store, the plugin API (`window.deckShelves`), React state. Console logs from the plugin land here. |
| `Big Picture` | The document shown in Gaming Mode. The Home shelves are rendered into it, so DOM inspection of shelves and cards happens here. |
| `QuickAccess` | The Quick Access panel, including the plugin's panel and the sidecar. |
| `MainMenu` | The Steam menu popup. |

Steam builds occasionally rename these, so match by the fragment.

The split matters when you query the DOM: the plugin runs in
`SharedJSContext` but its shelves live in the Big Picture document, so
`document.querySelector` in `SharedJSContext` finds nothing. Inspect shelves
from the Big Picture page.

## Console recipes

Paste these into the DevTools console of the page named.

```js
// Big Picture: shelves currently mounted on the Home, by id
[...document.querySelectorAll("[data-shelfid]")].map((el) => el.getAttribute("data-shelfid"))

// Big Picture: the class chain of the focused element
document.activeElement?.className

// SharedJSContext: plugin API version and the shelves as the API sees them
window.deckShelves?.version
window.deckShelves?.api.getShelves()

// SharedJSContext: the class map in use (see webpack-classmap.md)
JSON.parse(localStorage.getItem("ds_class_map") ?? "null")
```

The DevTools Performance and Memory tabs work on these pages as on any web
page; see [performance.md](./performance.md) for what to look at.

## Without DevTools

- **Settings → Developer** (turn on Advanced mode, then Developer mode in
  Advanced tools): the diagnostic log (last 50 plugin events, with a switch to
  include every log line), the performance panel, an on-Home debug overlay
  (FPS, shelf and render counters, focus, outlines) and a device simulator
  (pretend to be a Steam Frame or Steam Machine, or force pointer input).
- `pnpm run logs:decky` follows the Decky Loader journal on the device over
  SSH, which includes the Python backend's output.

## Troubleshooting

- **Connection refused**: remote debugging is off on that client, Steam was not
  restarted after enabling it, or the port is wrong (`8081` on the network,
  `8080` locally).
- **A page is missing from the list**: Steam is restarting or showing its
  splash screen. Reload the list after a few seconds.
- **Queries return nothing**: you are probably in `SharedJSContext` while
  looking for Home DOM, or the other way round.
