import type { ShelfStylesheetCtx } from "../components/shelf/shelfStylesheetTemplate";

export type ThemeFlagValue = boolean | string | null | undefined;

// Root adapters re-read on Steam <head> changes; document adapters on the style poll.
type ThemeScope = "root" | "document";

export type ThemeAdapter = {
  id: string;
  label: string;
  scope: ThemeScope;
  flags: readonly string[];
  htmlFlags?: readonly string[];
  allRoots?: boolean;
  // true → "true", a string as is, anything else removes the attribute.
  read(doc: Document): Record<string, ThemeFlagValue>;
  vars?: (doc: Document) => Record<string, string | null>;
  css?: (ctx: ShelfStylesheetCtx) => string;
};

function flagIsOn(v: ThemeFlagValue): boolean {
  return v === true || (typeof v === "string" && v !== "");
}

export function anyFlagOn(values: Record<string, ThemeFlagValue>): boolean {
  return Object.values(values).some(flagIsOn);
}
