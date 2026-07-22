# Documentation

Reference material for Deck Shelves. Start with the [project README](../README.md)
for what the plugin does and how to install it.

## Using the plugin

| Document | What it covers |
|---|---|
| [showcase.md](showcase.md) | Visual tour of every surface — home, Quick Access, editors |
| [filters.md](filters.md) | Every filter type and its parameters, filter groups, sort keys, built-in sources, multi-source shelves |
| [shelf-templates.md](shelf-templates.md) | The preset shelves offered when creating a shelf, including the online ones |
| [smart-shelves.md](smart-shelves.md) | Smart-shelf templates, their heuristics, tuning parameters and when each appears |
| [online-shelves.md](online-shelves.md) | Network-backed sources (wishlist, store), caching and refresh behaviour |
| [display-modes.md](display-modes.md) | What Normal, Light and Advanced modes each show and hide |

## Extending the plugin

| Document | What it covers |
|---|---|
| [plugin-api.md](plugin-api.md) | Runtime notes for integrations — globals, built-in providers, first-party ids. The contract itself lives in the `@deck-shelves/api` package |
| [architecture.md](architecture.md) | System overview, directory structure, data flow, key systems and Home-screen internals |

## Working on the plugin

| Document | What it covers |
|---|---|
| [development.md](development.md) | Setup, build and test commands, conventions, translations |
| [performance.md](performance.md) | Performance budget and the rules that protect frame rate and battery |
| [qa-manual.md](qa-manual.md) | Manual test checklist before a release |
| [cdp.md](cdp.md) | Inspecting the running plugin on a device |
| [webpack-classmap.md](webpack-classmap.md) | How Steam's bundled class names are discovered and kept working across updates |
