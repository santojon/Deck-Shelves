import { rootVar } from "../detect";
import type { ThemeAdapter } from "../types";

// Obsidian theme: mirror its grayscale+contrast onto per-shelf hero images.
export const obsidianTheme: ThemeAdapter = {
  id: "obsidian",
  label: "Obsidian",
  scope: "document",
  flags: ["data-ds-obsidian"],
  read: (doc) => ({ "data-ds-obsidian": rootVar(doc, "--obsidian-main-color") !== "" ? "1" : null }),
  css: () => `
    /* Obsidian without ArtHero: apply grayscale+contrast to per-shelf hero
       images so they match the first shelf. When ArtHero is also active
       (data-ds-hero-label set on .deck-shelves-root), the first shelf shows
       colour — so skip grayscale on all per-shelf heroes to match. */
    [data-ds-obsidian="1"] .deck-shelves-root:not([data-ds-hero-label="true"]) .ds-shelf[data-ds-hero-enabled="true"] .ds-per-shelf-hero-img {
      filter: grayscale(1) contrast(1.1);
    }
  `,
};
