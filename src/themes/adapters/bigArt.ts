import { getPreferredSteamDocument } from "../../runtime/steamHost";
import type { ThemeAdapter } from "../types";

// Steam's own Big Art beta layout, marked by a plain `BigArtMode` class.
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
  // The hero-fullscreen pull-up assumes clearance native Big Art doesn't have.
  flags: ["data-ds-theme-big-art"],
  read: () => ({ "data-ds-theme-big-art": isBigArtModeActive() }),
  // The bottom inset clears the button legend, which is outside the DOM (measured from a screenshot).
  // The slot's fixed height already leaves the art above the title, so the logo sits there in the flow
  // instead of reserving a band that would push the row off screen.
  css: () => `
    .deck-shelves-root[data-ds-theme-big-art="true"] .ds-shelf[data-ds-recents-slot="true"] {
      height: calc(100vh - 120px) !important;
      padding-top: 0 !important;
      --ds-hero-top: -56px; --ds-hero-h: 100vh;
    }
    .deck-shelves-root[data-ds-theme-big-art="true"] .ds-shelf[data-ds-recents-slot="true"] > .ds-shelf-logo-overlay {
      position: relative !important; top: auto !important; left: auto !important; right: auto !important;
      transform: none !important; flex: 0 1 auto; min-height: 0; margin: 0 24px 8px;
    }
    .deck-shelves-root[data-ds-theme-big-art="true"] .ds-shelf[data-ds-recents-slot="true"] > .ds-shelf-logo-overlay > img {
      min-height: 0;
    }
  `,
};
