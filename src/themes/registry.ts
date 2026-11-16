import type { ShelfStylesheetCtx } from "../components/shelf/shelfStylesheetTemplate";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../runtime/steamHost";
import { type ThemeAdapter, type ThemeFlagValue, anyFlagOn } from "./types";
import { slhTheme } from "./adapters/slh";
import { centeredHomeTheme } from "./adapters/centeredHome";
import { obsidianTheme } from "./adapters/obsidian";
import { focusRoundCompatTheme } from "./adapters/focusRoundCompat";
import { tiltedHomeTheme } from "./adapters/tiltedHome";
import { artHeroTheme } from "./adapters/artHero";
import { noHeroGradientTheme } from "./adapters/noHeroGradient";
import { heroFullscreenTheme } from "./adapters/heroFullscreen";
import { bigArtTheme } from "./adapters/bigArt";
import { grayUninstalledTheme } from "./adapters/grayUninstalled";
import { cleanCapsuleTheme } from "./adapters/cleanCapsule";
import { noHomeTextTheme } from "./adapters/noHomeText";

// Order matters: adapter rules are appended to the stylesheet in this order.
export const THEME_ADAPTERS: readonly ThemeAdapter[] = [
  slhTheme, centeredHomeTheme, obsidianTheme,
  focusRoundCompatTheme, tiltedHomeTheme,
  artHeroTheme, noHeroGradientTheme, heroFullscreenTheme, bigArtTheme,
  grayUninstalledTheme, cleanCapsuleTheme, noHomeTextTheme,
];

function steamDocs(): Document[] {
  const docs: Document[] = [];
  const seen = new Set<Document>();
  const add = (d: Document | null | undefined) => {
    if (!d || seen.has(d)) return;
    seen.add(d);
    docs.push(d);
  };
  try { if (typeof document !== "undefined") add(document); } catch {}
  try { add(getPreferredSteamDocument()); } catch {}
  try { for (const d of getAllSteamDocuments()) add(d); } catch {}
  return docs;
}

function setAttr(el: Element, attr: string, v: ThemeFlagValue): void {
  if (v === true) el.setAttribute(attr, "true");
  else if (typeof v === "string" && v !== "") el.setAttribute(attr, v);
  else el.removeAttribute(attr);
}

function stampRoot(adapter: ThemeAdapter, root: HTMLElement, values: Record<string, ThemeFlagValue>): void {
  const docs = adapter.allRoots || adapter.htmlFlags ? steamDocs() : [];
  for (const flag of adapter.flags) {
    const v = values[flag];
    setAttr(root, flag, v);
    if (adapter.allRoots) {
      for (const d of docs) for (const r of Array.from(d.querySelectorAll(".deck-shelves-root"))) setAttr(r, flag, v);
    }
    if (adapter.htmlFlags?.includes(flag)) for (const d of docs) setAttr(d.documentElement, flag, v);
  }
}

export function applyRootThemeFlags(root: HTMLElement): void {
  const doc = root.ownerDocument;
  for (const a of THEME_ADAPTERS) {
    if (a.scope !== "root") continue;
    try { stampRoot(a, root, a.read(doc)); } catch {}
  }
}

export function clearRootThemeFlags(root: HTMLElement): void {
  for (const a of THEME_ADAPTERS) {
    if (a.scope !== "root") continue;
    try { stampRoot(a, root, {}); } catch {}
  }
}

export function applyDocumentThemeFlags(doc: Document): void {
  for (const a of THEME_ADAPTERS) {
    if (a.scope !== "document") continue;
    try {
      const values = a.read(doc);
      for (const flag of a.flags) setAttr(doc.documentElement, flag, values[flag]);
      const vars = a.vars?.(doc);
      if (!vars) continue;
      for (const [name, v] of Object.entries(vars)) {
        if (v == null) doc.documentElement.style.removeProperty(name);
        else doc.documentElement.style.setProperty(name, v);
      }
    } catch {}
  }
}

export function themeStylesheet(ctx: ShelfStylesheetCtx): string {
  return THEME_ADAPTERS.map((a) => (a.css ? a.css(ctx) : "")).join("\n");
}

export function activeThemeLabels(doc?: Document): string[] {
  let d: Document | null | undefined = doc;
  if (!d) { try { d = getPreferredSteamDocument(); } catch { d = null; } }
  if (!d && typeof document !== "undefined") d = document;
  const out: string[] = [];
  for (const a of THEME_ADAPTERS) {
    try { if (d && anyFlagOn(a.read(d))) out.push(a.label); } catch {}
  }
  return out;
}
