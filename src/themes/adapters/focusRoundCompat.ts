import { getAllStyleText } from "../detect";
import type { ThemeAdapter } from "../types";

/* "Focus Highlight Color" theme, Round Compatibility patch: it removes the
   native card focus indicator, so our cards drop their focus shadow and the
   native FocusRing is hidden while it is on. */
export function isFocusRoundCompatActive(): boolean {
  const text = getAllStyleText();
  return /appportrait_blinker_[\w-]*flangrande/i.test(text)
    || /focusring_blinker_[\w-]*flangrande/i.test(text);
}

export const focusRoundCompatTheme: ThemeAdapter = {
  id: "focus-round-compat",
  label: "Focus Highlight Color (Round Compatibility)",
  scope: "root",
  flags: ["data-ds-theme-focus-round-compat"],
  // Mirrored to <html> so the FocusRing suppression rule can reach the
  // FocusRing element (which sits outside .deck-shelves-root).
  htmlFlags: ["data-ds-theme-focus-round-compat"],
  read: () => ({ "data-ds-theme-focus-round-compat": isFocusRoundCompatActive() }),
  css: () => `
    /* Suppress our focus drop shadow when the "Focus Highlight Color" theme's
       Round Compatibility patch is on — that patch removes the native card
       focus indicator, so DS cards should match. Spec needs the #id prefix
       to beat the (1,2,0) original focus rule. */
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:focus,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card.gpfocus,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:hover {
      box-shadow: none !important;
    }
    /* Also kill the Game Cover Shine ::after animation/opacity under the same
       flag — that pseudo paints over the card on focus and isn't controlled
       by the Round Compat patch on its own. */
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:focus::after,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card.gpfocus::after,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:hover::after {
      opacity: 0 !important;
      animation: none !important;
    }
    /* Round Compat ON: hide the FocusRing entirely. Gated on the html-level
       flag so the rule can reach the FocusRing's subtree (which sits outside
       .deck-shelves-root). Hash kept in sync with classmap entry for
       FocusRing — if a Steam release breaks this, update the class below. */
    html[data-ds-theme-focus-round-compat="true"] ._1wPplsegQqCoe06wXPhzKT {
      animation: none !important;
      border: none !important;
      outline: none !important;
      opacity: 0 !important;
    }
  `,
};
