# Deck Shelves — Manual QA Scenarios

Manual test checklist for regression testing on a real Steam Deck (SteamOS Stable or Beta).

## Prerequisites

- Decky Loader installed
- Plugin deployed (`pnpm run deploy:deck`)
- At least 5 games in the library, some favorited, some installed

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
| 2.4 | Hide shelf via ellipsis → shelf disappears from Home | Shelf shows grayed in QAM |
| 2.5 | Show shelf via ellipsis → shelf reappears on Home | Shelf active again |
| 2.6 | Delete shelf → confirmation modal; confirm → removed | Shelf gone from QAM and Home |
| 2.7 | Move shelf up/down via QAM → order changes on Home | Order matches QAM |
| 2.8 | Edit shelf title → title updates on Home row header | New title rendered |
| 2.9 | Edit shelf limit → card count changes | Number of cards changes |

---

## 3. Navigation (D-pad)

| # | Scenario | Expected |
|---|----------|----------|
| 3.1 | D-pad DOWN from last item in "Recently Played" → first shelf card gains focus | Bridge fires correctly |
| 3.2 | D-pad UP from first shelf card → focus returns to native section above | UP bridge fires correctly |
| 3.3 | D-pad LEFT/RIGHT at shelf edge → no wrap-around to another app | Edge blocked |
| 3.4 | `hideHomeTabs=true` + D-pad DOWN from last shelf → focus stops; no wrap to first shelf | **Bug A fix** |
| 3.5 | `hideHomeTabs=false` + at last item of native tab content + D-pad DOWN → focus stops | **Bug B fix** |
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

---

## 5. Hide Recents

| # | Scenario | Expected |
|---|----------|----------|
| 5.1 | `hideRecents=true` → native Recently Played section hidden | Section not visible on Home |
| 5.2 | `hideRecents=true` + `heroBackground=true` → focused card shows background art | Hero art visible |
| 5.3 | `hideRecents=true` + `recentsReplaceSource=true` → first shelf injected into native recents DOM | First shelf uses native styles |
| 5.4 | `hideRecents=false` → sub-toggles (hero, replace-source) hidden in QAM | Only visible when hideRecents is on |

---

## 6. Hide Home Tabs

| # | Scenario | Expected |
|---|----------|----------|
| 6.1 | `hideHomeTabs=true` → Novidades/Amigos/Recomendados tab bar hidden | Tabs not visible |
| 6.2 | `hideHomeTabs=false` → tabs visible and navigable | Tabs work normally |
| 6.3 | `hideHomeTabs=true` → D-pad DOWN from last shelf stops (Bug A) | Focus does not wrap |

---

## 7. Smart Shelves

| # | Scenario | Expected |
|---|----------|----------|
| 7.1 | `smartShelvesEnabled=false` → smart shelves section not shown in QAM | Section hidden |
| 7.2 | `enabled=false` → smart shelves toggle not shown at all | Even toggle hidden |
| 7.3 | Add smart shelf → modal with 15 templates opens | SmartShelfTemplateModal |
| 7.4 | Smart shelf with no results → not rendered on Home | Shelf invisible (null render) |
| 7.5 | Smart shelf with results → rendered on Home between standard shelves | Appears in correct position |
| 7.6 | `smartShelvesAtBottom=true` → smart shelves appear below standard shelves | Order respected |
| 7.7 | `surpriseMe=true` → manual list hidden, system picks templates | No manual list in QAM |
| 7.8 | `surpriseMe=true` + count=0 → system decides count | Variable shelf count |
| 7.9 | Daily Pick shelf → same result throughout the day | Stable within UTC day |

---

## 8. Import / Export

| # | Scenario | Expected |
|---|----------|----------|
| 8.1 | Export → JSON file saved to Downloads | Valid JSON, all shelves included |
| 8.2 | Import valid JSON → shelves replaced with imported set | QAM and Home reflect import |
| 8.3 | Import `assets/import/screenshots-en.json` → 3 standard + 1 hidden + 3 smart shelves | Correct count and titles |
| 8.4 | Import JSON with unknown fields → no crash, extra fields ignored | Graceful parse via passthrough |
| 8.5 | Reset All → confirmation modal; confirm → settings cleared | QAM empty, Home clean |

---

## 9. Screenshot Automation

| # | Scenario | Expected |
|---|----------|----------|
| 9.1 | `pnpm run screenshots` with 3+ shelves → all PNGs generated in `assets/screenshots/` | No errors, correct file names |
| 9.2 | New screenshots: `smart-shelves-qam.png` captured | QAM smart shelves section visible |
| 9.3 | New screenshots: `smart-shelf-modal.png` captured | Template picker modal visible |

---

## 10. CSS Themes (CDP required)

Deferred to Sprint 6 (ArtHero aprofundamento).

| # | Scenario | Expected |
|---|----------|----------|
| 10.1 | ArtHero active + `hideRecents=false` → our shelves not affected by ArtHero | Own DS styling preserved |
| 10.2 | ArtHero active + `hideRecents=true` + `recentsReplaceSource=false` → first shelf adopts ArtHero styles | Visual parity with native recents |
