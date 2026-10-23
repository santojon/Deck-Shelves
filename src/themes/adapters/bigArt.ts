import { getPreferredSteamDocument } from "../../runtime/steamHost";
import type { ThemeAdapter } from "../types";

/* Unlike the CSS Loader themes, this isn't a third-party style — it's Steam's
   own native Big Art beta home layout (SteamOS/Deck beta, confirmed live
   2026-09-28: a literal, non-hashed `BigArtMode` class on an ancestor of the
   native recents hero). Same visual family as ArtHero (full hero art + title
   overlay), so it drives the same hero-label treatment. */
export function isBigArtModeActive(): boolean {
  try {
    const doc = getPreferredSteamDocument();
    return !!doc?.querySelector(".BigArtMode");
  } catch { return false; }
}

export const bigArtTheme: ThemeAdapter = {
  id: "big-art",
  label: "Big Art",
  scope: "root",
  /* Separate from hero-fullscreen: some of its CSS (the ArtHero-tuned -56px
     pull-up) assumes ArtHero's own native clearance under the header — native
     Big Art doesn't have that same clearance, so the same pull crowds the
     shelf title into the icon row there. */
  flags: ["data-ds-theme-big-art"],
  read: () => ({ "data-ds-theme-big-art": isBigArtModeActive() }),
  css: () => `
    /* Big Art: BOX shrinks by the top +56 (icon clearance) AND a further ~64 at the bottom (the button-legend overlay, outside the DOM — measured from a live screenshot, not a hard constant) so card labels clear it; the ART still bleeds the full height, since native's own hero runs behind both bars. */
    .deck-shelves-root[data-ds-theme-big-art="true"] .ds-shelf[data-ds-recents-slot="true"] {
      height: calc(100vh - 120px) !important;
      --ds-hero-top: -56px; --ds-hero-h: 100vh;
    }
  `,
};
