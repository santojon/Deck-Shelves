import { getPreferredSteamDocument } from "../runtime/steamHost";

let pendingAppid: number | null = null;
let pendingShelfId: string | null = null;
let pendingTimestamp = 0;
const FOCUS_RESTORE_TIMEOUT = 30000;

export function saveFocusTarget(appid: number, shelfId?: string): void {
  pendingAppid = appid;
  pendingShelfId = shelfId ?? null;
  pendingTimestamp = Date.now();
  // Sync Steam's nav tree m_lastFocusNode to the current card BEFORE
  // navigation pushes history. Steam's native popstate restoration reads
  // m_lastFocusNode, so landing becomes deterministic — no post-hoc race.
  try {
    const doc = getPreferredSteamDocument();
    const sel = shelfId
      ? `.ds-card[data-appid="${appid}"][data-shelfid="${shelfId}"]`
      : `.ds-card[data-appid="${appid}"]`;
    const card = doc?.querySelector(sel) as HTMLElement | null;
    if (!card) return;
    const navNode = findNavNodeForElement(card);
    if (!navNode) return;
    const tree = navNode.m_Tree || getMainNavTree();
    if (tree) tree.m_lastFocusNode = navNode;
    const ctx = getFocusNavController()?.m_ActiveContext;
    if (ctx) ctx.m_lastFocusNode = navNode;
  } catch {}
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
  const ctrl = getFocusNavController();
  if (!ctrl) return null;
  const ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  const trees: any[] = ctx?.m_rgGamepadNavigationTrees ?? [];

  const walk = (node: any, target: HTMLElement): any => {
    // Cover property name variations across SteamOS versions
    const nodeEl = node.m_element ?? node.Element ?? node.m_pElement ?? node.element;
    if (nodeEl === target) return node;
    const children: any[] = node.m_rgChildren ?? node.m_children ?? node.children ?? [];
    for (let i = 0; i < children.length; i++) {
      const found = walk(children[i], target);
      if (found) return found;
    }
    return null;
  };

  for (const tree of trees) {
    const root = tree.m_Root ?? tree.Root ?? tree.m_root;
    if (!root) continue;
    const found = walk(root, el);
    if (found) return found;
  }
  return null;
}

/** Move gamepad focus to a specific DOM element using the Steam nav tree API.
 *  Returns true if BTakeFocus or equivalent succeeded, false if it had to
 *  fall back to element.focus(). */
export function focusElement(el: HTMLElement): boolean {
  const navNode = findNavNodeForElement(el);
  if (navNode) {
    try {
      if (typeof navNode.BTakeFocus === "function") { navNode.BTakeFocus(2); return true; }
      const tree = navNode.m_Tree;
      if (tree?.TakeFocus) { tree.TakeFocus(2, navNode); return true; }
      const ctrl = getFocusNavController();
      if (ctrl?.OnGamepadNavigationTreeFocused && tree) { ctrl.OnGamepadNavigationTreeFocused(tree, navNode); return true; }
    } catch {}
  }
  try { el.focus?.(); } catch {}
  return false;
}

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

  let card: HTMLElement | null = null;
  if (pendingShelfId) {
    card = doc.querySelector(`.ds-card[data-appid="${pendingAppid}"][data-shelfid="${pendingShelfId}"]`) as HTMLElement | null;
  }
  if (!card) {
    card = doc.querySelector(`.ds-card[data-appid="${pendingAppid}"]`) as HTMLElement | null;
  }
  if (!card) return false;

  if (card.classList.contains("gpfocus") || card === card.ownerDocument?.activeElement) {
    pendingAppid = null;
    pendingShelfId = null;
    return true;
  }

  const navNode = findNavNodeForElement(card);

  if (navNode) {
    try {
      if (typeof navNode.BTakeFocus === "function") {
        navNode.BTakeFocus(2);
        pendingAppid = null;
        pendingShelfId = null;
        return true;
      }
      const tree = navNode.m_Tree;
      if (tree?.TakeFocus) {
        tree.TakeFocus(2, navNode);
        pendingAppid = null;
        pendingShelfId = null;
        return true;
      }
      const ctrl = getFocusNavController();
      if (ctrl?.OnGamepadNavigationTreeFocused && tree) {
        ctrl.OnGamepadNavigationTreeFocused(tree, navNode);
        pendingAppid = null;
        pendingShelfId = null;
        return true;
      }
    } catch {}
  }

  try {
    card.focus?.();
    card.scrollIntoView?.({ block: "center", behavior: "smooth" });
  } catch {}

  return false;
}

let activeAbort: AbortController | null = null;

export function beginFocusRestoreLoop(): void {
  if (!pendingAppid) return;

  // Cancel any previous restore loop
  activeAbort?.abort();
  const abort = new AbortController();
  activeAbort = abort;

  const targetAppid = pendingAppid;
  const targetShelfId = pendingShelfId;
  const doc = getPreferredSteamDocument();
  if (!doc?.body) return;

  const findCard = (): HTMLElement | null => {
    if (targetShelfId) {
      const scoped = doc.querySelector(`.ds-card[data-appid="${targetAppid}"][data-shelfid="${targetShelfId}"]`) as HTMLElement | null;
      if (scoped) return scoped;
    }
    return doc.querySelector(`.ds-card[data-appid="${targetAppid}"]`) as HTMLElement | null;
  };

  const isDone = () => abort.signal.aborted || !pendingAppid || pendingAppid !== targetAppid;

  const succeed = () => {
    pendingAppid = null;
    pendingShelfId = null;
    abort.abort();
  };

  const attempt = (): boolean => {
    if (isDone()) return true;
    const card = findCard();
    if (!card) return false;
    if (card.classList.contains("gpfocus")) { succeed(); return true; }
    const navNode = findNavNodeForElement(card);
    if (!navNode) {
      // If the nav tree walk consistently returns nothing (property name mismatch
      // on older SteamOS), fall back to DOM focus after most retries are spent.
      // DOM focus won't sync the gamepad tree but is better than Steam defaulting
      // to the first card — the restore window is already nearly exhausted.
      if (Date.now() >= DEADLINE - 200) {
        try { card.focus?.(); card.scrollIntoView?.({ block: 'nearest' }); } catch {}
        succeed();
        return true;
      }
      return false;
    }
    tryRestoreFocus();
    return !!pendingAppid ? false : true;
  };

  // MutationObserver: succeed only when TARGET card is added/focused.
  // Do NOT re-steal focus on arbitrary gpfocus changes — that hijacks the
  // user's own navigation after the initial restore window.
  const observer = new MutationObserver((mutations) => {
    if (isDone()) { observer.disconnect(); return; }
    for (const m of mutations) {
      const el = m.target as HTMLElement;
      if (!el.matches?.(`.ds-card[data-appid="${targetAppid}"]`)) continue;
      if (targetShelfId && el.dataset?.shelfid && el.dataset.shelfid !== targetShelfId) continue;
      if (el.classList.contains("gpfocus")) { succeed(); observer.disconnect(); return; }
      attempt();
      return;
    }
  });
  const observeRoot = (doc.querySelector(".deck-shelves-root") as HTMLElement | null) ?? doc.body;
  observer.observe(observeRoot, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });

  // Defer initial attempt to next macrotask so Steam's synchronous popstate
  // restoration runs first, then ours wins. Retry on rAF until the rebuilt
  // nav tree registers our card's node (typically 1–3 frames after remount).
  const DEADLINE = Date.now() + 800;
  const tick = () => {
    if (isDone()) return;
    if (attempt()) return;
    if (Date.now() >= DEADLINE) return;
    requestAnimationFrame(tick);
  };
  setTimeout(() => requestAnimationFrame(tick), 0);

  // Short timeout: 2s. Home cards render fast; a longer window lets the
  // observer interfere with subsequent user navigation.
  setTimeout(() => {
    if (!abort.signal.aborted) {
      observer.disconnect();
      pendingAppid = null;
      pendingShelfId = null;
      abort.abort();
    }
  }, 2000);

  // Cleanup on abort
  abort.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
