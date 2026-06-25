# Screenshots

A visual tour of Deck Shelves. Captures are produced by the CDP screenshot
automation (see the [Development Guide](development.md#screenshots)) and live
in [`assets/screenshots/`](../assets/screenshots/).

## Home

<p align="center">
  <img src="../assets/screenshots/home.png" alt="Deck Shelves — Home Screen" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/home-shelves.png" alt="Deck Shelves — Shelves Close-up" width="768">
</p>

## Plugin Settings

<p align="center">
  <img src="../assets/screenshots/qam.png" alt="Deck Shelves — Quick Access Menu" width="768">
</p>

## Game Actions

<p align="center">
  <img src="../assets/screenshots/game-menu.png" alt="Deck Shelves — Game Context Menu (Menu Button)" width="768">
</p>

## Shelf Management

<p align="center">
  <img src="../assets/screenshots/shelf-create.png" alt="Deck Shelves — Create Shelf (Template Picker)" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/shelf-import.png" alt="Deck Shelves — Import Shelves" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/shelf-actions.png" alt="Deck Shelves — Shelf Context Menu" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/shelf-edit.png" alt="Deck Shelves — Edit Shelf (Source tab)" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/shelf-edit-filters.png" alt="Deck Shelves — Edit Shelf (Filters tab with Saved Filters bar)" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/shelf-edit-visual.png" alt="Deck Shelves — Edit Shelf (Visual tab with highlight picker)" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/shelf-hidden.png" alt="Deck Shelves — Hidden Shelf" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/shelf-delete.png" alt="Deck Shelves — Delete Shelf Confirmation" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/shelf-export.png" alt="Deck Shelves — Export Shelves" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/reset-all.png" alt="Deck Shelves — Reset All Confirmation" width="768">
</p>

## About & Filter Documentation

<p align="center">
  <img src="../assets/screenshots/about-page.png" alt="Deck Shelves — About & Filter Documentation" width="768">
</p>

## Smart Shelves

<p align="center">
  <img src="../assets/screenshots/smart-shelves-qam.png" alt="Deck Shelves — Smart Shelves in QAM" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/smart-shelf-modal.png" alt="Deck Shelves — Smart Shelf Template Picker" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/smart-shelf-edit.png" alt="Deck Shelves — Edit Smart Shelf (sort override + filters)" width="768">
</p>

## Saved Filters

Visible in the QAM when at least one filter has been saved from the
**Edit shelf → Filters** tab. Hidden automatically when empty.

<p align="center">
  <img src="../assets/screenshots/saved-filters-qam.png" alt="Deck Shelves — Saved Filters section in QAM" width="768">
</p>

## Global Toggles

<p align="center">
  <img src="../assets/screenshots/global-toggles.png" alt="Deck Shelves — Global Toggles" width="768">
</p>

## Settings page

The full-page Settings route, opened from the gear icon in the QAM title bar.

<p align="center">
  <img src="../assets/screenshots/settings-page.png" alt="Deck Shelves — Settings page (Shelves tab)" width="768">
</p>

<p align="center">
  <img src="../assets/screenshots/settings-profiles.png" alt="Deck Shelves — Settings page (Profiles tab)" width="768">
</p>

## Optional captures

These are produced by the modular runner when the matching state is reachable;
the validator treats them as optional and they are skipped when the state
isn't present (no saved filters, only one import source, Advanced mode off, …).

| File | When |
|------|------|
| `home-hero.png` | Home with a card focused (hero overlay visible) |
| `home-hide-recents.png` | Home with native recents hidden and the first DS shelf promoted |
| `import-overflow.png` | QAM with the import-options `…` overflow menu open (2+ import descriptors registered) |
| `saved-filters-qam.png` | QAM Saved Filters section (when at least one filter is saved) |
| `sidecar.png` | QAM with the Settings sidecar expanded (needs a real gamepad dpad-right — not reliably reproducible over CDP) |
| `about-filters.png`, `about-smart.png`, `about-support.png` | Individual About-page tabs |
| `settings-profiles.png`, `settings-statistics.png`, `settings-integrations.png`, `settings-advanced.png` | Settings-page tabs (Integrations / Advanced require Advanced mode on) |
