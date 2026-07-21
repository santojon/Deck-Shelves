# Components

Inside the frontend container: the main source modules and how work flows from a
Home-screen render down to resolved shelf contents. (C4 Level 3.)

```mermaid
flowchart TB
    subgraph runtime["src/runtime"]
        homepatch[homePatch<br/>injects shelves into Home]
        adapter[host/decky<br/>Steam + Decky adapter]
        state[deviceState / sessionState<br/>event-driven signals]
    end

    subgraph components["src/components"]
        shelf[shelf/*<br/>GameCard, rows]
        filter[filter/*<br/>filter editor]
        qam[qam/*<br/>Quick Access panel]
        about[about + settings pages]
    end

    subgraph core["src/core"]
        pluginapi[pluginApi<br/>public API surface]
        refresh[shelfRefresh<br/>debounced refresh]
        updates[updateNotifier + updateDownload]
    end

    subgraph steam["src/steam"]
        resolver[index<br/>shelf source resolvers]
        smart[smartShelves<br/>smart-shelf + visibility]
    end

    domain[src/domain<br/>pure rules: filters, templates, triggers]
    store[src/store<br/>settingsStore global state]
    integrations[src/integrations<br/>TabMaster / UnifiDeck / …]

    homepatch --> shelf
    shelf --> refresh
    refresh --> resolver
    resolver --> smart
    resolver --> domain
    filter --> domain
    qam --> store
    about --> updates
    pluginapi --> resolver
    pluginapi --> store
    integrations --> resolver
    store -->|reads/writes via| adapter
    resolver -->|library data via| adapter
    smart --> state
```

## Notes

- **`src/core`** holds the sensitive logic: `pluginApi` (the public API surface,
  now re-exporting all public types from `@deck-shelves/api`), `shelfRefresh`
  (debounced, single-flight refresh), and the update check / download flow.
- **`src/steam`** resolves what actually goes on a shelf: `index` dispatches
  built-in and external sources; `smartShelves` handles smart-shelf modes and
  visibility rules.
- **`src/domain`** is pure, side-effect-free logic (filters, templates, trigger
  catalogue) — no UI, no external calls.
- **`src/store`** is the single global settings state; **`src/integrations`**
  detects and reads optional companion plugins at runtime.
- **State modules** (`deviceState`, `sessionState`) are event-driven — subscribe,
  cache, notify — with no polling or active timers, matching the performance
  rules for the Deck.
