import { getAllStyleText } from "../detect";
import type { ThemeAdapter } from "../types";

// Our cards have no download arrow, so the stylesheet mirrors the dimming.
export function isGrayUninstalledActive(): boolean {
  return /--uninstalled-grayscale\s*:/i.test(getAllStyleText());
}

export const grayUninstalledTheme: ThemeAdapter = {
  id: "gray-uninstalled",
  label: "Gray Uninstalled",
  scope: "root",
  flags: ["data-ds-theme-gray-uninstalled"],
  read: () => ({ "data-ds-theme-gray-uninstalled": isGrayUninstalledActive() }),
  css: () => `
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-gray-uninstalled="true"] .ds-card[data-ds-installed="false"][data-ds-installed] .ds-card-art { opacity: var(--uninstalled-opacity, 0.5) !important; filter: brightness(var(--ds-card-dim, 0.9)) grayscale(var(--uninstalled-grayscale, 100%)) !important; }
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-gray-uninstalled="true"] .ds-card[data-ds-installed="false"][data-ds-installed]:is(:focus, .gpfocus, :hover) .ds-card-art { opacity: var(--uninstalled-focus-opacity, 0.9) !important; filter: brightness(1) grayscale(var(--uninstalled-focus-grayscale, 90%)) !important; }
  `,
};
