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
  css: () => `
    .deck-shelves-root[data-ds-theme-big-art="true"] .ds-shelf[data-ds-recents-slot="true"] {
      height: calc(100vh - 120px) !important;
      --ds-hero-top: -56px; --ds-hero-h: 100vh;
    }
  `,
};
