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

  const attempt = () => {
    if (isDone()) return;
    const card = findCard();
    if (card?.classList.contains("gpfocus")) { succeed(); return; }
    tryRestoreFocus();
  };

  // MutationObserver: fast path — react to class changes on cards
  const observer = new MutationObserver((mutations) => {
    if (isDone()) { observer.disconnect(); return; }
    for (const m of mutations) {
      if (m.type !== "attributes" || m.attributeName !== "class") continue;
      const el = m.target as HTMLElement;
      if (el.matches?.(`.ds-card[data-appid="${targetAppid}"]`) && el.classList.contains("gpfocus")) {
        if (targetShelfId && el.dataset?.shelfid && el.dataset.shelfid !== targetShelfId) continue;
        succeed();
        observer.disconnect();
        return;
      }
      if (el.classList.contains("gpfocus")) { attempt(); return; }
    }
  });
  observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["class"] });

  // Polling fallback: 500ms × 10, then 2s until timeout
  attempt();
  let pollCount = 0;
  const poll = () => {
    if (isDone()) return;
    pollCount++;
    attempt();
    if (!isDone()) {
      setTimeout(poll, pollCount < 10 ? 500 : 2000);
    }
  };
  setTimeout(poll, 500);

  // Hard timeout: 30s
  setTimeout(() => {
    if (!abort.signal.aborted) {
      observer.disconnect();
      pendingAppid = null;
      abort.abort();
    }
  }, 30000);

  // Cleanup on abort
  abort.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
