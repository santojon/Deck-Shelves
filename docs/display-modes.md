# Display modes — Normal / Light / Advanced

Deck Shelves exposes three "display modes" that change how much of the
plugin's surface is visible — and, for **Light**, how much actually
renders on the home. Two QAM toggles drive it, **Light mode** and
**Advanced mode**; they are **mutually exclusive** (turning one on turns
the other off, after a confirm). With both off you are in **Normal**
mode, the default.

Switch them at **QAM → Additional features** (or the sidecar **Settings**
tab) → "Light mode" / "Advanced mode". The choice is per-profile (saved
profiles store it) and persists across reboots.

## Quick comparison

| Area | Light | Normal (default) | Advanced |
|---|---|---|---|
| Per-shelf **logo / icon / description / hero** on the home | **stripped** (forced off) | per toggle | per toggle |
| game-info-above, friends-playing overlay, hide-badges, highlight | active | active | active |
| **Context search** (chord overlay) | **disabled** | per toggle | per toggle |
| **Side navigation** | **disabled** | per toggle | per toggle |
| Settings tabs | Shelves, Profiles, Backup | + Shortcuts, Suggestions, Statistics (+ Integrations *if a 3rd-party plugin is present*) | + Integrations (always) + **Advanced tools** |
| QAM/sidecar: decoration + search + side-nav toggles | **hidden** (features are off — no dead controls) | shown | shown |
| QAM/sidecar: fine-tuning sliders (logo size/offset, description height/gap) | hidden | shown | shown |
| QAM/sidecar: CSS-Loader theme compat | hidden | shown (if CSS Loader installed) | shown |
| QAM/sidecar: smart "at bottom" / "Surprise me" | hidden | shown | shown |
| Edit-shelf modal: multi-key sort, composite source, manual drag-sort | hidden | shown | shown |
| Create picker: advanced smart templates | hidden | shown | shown |
| **Advanced tools** (verbose logging, diagnostic log viewer, reset shortcuts) | — | — | **shown** (Settings → Advanced tab) |

## Normal mode (default)

Everything is available at its normal setting. All decorations honour
their own toggle, every settings tab except **Advanced** is present, and
the QAM shows the full control set. The **Integrations** tab appears only
when a third-party plugin has registered a descriptor.

## Light mode — "minimal"

A focused, uncluttered experience for users who just want shelves on the
home and don't intend to tinker. Also handy as a **demo mode** when
showing the plugin to someone new.

**On the home:** per-shelf **logo, icon, description, and hero art are not
rendered** (forced off regardless of the stored toggle), and **context
search + side navigation do not activate**. game-info-above and the
friends-playing overlay still work — they are informational, not
decorative.

**In settings / QAM / sidecar:** the controls for everything light mode
turns off are **hidden**, so there are no dead toggles — the decoration
enable toggles and their position/size controls, the search + side-nav
toggles, CSS-Loader theme compat, and the smart-shelf placement options.
Tabs are trimmed to **Shelves / Profiles / Backup**. The edit-shelf and
smart-shelf modals collapse multi-key sort, hide the composite source
type, and drop manual drag-to-reorder; the create picker shows only the
simpler templates.

**Nothing is reset.** Every hidden toggle keeps its stored value and
reappears — with the home decorations restored — the moment light mode is
turned off.

## Advanced mode — "power user"

Everything in normal mode, **plus**:

- **Settings → Advanced tab** — the verbose-logging toggle, the on-device
  diagnostic **log viewer** (with copy / clear), and reset shortcuts
  (shelves / smart / all / custom-by-category). These tools live **only**
  here, so they are completely inaccessible unless advanced mode is on.
- **Integrations tab** is always visible (even with no third-party
  plugin present).

Advanced mode does **not** change the home rendering — it only unlocks
tools.

## Mutual exclusivity & precedence

- Light and Advanced cannot both be on. Enabling one while the other is
  on shows a confirm and flips the other off.
- Both off → Normal.
- Light mode's home stripping wins over individual feature toggles (a
  logo toggle that is "on" still renders nothing in light mode).

## Implementation

- Hooks [`useLightMode()` / `useAdvancedMode()`](../src/components/ui/lightMode.ts)
  read `settings.lightModeEnabled` / `settings.advancedModeEnabled` and
  re-render consumers on change.
- **Home stripping:** [`Shelf.tsx`](../src/components/Shelf.tsx)
  (`effectiveEnableLogo = !lightMode && …`, hero), plus
  [`SearchOverlay.tsx`](../src/features/search/SearchOverlay.tsx) and
  [`ShelfSideNav.tsx`](../src/features/sidenav/ShelfSideNav.tsx) (`!lightMode`).
- **Settings gating:** [`SettingsPage.tsx`](../src/components/SettingsPage.tsx)
  (tabs), [`DeckQAMSettings.tsx`](../src/components/DeckQAMSettings.tsx) and
  [`qam/sidecar/GeneralTab.tsx`](../src/components/qam/sidecar/GeneralTab.tsx)
  (toggle visibility). To gate a new surface, wrap the part in
  `!lightMode && …` (light) or `advancedMode && …` (advanced) — no prop
  plumbing needed.
