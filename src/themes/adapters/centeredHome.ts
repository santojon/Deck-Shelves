import { rootVar } from "../detect";
import type { ThemeAdapter } from "../types";

// The theme's padding variable name varies between versions.
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
    [data-ds-centered="1"] #deck-shelves-home-root,
    [data-ds-centered="1"] .deck-shelves-root {
      padding-left: var(--ds-centered-pad, var(--center-home-padding, 0px));
      padding-right: var(--ds-centered-pad, var(--center-home-padding, 0px));
      box-sizing: border-box;
    }
    [data-ds-centered="1"] .ds-shelf .ds-row-scroll {
      padding-left: 0 !important;
    }
    [data-ds-centered="1"] .ds-shelf .ds-shelf-title {
      padding-left: 0 !important;
    }
  `,
};
