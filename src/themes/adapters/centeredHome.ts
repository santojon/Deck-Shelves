import { rootVar } from "../detect";
import type { ThemeAdapter } from "../types";

// Centered Home shifts content into a centered column via a padding var whose
// name varies; copy the first present one into --ds-centered-pad.
const PADDING_VARS = [
  "--center-home-padding", "--centered-home-padding",
  "--center-home-padding-x", "--center-home-x",
  "--ch-padding", "--centered-padding",
];

function centeredPadding(doc: Document): string {
  for (const name of PADDING_VARS) {
    const v = rootVar(doc, name);
    if (v !== "") return v;
  }
  return "";
}

export const centeredHomeTheme: ThemeAdapter = {
  id: "centered-home",
  label: "Centered Home",
  scope: "document",
  flags: ["data-ds-centered"],
  read: (doc) => ({ "data-ds-centered": centeredPadding(doc) !== "" ? "1" : null }),
  vars: (doc) => { const v = centeredPadding(doc); return { "--ds-centered-pad": v !== "" ? v : null }; },
  css: () => `
    /* ── Centered Home shim (data-ds-centered="1") ─────────────────────────
       The Centered Home theme (by Morz) shifts the library home content into
       a centered column using a left padding defined by --center-home-padding.
       DS shelves sit in a portal outside that column and therefore stay
       full-width, not centered. We compensate by applying the same left-padding
       variable so DS shelves align with native content.

       NOTE: --center-home-padding name needs verification on a real Deck with
       the theme active. If the theme uses a different property name, update the
       detection above and this rule together. */
    [data-ds-centered="1"] #deck-shelves-home-root,
    [data-ds-centered="1"] .deck-shelves-root {
      padding-left: var(--ds-centered-pad, var(--center-home-padding, 0px));
      padding-right: var(--ds-centered-pad, var(--center-home-padding, 0px));
      box-sizing: border-box;
    }
    /* The row's own left padding (2.8vw, inline-styled) compounds with the
       container padding above and offsets cards too far right. Override to 0
       so cards sit flush with the centered native column. */
    [data-ds-centered="1"] .ds-shelf .ds-row-scroll {
      padding-left: 0 !important;
    }
    [data-ds-centered="1"] .ds-shelf .ds-shelf-title {
      padding-left: 0 !important;
    }
  `,
};
