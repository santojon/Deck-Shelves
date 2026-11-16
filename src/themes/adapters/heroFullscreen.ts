import { getAllStyleText, matchesAny, tokensForKey } from "../detect";
import { isBigArtModeActive } from "./bigArt";
import type { ThemeAdapter } from "../types";

function isHeroFullscreenActive(): boolean {
  // Native Big Art has no stylesheet to scan but lays the hero out full-viewport too.
  if (isBigArtModeActive()) return true;
  const text = getAllStyleText();
  const sectionTokens = tokensForKey("shelfSection", "gamepadhomerecentgames_RecentGamesInnerContainer");
  const rootTokens = tokensForKey("heroRoot", "gamepadhomerecentgames_RecentGamesBackgroundContainer");
  const innerTokens = tokensForKey("heroInner", "gamepadhomerecentgames_RecentGamesBackgroundImages");
  return matchesAny(text, sectionTokens, "height\\s*:\\s*100vh")
    || matchesAny(text, rootTokens, "height\\s*:\\s*100vh")
    || matchesAny(text, innerTokens, "height\\s*:\\s*100vh");
}

export const heroFullscreenTheme: ThemeAdapter = {
  id: "hero-fullscreen",
  label: "Hero Fullscreen",
  scope: "root",
  flags: ["data-ds-theme-hero-fullscreen"],
  read: () => ({ "data-ds-theme-hero-fullscreen": isHeroFullscreenActive() }),
  css: () => `
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"] .ds-shelf[data-ds-recents-slot="true"] {
      height: 100vh !important; --ds-hero-top: 0px; --ds-hero-h: 100vh;
      display: flex !important; flex-direction: column; justify-content: flex-end;
    }
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"]:not([data-ds-theme-big-art="true"])[data-ds-recents-hidden="true"] > .ds-shelf[data-ds-recents-slot="true"]:first-child {
      margin-top: -56px;
    }
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-force-themes="true"] .ds-shelf { margin-bottom: 0 !important; }
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-force-themes="true"] .ds-shelf[data-ds-recents-slot="true"] [data-ds-per-shelf-hero="true"] { mask-image: none !important; -webkit-mask-image: none !important; }
  `,
};
