import { matchesSteamText } from "../steam/steamText";
import { shelfSectionSelector, getHostContext } from "./homePatchWindow";

function closestSection(el: Element | null): HTMLElement | null {
  let node: Element | null = el;
  while (node) {
    if (node instanceof HTMLElement && /section|div/i.test(node.tagName) && node.childElementCount > 0) return node;
    node = node.parentElement;
  }
  return null;
}

export type Anchor = { parent: HTMLElement; before: ChildNode | null };

const ANCHOR_CONTAINERS_QS = '[class*="gamepadlibrary"], [class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="AppGridFilterContainer"], [class*="AllPagesContainer"], main, [role="main"]';
const ANCHOR_CANDIDATES_QS = '[role="list"],[aria-label],[class*="ReactVirtualized__Grid"],[class*="ReactVirtualized__Grid__innerScrollContainer"]';

// `lenient` accepts a scroll panel that doesn't overflow yet, or the anchor lands inside recents.
function isScrollableViewport(p: HTMLElement, lenient = false): boolean {
  try {
    const cs = getComputedStyle(p);
    const oy = (cs.overflowY || '').toLowerCase();
    return (oy === 'auto' || oy === 'scroll') && (lenient || p.scrollHeight > p.clientHeight);
  } catch { return false; }
}

function findScrollableAncestor(start: HTMLElement, doc: Document, lenient = false): Anchor | null {
  let container: HTMLElement | null = start;
  for (let i = 0; i < 12 && container; i++) {
    const p: HTMLElement | null = container.parentElement;
    if (!p || p === doc.body) break;
    if (isScrollableViewport(p, lenient)) return { parent: p, before: container.nextSibling };
    container = p;
  }
  return null;
}

function anchorFromGridOrSection(node: Element): Anchor | null {
  const grid = (node as HTMLElement).closest?.('[class*="ReactVirtualized__Grid"]') as HTMLElement | null;
  const gridWrapper = grid?.parentElement as HTMLElement | null;
  if (gridWrapper?.parentElement) return { parent: gridWrapper.parentElement, before: gridWrapper.nextSibling };
  const section = closestSection(node);
  if (section?.parentElement) return { parent: section.parentElement, before: section.nextSibling };
  return null;
}

function anchorFromRecentsCandidates(doc: Document): Anchor | null {
  for (const node of Array.from(doc.querySelectorAll(ANCHOR_CANDIDATES_QS))) {
    const txt = `${(node.getAttribute?.("aria-label") || "")} ${(node.textContent || "")}`;
    if (!matchesSteamText(txt, "recentGames", "contains")) continue;
    const scrollable = findScrollableAncestor(node as HTMLElement, doc) ?? findScrollableAncestor(node as HTMLElement, doc, true);
    if (scrollable) return scrollable;
    const fallback = anchorFromGridOrSection(node);
    if (fallback) return fallback;
  }
  return null;
}

function anchorFromChipLabels(doc: Document): Anchor | null {
  for (const node of Array.from(doc.querySelectorAll('button, [role="tab"]'))) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (!matchesSteamText(text, "homeTabs", "exact")) continue;
    const section = closestSection(node);
    if (section?.parentElement) return { parent: section.parentElement, before: section };
  }
  return null;
}

function anchorFromKnownContainers(doc: Document): Anchor | null {
  const known = doc.querySelector(shelfSectionSelector(doc)) as HTMLElement | null;
  if (known?.parentElement) return { parent: known.parentElement, before: known.nextSibling };
  for (const node of Array.from(doc.querySelectorAll(ANCHOR_CONTAINERS_QS))) {
    if (node instanceof HTMLElement) return { parent: node, before: node.firstChild };
  }
  return null;
}

export function resolveAnchor(): Anchor | null {
  const { doc } = getHostContext();
  return anchorFromRecentsCandidates(doc) ?? anchorFromChipLabels(doc) ?? anchorFromKnownContainers(doc);
}
