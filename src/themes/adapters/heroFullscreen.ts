import { getAllStyleText, matchesAny, tokensForKey } from "../detect";
import { isBigArtModeActive } from "./bigArt";
import type { ThemeAdapter } from "../types";

function isHeroFullscreenActive(): boolean {
  // Native Big Art has no injected stylesheet to scan (not a CSS Loader
  // theme) but lays its hero out full-viewport the same way — confirmed
  // live the compact treatment left the promoted shelf below the fold.
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
    /* Hero Fullscreen: promoted shelf fills viewport, flex-end bottom-anchors title/row (was SLH-only, left ArtHero/Big Art floating). */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"] .ds-shelf[data-ds-recents-slot="true"] {
      height: 100vh !important; --ds-hero-top: 0px; --ds-hero-h: 100vh;
      display: flex !important; flex-direction: column; justify-content: flex-end;
    }
    /* ArtHero header-band pull; Big Art excluded (no such clearance there). */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"]:not([data-ds-theme-big-art="true"])[data-ds-recents-hidden="true"] > .ds-shelf[data-ds-recents-slot="true"]:first-child {
      margin-top: -56px;
    }
    /* FORCE: clean page-per-shelf (no margin, no hero fade). */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-force-themes="true"] .ds-shelf { margin-bottom: 0 !important; }
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-force-themes="true"] .ds-shelf[data-ds-recents-slot="true"] [data-ds-per-shelf-hero="true"] { mask-image: none !important; -webkit-mask-image: none !important; }
  `,
};
