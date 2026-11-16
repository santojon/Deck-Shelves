import { rootVar } from "../detect";
import type { ThemeAdapter } from "../types";

// Locks Home to the viewport height and pins the native recents grid to the bottom.
export const slhTheme: ThemeAdapter = {
  id: "switch-like-home",
  label: "Switch Like Home",
  scope: "document",
  flags: ["data-ds-slh"],
  read: (doc) => ({ "data-ds-slh": rootVar(doc, "--SLH-lift-hero-px") !== "" ? "1" : null }),
  css: () => `
    [data-ds-slh="1"] #deck-shelves-home-root {
      height: calc(100vh - 56px);
      position: relative;
      overflow: visible;
    }
    [data-ds-slh="1"] .deck-shelves-root {
      height: 100%;
      position: relative;
    }
    [data-ds-slh="1"] .deck-shelves-root > .ds-shelf { flex-shrink: 0; }
    [data-ds-slh="1"] .deck-shelves-root > .ds-shelf[data-ds-recents-slot="true"] + .ds-shelf { margin-top: calc(100vh - 56px); }
    [data-ds-slh="1"] .ds-shelf[data-ds-recents-slot="true"] {
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: auto !important;
      padding-top: calc(var(--SLH-lift-hero-px, 0px) + 6px);
    }
    [data-ds-slh="1"] .ds-shelf[data-ds-recents-slot="true"] [data-ds-per-shelf-hero="true"] { top: auto !important; bottom: 0 !important; height: calc(100vh + 56px) !important; }
    [data-ds-slh="1"] .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] {
      display: flex !important;
      flex-direction: column;
    }

    [data-ds-slh="1"] [data-ds-native-recents="true"] .ReactVirtualized__Grid[aria-label="grid"] {
      position: relative !important;
      bottom: auto !important;
      top: auto !important;
    }
  `,
};
