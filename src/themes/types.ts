import type { ShelfStylesheetCtx } from "../components/shelf/shelfStylesheetTemplate";

/* One third-party look (a CSS Loader theme, or a native layout such as Big
   Art) = one adapter: how to detect it, which `data-ds-*` flags it owns and
   the CSS that mirrors it on our shelves. The registry (./registry.ts) runs
   every adapter; nothing else needs to know a theme by name. */
export type ThemeFlagValue = boolean | string | null | undefined;

/* "root" adapters read the injected theme styles and stamp `.deck-shelves-root`
   (re-read whenever a Steam <head> changes); "document" adapters read computed
   variables on <html> and stamp <html> itself (re-read on the style poll). */
export type ThemeScope = "root" | "document";

export type ThemeAdapter = {
  id: string;
  /** Label shown in diagnostics and bug reports. */
  label: string;
  scope: ThemeScope;
  /** Attributes this adapter owns; all of them are cleared on unmount. */
  flags: readonly string[];
  /** Flags also mirrored onto <html> of every Steam document (rules that must reach outside the root). */
  htmlFlags?: readonly string[];
  /** Stamp every `.deck-shelves-root` in every Steam document, not only the mounted one. */
  allRoots?: boolean;
  /** Each owned flag's value: true → "true", a string → as is, anything else → attribute removed. */
  read(doc: Document): Record<string, ThemeFlagValue>;
  /** CSS custom properties to set on <html> (document scope); null removes one. */
  vars?: (doc: Document) => Record<string, string | null>;
  /** CSS mirrored onto our shelves, appended to the shelf stylesheet in registry order. */
  css?: (ctx: ShelfStylesheetCtx) => string;
};

export function flagIsOn(v: ThemeFlagValue): boolean {
  return v === true || (typeof v === "string" && v !== "");
}

export function anyFlagOn(values: Record<string, ThemeFlagValue>): boolean {
  return Object.values(values).some(flagIsOn);
}
