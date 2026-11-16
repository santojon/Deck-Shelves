# Manual QA

The checklist I run on a real device before a release (SteamOS Stable or Beta),
followed by the development-build flags that force a state on demand. Unit
tests cover the pure logic; everything here depends on Steam's live UI and has
to be checked by hand.

## Prerequisites

- Decky Loader installed
- Plugin deployed (`pnpm run deploy:deck`; see [development.md](./development.md))
- At least 5 games in the library, some favorited, some installed, and one
  non-Steam shortcut

---

## 1. Plugin Enable / Disable

| # | Scenario | Expected |
|---|----------|----------|
| 1.1 | Plugin toggle OFF → shelves section visible, global toggles and smart shelves hidden | Only the main toggle and shelf list visible |
| 1.2 | Plugin toggle OFF → no shelves injected on Home screen | Native Home unchanged |
| 1.3 | Plugin toggle ON → shelves appear on Home within ~2s | Shelves render below recents |
| 1.4 | Plugin toggle ON → global toggles section appears in QAM | "Apply globally" section visible |
| 1.5 | Plugin toggle ON → smart shelves toggle appears in QAM | Smart Shelves section visible |
| 1.6 | Toggle OFF while shelves visible → shelves disappear from Home | Native Home restored |

---

## 2. Shelf Management

| # | Scenario | Expected |
|---|----------|----------|
| 2.1 | Create shelf via "+" → template picker opens | Modal with templates displayed |
| 2.2 | Select blank template → edit modal opens directly | EditShelfModal with empty config |
| 2.3 | Create shelf with filter (Favorites) → shelf appears on Home | Games filtered correctly |
| 2.4 | Hide shelf via the row menu → shelf disappears from Home | Shelf shows grayed in QAM |
| 2.5 | Show shelf via the row menu → shelf reappears on Home | Shelf active again |
| 2.6 | Delete shelf → confirmation modal; confirm → removed | Shelf gone from QAM and Home |
| 2.7 | Move shelf up/down via QAM → order changes on Home | Order matches QAM |
| 2.7a | QAM shelf list with a controller: A on a shelf name grabs it; D-pad up/down moves it one place (stops at the ends); A saves | The row keeps Steam's own highlight, no extra frame or hint; while grabbed, Steam's button bar shows Move up / Move down (D-pad), Save Order (A) and Cancel (B); order saved once, Home follows; focus stays on the moved row |
| 2.7b | Same, then B instead of A | Row goes back, nothing saved, the panel stays open, focus stays on the row |
| 2.7c | Hold-drag a row with touch or a mouse | The dragged row is dimmed; order saved on release |
| 2.8 | Edit shelf title → title updates on Home row header | New title rendered |
| 2.9 | Edit shelf limit → card count changes | Number of cards changes |
| 2.10 | In Steam's library, press ≡ on an installed game, a game that is not installed and a non-Steam shortcut | "Add to shelf" appears once in each menu, just before Properties |
| 2.11 | Right after Steam starts, open the first game menu from the library and keep it open for a few seconds | "Add to shelf" stays in the menu |

---

## 3. Navigation (D-pad)

| # | Scenario | Expected |
|---|----------|----------|
| 3.1 | D-pad DOWN from last item in "Recently Played" → first shelf card gains focus | Bridge fires correctly |
| 3.2 | D-pad UP from first shelf card → focus returns to native section above | UP bridge fires correctly |
| 3.3 | D-pad LEFT/RIGHT at shelf edge → no wrap-around to another app | Edge blocked |
| 3.4 | `hideHomeTabs=true` + D-pad DOWN from last shelf → focus stops; no wrap to first shelf | No wrap-around |
| 3.5 | `hideHomeTabs=false` + at last item of native tab content + D-pad DOWN → focus stops | No wrap-around |
| 3.6 | `hideHomeTabs=false` + navigate DOWN from recents into shelves → correct | Bridge still works for top siblings |

---

## 4. Global Toggles

| # | Scenario | Expected |
|---|----------|----------|
| 4.1 | `matchNativeSize=true` → card dimensions match native Recents cards | Same height/width as native |
| 4.2 | `highlightFirst=true` → first card of every shelf renders as landscape featured | Wide card at left edge |
| 4.3 | `hideStatusLine=true` → status text hidden on all shelf cards | No "Play" / "Install" text |
| 4.4 | `hideNewBadge=true` → "NEW" badge hidden on all shelf cards | No badge shown |
| 4.5 | `hideCompatIcons=true` → Deck compat icons hidden on all cards | No compat indicator |
| 4.6 | Global toggles hidden when `enabled=false` | Section gone from QAM |
| 4.7 | `globalHideShelfTitle=true` → all shelf title rows hidden; cards row stays expanded | No collapsible title; cards always visible |
| 4.8 | `globalHideGameNames=true` → game name labels hidden on every card | Card art only, no name beneath |
| 4.9 | `globalHideInstallIndicator=true` → install/download/update/play icons hidden in status line; playtime still visible | Only the playtime text remains in `.ds-card-status` |
| 4.10 | Per-shelf override: enable `hideShelfTitle` / `hideGameNames` / `hideInstallIndicator` on one shelf only → other shelves unaffected | Per-shelf toggle wins over global=false; global=true wins over per-shelf=false |

---

## 5. Hide Recents

| # | Scenario | Expected |
|---|----------|----------|
| 5.1 | `hideRecents=true` → native Recently Played section hidden | Section not visible on Home |
| 5.2 | `hideRecents=true` + `heroBackground=true` → focused card shows background art | Hero art visible |
| 5.3 | `hideRecents=true` + `recentsReplaceSource=true` → the native Recents row shows the first shelf's games and title | First shelf uses native styles |
| 5.4 | `hideRecents=false` → sub-toggles (hero, replace-source) hidden in QAM | Only visible when hideRecents is on |

---

## 6. Hide Home Tabs

| # | Scenario | Expected |
|---|----------|----------|
| 6.1 | `hideHomeTabs=true` → Home tab bar (What's New, Friends, Recommended…) hidden | Tabs not visible |
| 6.2 | `hideHomeTabs=false` → tabs visible and navigable | Tabs work normally |
| 6.3 | `hideHomeTabs=true` → D-pad DOWN from last shelf stops | Focus does not wrap |

---

## 7. Smart Shelves

| # | Scenario | Expected |
|---|----------|----------|
| 7.1 | `smartShelvesEnabled=false` → smart shelves section not shown in QAM | Section hidden |
| 7.2 | `enabled=false` → smart shelves toggle not shown at all | Even toggle hidden |
| 7.3 | Add smart shelf → the create picker lists the smart templates by category (online-only ones hidden while online features are off) | CreateShelfModal |
| 7.4 | Smart shelf with no results → not rendered on Home | Shelf invisible (null render) |
| 7.5 | Smart shelf with results → rendered on Home between standard shelves | Appears in correct position |
| 7.6 | `smartShelvesAtBottom=true` → smart shelves appear below standard shelves | Order respected |
| 7.7 | `smartSurpriseMe=true` → manual list hidden, system picks templates | No manual list in QAM |
| 7.8 | `smartSurpriseMe=true` + count=0 → system decides count | Variable shelf count |
| 7.9 | Daily Pick shelf → same result throughout the day | Stable within UTC day |
| 7.10 | Edit smart shelf → sort override + filterGroup + smartParams + refreshIntervalMinutes round-trip after save/reload | Persisted; applied on next render |
| 7.11 | Refreshable smart shelf (`random_pick`, `time_of_day`, `spare_time`, `recently_played`) shows Refresh card at end | Trailing card with refresh icon |
| 7.12 | Click Refresh card → spin animation runs once + shelf re-resolves | New game order on `random_pick` / `recently_played` |
| 7.13 | Deterministic smart shelf (e.g. `daily_pick`, `deck_picks`) → no trailing card at all | Row ends at last game |
| 7.14 | Non-smart shelf with `sort=random` → Refresh card at end | Same as smart refreshable |
| 7.15 | Click Refresh on `sort=random` shelf → cache cleared (`ds-random-*` keys), shelf re-resolves with new order | Order changes on click |

---

## 8. Import / Export

| # | Scenario | Expected |
|---|----------|----------|
| 8.1 | Export → JSON file saved to Downloads | Valid JSON, all shelves included |
| 8.2 | Import valid JSON → shelves replaced with imported set | QAM and Home reflect import |
| 8.4 | Import JSON with unknown fields → no crash, extra fields ignored | Graceful parse via passthrough |
| 8.5 | Reset All → confirmation modal; confirm → settings cleared | QAM empty, Home clean |

---

## 9. CSS Loader themes

| # | Scenario | Expected |
|---|----------|----------|
| 9.1 | ArtHero active + `hideRecents=false` → plugin shelves not affected by ArtHero | Own styling preserved |
| 9.2 | ArtHero active + `hideRecents=true` + `recentsReplaceSource=false` → first shelf adopts ArtHero styles, label overlay clones the focused card's `.ds-card-label` | Visual parity with native recents; label tracks focused card horizontally on row scroll |
| 9.3 | TiltedHome theme active → entire `.ds-card` (image + label + glow + MoreCard + RefreshCard) tilts as a parallelogram; focused card composes `skew + scale + translateZ` | Cards visually overlap like native TiltedHome; focus indicator preserved |
| 9.4 | Toggle ArtHero on/off at runtime via CSS Loader → label overlay appears/disappears without Steam restart | `MutationObserver` on `<head>` reacts immediately |

---

## 10. Saved Filters

| # | Scenario | Expected |
|---|----------|----------|
| 10.1 | Save filter from `EditShelfModal > Filters > "Save current as filter"` → entry appears in QAM Saved Filters section | Section visible only when ≥1 filter saved |
| 10.2 | Apply saved filter to another shelf via the dropdown → group is **copied** (spread), not referenced by id | Deleting the saved filter later does not break the shelf using it |
| 10.3 | Rename saved filter inline → name updates in dropdown immediately | Persisted across reload |
| 10.4 | Delete saved filter → entry gone from QAM and from the apply dropdown | Section hides when list becomes empty |

---

## QA harness flags

Development builds read `DS_QA_*` environment variables at build time and
force a state, so a scenario can be checked without setting it up by hand.
Each `pnpm run qa:*` script sets one flag and runs `deploy:deck:hard` (a
development build plus a Steam restart). Flags without a script are set the
same way, and they combine:

```bash
DS_QA_SMART_SHELVES_FIXTURE=1 DS_QA_SAVED_FILTERS_FIXTURE=1 pnpm run deploy:deck:hard
```

Production builds ignore every flag. While any flag is active the plugin never
writes settings to the device, so fixture shelves cannot replace your own; what
you edit during the session lives in memory only. Deploy a normal build
afterwards (`pnpm run deploy:deck:hard`), otherwise the fixture stays on screen
and looks like lost shelves.

| Flag | Script | Effect |
|------|--------|--------|
| `DS_QA_FORCE_FIRST_RUN` | `qa:first-run` | Empty shelf list and plugin disabled: the first-run banner |
| `DS_QA_FRESH_INSTALL` | `qa:fresh-install` | A fresh install as the first-run flow sees it: master toggle off, no shelves, tour not seen, no setup applied. The tour's closing choice opens the setup wizard |
| `DS_QA_FORCE_QAM_ERROR` | `qa:qam-error` | Throws while rendering the Quick Access panel: its error boundary |
| `DS_QA_FORCE_SHELF_ERROR` | `qa:shelf-error` | Throws while rendering the Home shelves: the Home error boundary |
| `DS_QA_FORCE_HOME_CRASH` | `qa:home-crash` | The same throw under its own flag |
| `DS_QA_FORCE_REPLACE_FAILED` | `qa:replace-failed` | The Recents-replacement failure banner in the Quick Access panel |
| `DS_QA_FORCE_ALL_SHELVES_HIDE_RECENTS` | `qa:all-shelves-hide-recents` | Six test shelves with `hideRecents=true` |
| `DS_QA_FORCE_ALL_SHELVES_SHOW_RECENTS` | `qa:all-shelves-show-recents` | The same shelves with `hideRecents=false` |
| `DS_QA_FORCE_ALL_SHELVES_HIDE_HOME_TABS` | `qa:all-shelves-hide-home-tabs` | The same shelves with `hideHomeTabs=true` |
| `DS_QA_FORCE_ALL_SHELVES_SHOW_HOME_TABS` | `qa:all-shelves-show-home-tabs` | The same shelves with `hideHomeTabs=false` |
| `DS_QA_FORCE_HIDDEN_SHELF` | `qa:hidden-shelf` | Adds a hidden shelf to the test shelves |
| `DS_QA_SMART_SHELVES_FIXTURE` | `qa:smart-fixture` | Four smart shelves (Quick play, Roulette, Recently played, Spare time) |
| `DS_QA_SMART_SURPRISE_ME` | `qa:surprise-me` | Turns on Surprise Me so the daily pick runs |
| `DS_QA_SAVED_FILTERS_FIXTURE` | `qa:saved-filters-fixture` | Saved filters, so the Saved Filters section shows |
| `DS_QA_STRESS_FIXTURE` | `qa:stress-fixture` | 30 regular and 17 smart shelves at the 50-card limit, with varied sources and display options |
| `DS_QA_UPDATE_AVAILABLE` | `qa:update-available` | A fake `99.0.0` release, so the update banner shows without a network call |
| `DS_QA_FORCE_TABMASTER` | — | `present` / `absent` overrides TabMaster detection |
| `DS_QA_FORCE_UNIFIDECK` | — | `present` / `absent` overrides UnifiDeck detection |
| `DS_QA_FORCE_NONSTEAMBADGES` | — | `present` / `absent` overrides Non-Steam Badges detection |

