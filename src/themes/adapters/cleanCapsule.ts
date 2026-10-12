import { getAllStyleText, matchesAny, tokensForKey } from "../detect";
import type { ThemeAdapter } from "../types";

/* Clean Library Capsule restyles the native text-box capsule (games without
   art) per enabled part; each part is a separate rule on that capsule class,
   so report the enabled ones as tokens the stylesheet can key on. */
const CLEAN_CAPSULE_PARTS: Array<[string, string]> = [
  ["disable", "display\\s*:\\s*none"],
  ["bgimg", "background-image\\s*:\\s*var\\(--g1-bg-image"],
  ["bg", "background\\s*:\\s*var\\(--g1-bg-color"],
  ["bold", "font-weight\\s*:\\s*bold"],
  ["outline", "text-shadow\\s*:"],
  ["color", "color\\s*:\\s*var\\(--g1-font-color"],
];

export function getCleanCapsuleFeatures(): string[] {
  const text = getAllStyleText();
  const tokens = tokensForKey("textBoxCarouselContents", "basicgamecarousel_TextBoxCarouselContents");
  tokens.push("_3bvCHoWj4rDdZr3mnKlXaf");
  return CLEAN_CAPSULE_PARTS.filter(([, suffix]) => matchesAny(text, tokens, suffix)).map(([name]) => name);
}

// 20 stacked zero-offset shadows approximate the theme's text stroke.
const OUTLINE_SHADOW = Array(20).fill("0 0 var(--g1-stroke-size, 1px) var(--g1-stroke-color, #000)").join(", ");

export const cleanCapsuleTheme: ThemeAdapter = {
  id: "clean-library-capsule",
  label: "Clean Library Capsule",
  scope: "root",
  flags: ["data-ds-theme-clc"],
  read: () => ({ "data-ds-theme-clc": getCleanCapsuleFeatures().join(" ") }),
  css: () => `
    /* Clean Library Capsule — mirror its text-capsule parts (tokens in data-ds-theme-clc) on our art-less text cards. */
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-clc] .ds-card--text .ds-card-text { opacity: 1 !important; }
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-clc~="bg"] .ds-card--text .ds-card-art { background: var(--g1-bg-color, #333333aa) !important; }
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-clc~="bgimg"] .ds-card--text .ds-card-art { background-image: var(--g1-bg-image) !important; background-size: cover !important; background-repeat: no-repeat !important; background-position: center !important; }
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-clc~="color"] .ds-card--text .ds-card-text { color: var(--g1-font-color, #fff); }
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-clc~="bold"] .ds-card--text .ds-card-text { font-weight: bold; }
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-clc~="outline"] .ds-card--text .ds-card-text { text-shadow: ${OUTLINE_SHADOW}; }
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-clc~="disable"] .ds-card--text .ds-card-text { display: none !important; }
  `,
};
