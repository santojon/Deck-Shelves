import { getPreferredSteamDocument } from "../runtime/steamHost";

let pendingAppid: number | null = null;
let pendingShelfId: string | null = null;
let pendingTimestamp = 0;
// 10 min covers art-editor sessions with multiple images / properties
// pages. Pending state is superseded as soon as the user activates any
// other DS card, so a long TTL doesn't cause stale restores in practice.
const FOCUS_RESTORE_TIMEOUT = 600_000;

function findDsCard(appid: number, shelfId?: string | null): HTMLElement | null {
  const doc = getPreferredSteamDocument();
  const sel = shelfId
    ? `.ds-card[data-appid="${appid}"][data-shelfid="${shelfId}"]`
    : `.ds-card[data-appid="${appid}"]`;
  return (doc?.querySelector(sel) as HTMLElement | null) ?? null;
}

export function saveFocusTarget(appid: number, shelfId?: string): void {
  pendingAppid = appid;
  pendingShelfId = shelfId ?? null;
  pendingTimestamp = Date.now();
  // Sync Steam's nav tree m_lastFocusNode to the current card BEFORE
  // navigation pushes history. Steam's native popstate restoration reads
  // m_lastFocusNode, so landing becomes deterministic — no post-hoc race.
  try {
    const card = findDsCard(appid, shelfId);
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

/* On cold boot / after a plugin reload, `m_ActiveContext` can exist but
   carry EMPTY trees while `m_LastActiveContext` holds the home tree. The
   old `m_ActiveContext || m_LastActiveContext` picked the empty active
   context and never fell through. Gather trees from BOTH so node lookup
   works whenever the home is rendered, active or not. */
function getNavTrees(): any[] {
  const ctrl = getFocusNavController();
  if (!ctrl) return [];
  const out: any[] = [];
  for (const ctx of [ctrl.m_ActiveContext, ctrl.m_LastActiveContext]) {
    const trees: any[] = ctx?.m_rgGamepadNavigationTrees ?? [];
    for (const t of trees) if (!out.includes(t)) out.push(t);
  }
  return out;
}

function getMainNavTree(): any {
  return getNavTrees().find((t: any) => t.m_ID === "GamepadUI_Full_Root") ?? null;
}

function nodeElement(node: any): HTMLElement | null {
  const el = node?.m_element ?? node?.Element ?? node?.m_pElement ?? node?.element;
  // Not `instanceof HTMLElement` — this can run against an element from a
  // different window/realm (BP's own document, read from the SJC realm),
  // where that check silently fails on the prototype-chain mismatch.
  return el?.nodeType === 1 ? (el as HTMLElement) : null;
}

/* The tree's own `m_lastFocusNode` is the reliable source of "what's really
   focused" — confirmed live (2026-09-12) it tracks correctly on every
   BTakeFocus call, unlike document.activeElement (moves inconsistently)
   or the `gpfocus` class (never applied at all on this beta). */
export function getLastFocusedElement(): HTMLElement | null {
  const tree = getMainNavTree();
  return nodeElement(tree?.m_lastFocusNode ?? tree?.m_LastFocusNode);
}

/* The gamepad-focused element in the ACTIVE nav context — the beta-safe stand-in
   for `document.querySelector('.gpfocus')`, which this beta never applies (see the
   note above). While the QAM is open its context is the active one, so this reads
   QAM-internal focus, unlike getLastFocusedElement() which is pinned to the home
   tree. Falls back to the last active context. */
export function getActiveFocusedElement(): HTMLElement | null {
  const ctrl = getFocusNavController();
  const node = ctrl?.m_ActiveContext?.m_lastFocusNode ?? ctrl?.m_LastActiveContext?.m_lastFocusNode;
  return nodeElement(node);
}

function findNavNodeForElement(el: HTMLElement): any {
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

  for (const tree of getNavTrees()) {
    const root = tree.m_Root ?? tree.Root ?? tree.m_root;
    if (!root) continue;
    const found = walk(root, el);
    if (found) return found;
  }
  return null;
}

function takeNavFocus(navNode: any): boolean {
  try {
    if (typeof navNode.BTakeFocus === "function") { navNode.BTakeFocus(2); return true; }
    const tree = navNode.m_Tree;
    if (tree?.TakeFocus) { tree.TakeFocus(2, navNode); return true; }
    const ctrl = getFocusNavController();
    if (ctrl?.OnGamepadNavigationTreeFocused && tree) { ctrl.OnGamepadNavigationTreeFocused(tree, navNode); return true; }
  } catch {}
  return false;
}

/* Confirmed live (2026-09-11 beta): Steam's real nav tree has no entry for
   our shelf content on this build. Raw DOM .focus() here would desync
   document.activeElement from the node Steam's tree still tracks (e.g. the
   search bar) — native elements with a real nav node keep the fallback. */
function isUnintegratedDsElement(el: HTMLElement): boolean {
  return !!el.closest?.(".ds-card, .deck-shelves-root");
}

export function focusElement(el: HTMLElement): boolean {
  const navNode = findNavNodeForElement(el);
  if (navNode && takeNavFocus(navNode)) return true;
  if (isUnintegratedDsElement(el)) return false;
  try { el.focus?.(); } catch {}
  return false;
}

export function hasPendingFocus(): boolean {
  return !!pendingAppid;
}

function findPendingCard(): HTMLElement | null {
  const doc = getPreferredSteamDocument();
  if (!doc) return null;
  let card: HTMLElement | null = null;
  if (pendingShelfId) {
    card = doc.querySelector(`.ds-card[data-appid="${pendingAppid}"][data-shelfid="${pendingShelfId}"]`) as HTMLElement | null;
  }
  if (!card) {
    card = doc.querySelector(`.ds-card[data-appid="${pendingAppid}"]`) as HTMLElement | null;
  }
  return card;
}

function clearPending(): void {
  pendingAppid = null;
  pendingShelfId = null;
}

function isCardFocused(card: HTMLElement): boolean {
  return card.classList.contains("gpfocus") || card === card.ownerDocument?.activeElement;
}

export function tryRestoreFocus(): boolean {
  if (!pendingAppid) return false;
  if (Date.now() - pendingTimestamp > FOCUS_RESTORE_TIMEOUT) {
    clearPending();
    return false;
  }

  const card = findPendingCard();
  if (!card) return false;

  if (isCardFocused(card)) {
    clearPending();
    return true;
  }

  const navNode = findNavNodeForElement(card);
  if (navNode) takeNavFocus(navNode);
  // No navNode: skip the raw DOM-focus fallback (see focusElement above).
  // Keep the pending state so a later call retries once the rebuilt nav
  // tree actually registers the node.
  return false;
}

let coldBootAbort: AbortController | null = null;
// 6s matches the post-restore loop's own overall settle window below — local
// shelves (Steam library store hydration) have been observed taking ~4s on
// cold boot, so a shorter window risks expiring just before they populate.
const COLD_BOOT_GUARD_MS = 6000;

/* Cold-boot default-focus fix: an online shelf reads a synchronous
   localStorage cache and can render before an earlier LOCAL shelf finishes
   loading Steam's own library store. Steam's "focus first card" boot reflex
   ignores shelf order, so it lands wherever that race landed first — walk it
   back once an earlier shelf has cards; no-op once it already landed right. */
export function beginColdBootFocusGuard(orderedShelfIds: string[]): void {
  if (hasPendingFocus() || orderedShelfIds.length < 2) return;
  coldBootAbort?.abort();
  const abort = new AbortController();
  coldBootAbort = abort;

  const doc = getPreferredSteamDocument();
  if (!doc) return;

  // A real directional press proves the user is in control — stand down for
  // good so their own navigation is never fought (same gate as the
  // post-restore confirmation loop below).
  let userNavigated = false;
  const onDirection = () => { userNavigated = true; };
  doc.addEventListener("vgp_ondirection", onDirection, true);
  const cleanup = () => doc.removeEventListener("vgp_ondirection", onDirection, true);
  abort.signal.addEventListener("abort", cleanup, { once: true });

  const start = Date.now();
  const tick = () => {
    if (abort.signal.aborted || userNavigated) { cleanup(); return; }
    const gp = doc.querySelector(".ds-card.gpfocus") as HTMLElement | null;
    const focusedShelfId = gp?.getAttribute("data-shelfid");
    const focusedIdx = focusedShelfId ? orderedShelfIds.indexOf(focusedShelfId) : -1;
    if (focusedIdx > 0) {
      for (let i = 0; i < focusedIdx; i++) {
        const earlier = doc.querySelector(`.ds-card[data-shelfid="${orderedShelfIds[i]}"]`) as HTMLElement | null;
        if (!earlier) continue;
        const navNode = findNavNodeForElement(earlier);
        if (navNode) takeNavFocus(navNode);
        break;
      }
    }
    if (Date.now() - start < COLD_BOOT_GUARD_MS) { setTimeout(tick, 200); return; }
    cleanup();
  };
  setTimeout(tick, 200);
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

  const FALLBACK_AFTER = Date.now() + 2500;
  // Prefer the original shelf for as long as possible; only fall back to
  // any-appid match after FALLBACK_AFTER. Without this, a shelf with the
  // same appid (online wishlist, etc.) that resolves first wins focus.
  const findCard = (): HTMLElement | null => {
    if (targetShelfId) {
      const scoped = doc.querySelector(`.ds-card[data-appid="${targetAppid}"][data-shelfid="${targetShelfId}"]`) as HTMLElement | null;
      if (scoped) return scoped;
      if (Date.now() < FALLBACK_AFTER) return null;
    }
    return doc.querySelector(`.ds-card[data-appid="${targetAppid}"]`) as HTMLElement | null;
  };

  const isDone = () => abort.signal.aborted || !pendingAppid || pendingAppid !== targetAppid;

  // Steam's native "focus first card on home mount" (issue #38) fires once,
  // ~0.8-1.8s after the home remounts — well AFTER our initial restore lands.
  // Poll for 2s and, the first time focus has drifted off the target card,
  /* re-take it. Bounded to one re-take so the user's own later navigation is
     never fought. Gated on `activeAbort === abort` (NOT `abort.signal`, which
     `succeed()` itself sets) so a newer restore loop cancels this.
     5 s + up to 5 re-takes. Steam's native focus-first-card reflex can
     fire as late as 3 s after the home remounts. */
  const scheduleConfirmation = () => {
    /* A genuine directional press during this window proves the user is back
       in control — any focus loss from here on is their own navigation, not
       Steam's reflex, so this loop must stand down for good (reported live:
       Down got fought and snapped back ~1.6s later). Scoped to this call's
       own 5s lifetime. */
    let userNavigated = false;
    const onDirection = () => { userNavigated = true; };
    doc.addEventListener("vgp_ondirection", onDirection, true);
    const stopListening = () => doc.removeEventListener("vgp_ondirection", onDirection, true);

    let reTakes = 0;
    const start = Date.now();
    const check = () => {
      if (activeAbort !== abort || userNavigated) { stopListening(); return; }
      const card = findCard();
      if (card && !card.classList.contains("gpfocus") && reTakes < 5) {
        const navNode = findNavNodeForElement(card);
        if (navNode && takeNavFocus(navNode)) reTakes++;
      }
      if (Date.now() - start < 5000) { setTimeout(check, 200); return; }
      stopListening();
    };
    setTimeout(check, 150);
  };

  const succeed = () => {
    clearPending();
    scheduleConfirmation();
    abort.abort();
  };

  const attempt = (): boolean => {
    if (isDone()) return true;
    const card = findCard();
    if (!card) return false;
    // Success is declared ONLY when the card actually holds gamepad focus.
    // BTakeFocus returns true even on a stale node during the post-remount
    // nav-tree rebuild, so the previous tick's BTakeFocus is verified here.
    if (card.classList.contains("gpfocus")) { succeed(); return true; }
    const navNode = findNavNodeForElement(card);
    if (navNode) {
      takeNavFocus(navNode);
      // Not confirmed yet — let the next poll verify gpfocus landed.
      return false;
    }
    // No navNode: skip the raw DOM-focus fallback (see focusElement above)
    // and let the outer 6s hard timeout clear pending state.
    return false;
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

  // setTimeout-based poll — NOT requestAnimationFrame. The plugin runs in the
  /* headless SharedJSContext, which has no render loop, so rAF callbacks never
     fire there; an rAF-driven retry would silently never run. Polling every
     ~120ms keeps re-issuing BTakeFocus until the rebuilt nav tree settles and
     the focus actually sticks. 3.5s window covers a shelf below the fold that
     renders ~2-3s after the home remounts. */
  const DEADLINE = Date.now() + 3500;
  const tick = () => {
    if (isDone()) return;
    if (attempt()) return;
    if (Date.now() >= DEADLINE) return;
    setTimeout(tick, 120);
  };
  setTimeout(tick, 0);

  // Hard timeout extended to 6s so scheduleConfirmation's 5s window can
  // run fully before pending state is dropped.
  setTimeout(() => {
    if (!abort.signal.aborted) {
      observer.disconnect();
      clearPending();
      abort.abort();
    }
  }, 6000);

  // Cleanup on abort
  abort.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
