import { devStamp } from "../../runtime/devStamps";
import { focusElement, focusElementAuto } from "../../core/focusRestore";

export const NATIVE_RECENTS_ID = "__ds_native_recents__";

function getClassMap(): Record<string, string> {
  try {
    const g = globalThis as any;
    if (g?.__DS_CLASS_MAP && typeof g.__DS_CLASS_MAP === "object") return g.__DS_CLASS_MAP;
    if (globalThis.localStorage) {
      const raw = globalThis.localStorage.getItem("ds_class_map");
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function nativeCardSelectorSN(map: Record<string, string>): string {
  const cls = map.nativeCard;
  return cls
    ? `[class~="${cls}"]:not(.ds-card), a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)`
    : `a[href*="/library/app/"]:not(.ds-card), [data-appid]:not(.ds-card)`;
}

function collectNativeShelfCandidates(doc: Document, map: Record<string, string>): HTMLElement[] {
  const candidates: HTMLElement[] = [];
  const seen = new Set<HTMLElement>();
  const push = (cls?: string) => {
    if (!cls) return;
    try {
      doc.querySelectorAll<HTMLElement>(`[class~="${cls}"]`).forEach((el) => {
        if (!seen.has(el)) { seen.add(el); candidates.push(el); }
      });
    } catch {}
  };
  push(map.nativeShelfContainer);
  push(map.shelfSection);
  return candidates;
}

function isNativeCandidateSN(el: HTMLElement, root: HTMLElement | null, homeRoot: HTMLElement | null, sel: string): boolean {
  if (root && root.contains(el)) return false;
  if (homeRoot && homeRoot.contains(el)) return false;
  if (!el.isConnected || !el.querySelector(sel)) return false;
  const r = el.getBoundingClientRect();
  return r.height >= 40 && r.width >= 40;
}

export function findNativeRecentsEl(doc: Document): HTMLElement | null {
  // Our wrappers reuse the native container class, so skip those inside our root.
  const root = doc.querySelector<HTMLElement>(".deck-shelves-root");
  const homeRoot = doc.getElementById("deck-shelves-home-root");
  const map = getClassMap();
  const sel = nativeCardSelectorSN(map);
  const candidates = collectNativeShelfCandidates(doc, map);
  let best: HTMLElement | null = null;
  let bestTop = Infinity;
  for (const el of candidates) {
    if (!isNativeCandidateSN(el, root, homeRoot, sel)) continue;
    const top = el.getBoundingClientRect().top;
    if (top < bestTop) { best = el; bestTop = top; }
  }
  devStamp("__ds_native_probe", best ? { found: true, top: Math.round(best.getBoundingClientRect().top), candidates: candidates.length } : { found: false, candidates: candidates.length });
  return best;
}

function findFirstNativeCard(el: HTMLElement, map: Record<string, string>): HTMLElement | null {
  const trySelectors = [
    map.nativeCardFocusable ? `[class~="${map.nativeCardFocusable}"]:not(.ds-card)` : "",
    map.nativeCard ? `[class~="${map.nativeCard}"]:not(.ds-card)` : "",
    'a[href*="/library/app/"]:not(.ds-card)',
    '[data-appid]:not(.ds-card)',
  ].filter(Boolean);
  for (const sel of trySelectors) {
    const c = el.querySelector<HTMLElement>(sel);
    if (c) return c;
  }
  return null;
}

// With `auto`, don't take over a Home owned by a game or another page.
export function focusNativeRecentsFirstCard(doc: Document | null, auto = true): boolean {
  if (!doc) return false;
  const el = findNativeRecentsEl(doc);
  if (!el) return false;
  const card = findFirstNativeCard(el, getClassMap());
  if (!card) return false;
  try { card.scrollIntoView({ block: "center", inline: "center", behavior: "instant" as ScrollBehavior }); } catch {}
  try { (auto ? focusElementAuto : focusElement)(card); } catch {}
  return card.classList.contains("gpfocus") || card === card.ownerDocument?.activeElement;
}

export function nativeRecentsHoldsFocus(doc: Document): boolean {
  const focused = doc.querySelector<HTMLElement>(".gpfocus") ?? (doc.activeElement as HTMLElement | null);
  if (!focused || focused === doc.body) return false;
  return !!findNativeRecentsEl(doc)?.contains(focused);
}
