import { getAllStyleText, matchesAny, tokensForKey } from "../detect";
import type { ThemeAdapter } from "../types";

export function isNoHomeTextActive(): boolean {
  const text = getAllStyleText();
  const labelTokens = tokensForKey("nativeCarouselGameLabel", "basicgamecarousel_CarouselGameLabel");
  // Also include the observed hashed token directly as a safety net for
  // builds where the classmap key isn't populated yet.
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
    /* No Home Text — only engages under force (per user spec). */
    [data-ds-force-themes="true"][data-ds-theme-no-home-text="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-card-label,
    [data-ds-force-themes="true"][data-ds-theme-no-home-text="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-promoted-hero-label {
      visibility: hidden !important;
    }
  `,
};
