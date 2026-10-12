import { rootVar } from "../detect";
import type { ThemeAdapter } from "../types";

/* Switch Like Home locks the home to viewport height and pins the native
   recents grid to the bottom of that block. Detected via its own
   `--SLH-lift-hero-px` variable on <html>; the shim mirrors the contract on
   our promoted shelf (validated live 2026-10-10). */
export const slhTheme: ThemeAdapter = {
  id: "switch-like-home",
  label: "Switch Like Home",
  scope: "document",
  flags: ["data-ds-slh"],
  read: (doc) => ({ "data-ds-slh": rootVar(doc, "--SLH-lift-hero-px") !== "" ? "1" : null }),
  css: () => `
    /* ── SLH alt C shim (data-ds-slh="1") ─────────────────────────────────
       SLH pins the native recents grid to the bottom of a viewport-height,
       overflow-hidden container; with native recents hidden our promoted shelf
       sits outside it, so mirror the contract: root at viewport height, the
       promoted shelf absolute at its bottom. Validated live 2026-10-10: the
       other shelves must NOT flex-shrink into that fixed-height panel (they
       collapsed to 0–108 px) and must start below the viewport block. */
    [data-ds-slh="1"] #deck-shelves-home-root {
      height: calc(100vh - 56px);
      position: relative;
      overflow: visible;
    }
    [data-ds-slh="1"] .deck-shelves-root {
      height: 100%;
      position: relative;
    }
    [data-ds-slh="1"] .deck-shelves-root > .ds-shelf { flex-shrink: 0; }
    [data-ds-slh="1"] .deck-shelves-root > .ds-shelf[data-ds-recents-slot="true"] + .ds-shelf { margin-top: calc(100vh - 56px); }
    [data-ds-slh="1"] .ds-shelf[data-ds-recents-slot="true"] {
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: auto !important;
      /* SLH pads the grid top by the lift amount so the hero image above
         it doesn't overlap the card row. Mirror via the same variable. */
      padding-top: calc(var(--SLH-lift-hero-px, 0px) + 6px);
    }
    /* SLH pins the promoted shelf (auto height) to the bottom of the block, so
       the top-relative -56px hero pull started ~60px below the header (black
       band). Anchor the art to the shelf bottom, viewport + header tall. */
    [data-ds-slh="1"] .ds-shelf[data-ds-recents-slot="true"] [data-ds-per-shelf-hero="true"] { top: auto !important; bottom: 0 !important; height: calc(100vh + 56px) !important; }
    /* SLH + ArtHero: the ArtHero flex column still applies inside the
       absolute-positioned promoted shelf. */
    [data-ds-slh="1"] .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] {
      display: flex !important;
      flex-direction: column;
    }

    /* SLH's absolute/bottom:0 recents grid anchors to a 0px-height parent,
       pushing the grid above the viewport. Scoped to the real sibling
       (marked [data-ds-native-recents] by HomeInject) — the bare aria-label
       alone also matches unrelated grids (e.g. a Big Art hero carousel). */
    [data-ds-slh="1"] [data-ds-native-recents="true"] .ReactVirtualized__Grid[aria-label="grid"] {
      position: relative !important;
      bottom: auto !important;
      top: auto !important;
    }
  `,
};
