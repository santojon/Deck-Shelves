import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { getRuntimeClassMap } from "../../core/webpackCompat";
import { cssLoaderStyleTexts } from "../detect";
import type { ThemeAdapter } from "../types";

// Used until the runtime class map is populated.
const FALLBACK_HERO_INNER = "_30D-80Lg-Luy-KxOumBlaY";

function textMatchesArtHero(text: string, heroToken: string): boolean {
  return text.includes(heroToken) && /mask-image/i.test(text);
}

export function isArtHeroActive(): boolean {
  let heroToken = FALLBACK_HERO_INNER;
  try {
    const doc = getPreferredSteamDocument();
    const map = doc ? getRuntimeClassMap(doc) : null;
    if (map?.heroInner && typeof map.heroInner === "string") heroToken = map.heroInner;
  } catch {}
  return cssLoaderStyleTexts().some((text) => textMatchesArtHero(text, heroToken));
}

export const artHeroTheme: ThemeAdapter = {
  id: "art-hero",
  label: "ArtHero",
  scope: "root",
  flags: ["data-ds-hero-label"],
  read: () => ({ "data-ds-hero-label": isArtHeroActive() }),
};
