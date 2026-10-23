import { getAllStyleText, matchesAny, tokensForKey } from "../detect";
import type { ThemeAdapter } from "../types";

function isNoHeroGradientActive(): boolean {
  const text = getAllStyleText();
  const rootTokens = tokensForKey("heroRoot", "gamepadhomerecentgames_RecentGamesBackgroundContainer");
  const innerTokens = tokensForKey("heroInner", "gamepadhomerecentgames_RecentGamesBackgroundImages");
  const bgTokens = ["gamepadhomerecentgames_RecentGamesBackground"];
  return matchesAny(text, rootTokens, "(?:-webkit-)?mask-image\\s*:\\s*none")
    || matchesAny(text, innerTokens, "(?:-webkit-)?mask-image\\s*:\\s*none")
    || matchesAny(text, bgTokens, "(?:-webkit-)?mask-image\\s*:\\s*none")
    || matchesAny(text, bgTokens, "filter\\s*:\\s*brightness\\(\\s*100");
}

export const noHeroGradientTheme: ThemeAdapter = {
  id: "no-hero-gradient",
  label: "No Hero Gradient",
  scope: "root",
  flags: ["data-ds-theme-no-hero-gradient"],
  read: () => ({ "data-ds-theme-no-hero-gradient": isNoHeroGradientActive() }),
  css: () => `
    /* No Hero Gradient — strip mask/zoom on promoted heroes. */
    [data-ds-theme-no-hero-gradient="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-per-shelf-hero-img {
      mask-image: none !important;
      -webkit-mask-image: none !important;
      filter: none !important;
      opacity: 1 !important;
      animation: none !important;
    }
  `,
};
