import { getAllStyleText } from "../detect";
import type { ThemeAdapter } from "../types";

// The theme removes the native focus indicator, so ours goes too.
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
  // The FocusRing sits outside our root, so the flag goes on <html>.
  htmlFlags: ["data-ds-theme-focus-round-compat"],
  read: () => ({ "data-ds-theme-focus-round-compat": isFocusRoundCompatActive() }),
  // The FocusRing class hash below comes from the class map; a Steam release that renames it needs it here too.
  css: () => `
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:focus,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card.gpfocus,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:hover {
      box-shadow: none !important;
    }
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:focus::after,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card.gpfocus::after,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:hover::after {
      opacity: 0 !important;
      animation: none !important;
    }
    html[data-ds-theme-focus-round-compat="true"] ._1wPplsegQqCoe06wXPhzKT {
      animation: none !important;
      border: none !important;
      outline: none !important;
      opacity: 0 !important;
    }
  `,
};
