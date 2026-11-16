import { rootVar } from "../detect";
import type { ThemeAdapter } from "../types";

export const obsidianTheme: ThemeAdapter = {
  id: "obsidian",
  label: "Obsidian",
  scope: "document",
  flags: ["data-ds-obsidian"],
  read: (doc) => ({ "data-ds-obsidian": rootVar(doc, "--obsidian-main-color") !== "" ? "1" : null }),
  css: () => `
    [data-ds-obsidian="1"] .deck-shelves-root:not([data-ds-hero-label="true"]) .ds-shelf[data-ds-hero-enabled="true"] .ds-per-shelf-hero-img {
      filter: grayscale(1) contrast(1.1);
    }
  `,
};
