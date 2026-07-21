# Context

Deck Shelves in its environment: who uses it and which external systems it
depends on. (C4 Level 1, drawn with Mermaid `flowchart` subgraphs.)

```mermaid
flowchart TB
    user([Steam Deck user<br/>Gaming Mode])

    subgraph deckshelves["Deck Shelves"]
        plugin[Deck Shelves plugin<br/>custom Home-screen shelves]
    end

    subgraph host["Host platform"]
        decky[Decky Loader<br/>plugin runtime]
        steam[Steam client<br/>GamepadUI + app library]
    end

    subgraph external["External data sources"]
        launchers[Game launchers<br/>Heroic / EmuDeck / non-Steam]
        online[Online metadata<br/>store, wishlist, artwork]
        gh[GitHub Releases<br/>update check + download]
    end

    subgraph optional["Optional companion plugins"]
        css[CSS Loader themes]
        tabmaster[TabMaster / UnifiDeck / Non-Steam Badges]
    end

    user -->|browses shelves| steam
    steam -->|Home screen| plugin
    decky -->|loads, sandboxes| plugin
    plugin -->|reads library, collections, artwork| steam
    plugin -->|shortcuts + installed games| launchers
    plugin -->|fetches metadata / prices| online
    plugin -->|checks + downloads updates| gh
    plugin -.->|adapts layout to| css
    plugin -.->|reads tabs / filters from| tabmaster
```

## Notes

- Deck Shelves runs **inside Decky Loader**, which loads and sandboxes it. The
  frontend executes in Steam's GamepadUI (`SharedJSContext`); a small Python
  backend handles filesystem and network access the frontend cannot.
- Everything under **Optional companion plugins** is detected at runtime and used
  only when present — Deck Shelves never hard-depends on them.
- Update checks and downloads go to **GitHub Releases**; the download lands in the
  user's Downloads folder for manual install (there is no auto-install).
