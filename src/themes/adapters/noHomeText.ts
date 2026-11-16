import { getAllStyleText, matchesAny, tokensForKey } from "../detect";
import type { ThemeAdapter } from "../types";

function isNoHomeTextActive(): boolean {
  const text = getAllStyleText();
  const labelTokens = tokensForKey("nativeCarouselGameLabel", "basicgamecarousel_CarouselGameLabel");
  // Fallback for builds where the class map key isn't populated yet.
  labelTokens.push("_3CKjiR7-fuBPyKZKpPI6UZ");
  return matchesAny(text, labelTokens, "visibility\\s*:\\s*hidden");
}

export const noHomeTextTheme: ThemeAdapter = {
  id: "no-home-text",
  label: "No Home Text",
  scope: "root",
  flags: ["data-ds-theme-no-home-text"],
  read: () => ({ "data-ds-theme-no-home-text": isNoHomeTextActive() }),
  css: () => `
    [data-ds-force-themes="true"][data-ds-theme-no-home-text="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-card-label,
    [data-ds-force-themes="true"][data-ds-theme-no-home-text="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-promoted-hero-label {
      visibility: hidden !important;
    }
  `,
};
