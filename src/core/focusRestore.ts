/**
 * Saves and restores gamepad focus to shelf cards after navigation.
 *
 * When the user presses A on a shelf card, we record the appid.
 * When they return to the home page, we find the matching card's nav tree
 * node and set it as the active focus target.
 */

import { getPreferredSteamDocument } from "../runtime/steamHost";

let pendingAppid: number | null = null;
let pendingShelfId: string | null = null;
let pendingTimestamp = 0;
const FOCUS_RESTORE_TIMEOUT = 30000;

export function saveFocusTarget(appid: number, shelfId?: string): void {
  pendingAppid = appid;
  pendingShelfId = shelfId ?? null;
  pendingTimestamp = Date.now();
}

function getFocusNavController(): any {
  return (globalThis as any).FocusNavController;
}

function getMainNavTree(): any {
  const ctrl = getFocusNavController();
  if (!ctrl) return null;
  const ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  const trees: any[] = ctx?.m_rgGamepadNavigationTrees ?? [];
  return trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root") ?? null;
}

function findNavNodeForElement(el: HTMLElement): any {
  const tree = getMainNavTree();
  if (!tree) return null;
  const root = tree.m_Root || tree.Root;
  if (!root) return null;

  let found: any = null;
  const walk = (node: any) => {
    if (found) return;
    const nodeEl = node.m_element || node.Element;
    if (nodeEl === el) { found = node; return; }
    const children = node.m_rgChildren || [];
    for (let i = 0; i < children.length; i++) walk(children[i]);
  };
  walk(root);
  return found;
}

/** Returns true if there is a pending focus restoration target. */
export function hasPendingFocus(): boolean {
  return !!pendingAppid;
}

export function tryRestoreFocus(): boolean {
  if (!pendingAppid) return false;
  if (Date.now() - pendingTimestamp > FOCUS_RESTORE_TIMEOUT) {
    pendingAppid = null;
    return false;
  }

  const doc = getPreferredSteamDocument();
  if (!doc) return false;

  // Prefer the card scoped to the shelf; fall back to any card with this appid
  let card: HTMLElement | null = null;
  if (pendingShelfId) {
    card = doc.querySelector(`.ds-card[data-appid="${pendingAppid}"][data-shelfid="${pendingShelfId}"]`) as HTMLElement | null;
  }
  if (!card) {
    card = doc.querySelector(`.ds-card[data-appid="${pendingAppid}"]`) as HTMLElement | null;
  }
  if (!card) return false;

  // Already has gamepad focus — we're done
  if (card.classList.contains("gpfocus") || card === card.ownerDocument?.activeElement) {
    pendingAppid = null;
    pendingShelfId = null;
    return true;
  }

  const navNode = findNavNodeForElement(card);

  if (navNode) {
    try {
      // BTakeFocus: direct focus request on the nav node (most reliable)
      if (typeof navNode.BTakeFocus === "function") {
        navNode.BTakeFocus(2 /* GAMEPAD */);
        pendingAppid = null;
        pendingShelfId = null;
        return true;
      }
      // TakeFocus on the nav tree
      const tree = navNode.m_Tree;
      if (tree?.TakeFocus) {
        tree.TakeFocus(2 /* GAMEPAD */, navNode);
        pendingAppid = null;
        pendingShelfId = null;
        return true;
      }
      // Fallback: OnGamepadNavigationTreeFocused on the controller
      const ctrl = getFocusNavController();
      if (ctrl?.OnGamepadNavigationTreeFocused && tree) {
        ctrl.OnGamepadNavigationTreeFocused(tree, navNode);
        pendingAppid = null;
        pendingShelfId = null;
        return true;
      }
    } catch { /* ignore */ }
  }

  try {
    card.focus?.();
  } catch { /* ignore */ }

  return false;
}

let focusObserver: MutationObserver | null = null;

export function beginFocusRestoreLoop(): void {
  if (!pendingAppid) return;

  // Cancel any previous observer
  focusObserver?.disconnect();
  focusObserver = null;

  const targetAppid = pendingAppid;
  const targetShelfId = pendingShelfId;
  const deadline = Date.now() + 300000;

  const doc = getPreferredSteamDocument();
  if (!doc?.body) return;

  const findCard = (): HTMLElement | null => {
    if (targetShelfId) {
      const scoped = doc.querySelector(`.ds-card[data-appid="${targetAppid}"][data-shelfid="${targetShelfId}"]`) as HTMLElement | null;
      if (scoped) return scoped;
    }
    return doc.querySelector(`.ds-card[data-appid="${targetAppid}"]`) as HTMLElement | null;
  };

  const cardMatches = (el: HTMLElement): boolean => {
    if (!el.matches?.(`.ds-card[data-appid="${targetAppid}"]`)) return false;
    if (targetShelfId && el.dataset?.shelfid && el.dataset.shelfid !== targetShelfId) return false;
    return true;
  };

  const attempt = () => {
    if (!pendingAppid || pendingAppid !== targetAppid) return;
    if (Date.now() > deadline) { pendingAppid = null; pendingShelfId = null; focusObserver?.disconnect(); focusObserver = null; return; }

    // If our card already has gpfocus, great
    const card = findCard();
    if (card?.classList.contains("gpfocus")) {
      pendingAppid = null;
      pendingShelfId = null;
      focusObserver?.disconnect();
      focusObserver = null;
      return;
    }
    tryRestoreFocus();
  };

  focusObserver = new MutationObserver((mutations) => {
    if (!pendingAppid || pendingAppid !== targetAppid || Date.now() > deadline) {
      focusObserver?.disconnect();
      focusObserver = null;
      pendingAppid = null;
      pendingShelfId = null;
      return;
    }
    for (const m of mutations) {
      if (m.type !== "attributes" || m.attributeName !== "class") continue;
      const el = m.target as HTMLElement;
      // Our card got gpfocus — done
      if (cardMatches(el) && el.classList.contains("gpfocus")) {
        pendingAppid = null;
        pendingShelfId = null;
        focusObserver?.disconnect();
        focusObserver = null;
        return;
      }
      // Something else got gpfocus — re-steal
      if (el.classList.contains("gpfocus") && !cardMatches(el)) {
        attempt();
        return;
      }
    }
  });

  focusObserver.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["class"] });

  attempt();
  const pollId = setInterval(() => {
    if (!pendingAppid || pendingAppid !== targetAppid || Date.now() > deadline) {
      clearInterval(pollId);
      return;
    }
    attempt();
  }, 200);

  // Hard deadline cleanup
  setTimeout(() => {
    focusObserver?.disconnect();
    focusObserver = null;
    clearInterval(pollId);
    pendingAppid = null;
  }, deadline);
}
