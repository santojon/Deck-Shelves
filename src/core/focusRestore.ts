import { getAllSteamDocuments, getPreferredSteamDocument } from "../runtime/steamHost";
import { getSessionState } from "../runtime/sessionState";
import { registerDisposer } from "../runtime/runtimeDisposer";
import { getPowerState, homeRouteCovered, registerPeriodic } from "../runtime/powerGate";
import { steamUIStore } from "../steam/internals";

/* The document the Home lives in: the one holding our root, else Steam's main
   window, else the preferred one. Read live — the preferred window can point
   at the plugin's own context while the Home is detached behind another page. */
function homeDocument(): Document {
  return rootDocument() ?? mainWindowDocument() ?? getPreferredSteamDocument();
}

function rootDocument(): Document | null {
  for (const d of getAllSteamDocuments()) { if (d.querySelector?.(".deck-shelves-root")) return d; }
  return null;
}

function mainWindowDocument(): Document | null {
  try {
    const main = steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow?.document;
    return main?.body ? main : null;
  } catch { return null; }
}

let pendingAppid: number | null = null;
let pendingShelfId: string | null = null;
let pendingTimestamp = 0;
// Long enough for art-editor sessions; any other card activation supersedes it.
const FOCUS_RESTORE_TIMEOUT = 600_000;

function findDsCard(appid: number, shelfId?: string | null): HTMLElement | null {
  const doc = getPreferredSteamDocument();
  const sel = shelfId
    ? `.ds-card[data-appid="${appid}"][data-shelfid="${shelfId}"]`
    : `.ds-card[data-appid="${appid}"]`;
  return (doc?.querySelector(sel) as HTMLElement | null) ?? null;
}

// A pending restore goes stale once the player moves around the Home themselves.
const STALE_AFTER_MS = 1500;
let watchedDoc: Document | null = null;

function onHomeDirection(evt: Event): void {
  if (!pendingAppid || Date.now() - pendingTimestamp < STALE_AFTER_MS) return;
  const doc = watchedDoc;
  const root = doc?.getElementById("deck-shelves-home-root");
  const home = root?.parentElement ?? root;
  const target = evt.target as Node | null;
  if (home && target && typeof (target as any).nodeType === "number" && home.contains(target)) clearPending();
}

function watchHomeNavigation(): void {
  const doc = getPreferredSteamDocument();
  if (!doc || watchedDoc === doc) return;
  watchedDoc?.removeEventListener("vgp_ondirection", onHomeDirection, true);
  watchedDoc = doc;
  doc.addEventListener("vgp_ondirection", onHomeDirection, true);
  registerDisposer(() => {
    try { doc.removeEventListener("vgp_ondirection", onHomeDirection, true); } catch {}
    if (watchedDoc === doc) watchedDoc = null;
  });
}

export function saveFocusTarget(appid: number, shelfId?: string): void {
  pendingAppid = appid;
  pendingShelfId = shelfId ?? null;
  pendingTimestamp = Date.now();
  try { watchHomeNavigation(); } catch {}
  // Steam's popstate restore reads m_lastFocusNode, so it's synced before navigation pushes history.
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

// For drivers that take focus themselves, so no earlier target pulls it back.
export function clearFocusTarget(): void {
  activeAbort?.abort();
  clearPending();
}

export function getPendingFocusTarget(): { appid: number; shelfId: string | null } | null {
  if (!pendingAppid || Date.now() - pendingTimestamp > FOCUS_RESTORE_TIMEOUT) return null;
  return { appid: pendingAppid, shelfId: pendingShelfId };
}

// The element holding focus right now; the nav tree can still remember a card focused before a trip.
function currentFocusElement(): HTMLElement | null {
  const doc = homeDocument();
  const active = doc?.activeElement as HTMLElement | null;
  return active && active !== doc.body ? active : getActiveFocusedElement();
}

function saveFromCard(card: HTMLElement | null): void {
  if (!card) return;
  const appid = Number(card.getAttribute("data-appid"));
  if (!Number.isFinite(appid) || appid <= 0) return;
  saveFocusTarget(appid, card.getAttribute("data-shelfid") ?? undefined);
}

// For leaves that aren't a card activation. A target saved for this leave stays; an older one gives way to where focus is now.
export function saveFocusTargetFromFocusedCard(): void {
  if (pendingAppid && Date.now() - pendingTimestamp < STALE_AFTER_MS) return;
  const focused = currentFocusElement();
  if (!focused) { if (!pendingAppid) saveFromCard(findFocusedDsCard()); return; }
  const card = focused.closest?.(".ds-card") as HTMLElement | null;
  if (!card) { clearPending(); return; }
  saveFromCard(card);
}

// A freshly rebuilt Home tree can carry no last-focus node while the context still does.
function findFocusedDsCard(): HTMLElement | null {
  const fromTree = getLastFocusedElement()?.closest?.(".ds-card") as HTMLElement | null | undefined;
  if (fromTree) return fromTree;
  const fromContext = getActiveFocusedElement()?.closest?.(".ds-card") as HTMLElement | null | undefined;
  if (fromContext) return fromContext;
  return (getPreferredSteamDocument()?.querySelector(".ds-card.gpfocus") as HTMLElement | null) ?? null;
}

export function getFocusedDsCardAppid(): string | null {
  return findFocusedDsCard()?.getAttribute("data-appid") ?? null;
}

function getFocusNavController(): any {
  return (globalThis as any).FocusNavController;
}

// After a reload the active context can hold empty trees while the last one holds the Home, so both are read.
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
  // Not instanceof: the element can come from another window's realm.
  return el?.nodeType === 1 ? (el as HTMLElement) : null;
}

// The tree's m_lastFocusNode tracks BTakeFocus reliably, unlike activeElement or the gpfocus class.
export function getLastFocusedElement(): HTMLElement | null {
  const tree = getMainNavTree();
  return nodeElement(tree?.m_lastFocusNode ?? tree?.m_LastFocusNode);
}

// Reads the active context, so it sees QAM focus while the QAM is open.
export function getActiveFocusedElement(): HTMLElement | null {
  const ctrl = getFocusNavController();
  const node = ctrl?.m_ActiveContext?.m_lastFocusNode ?? ctrl?.m_LastActiveContext?.m_lastFocusNode;
  return nodeElement(node);
}

// Read off the fiber because a cold boot can leave the controller with tree copies that lack our nodes.
function hookNavNode(fiber: any, el: HTMLElement): any {
  for (let hook = fiber.memoizedState; hook && typeof hook === "object"; hook = hook.next) {
    const node = hook.memoizedState?.current;
    if (!node || node.m_Tree === undefined) continue;
    const owner = nodeElement(node);
    if (owner === el || owner?.contains(el)) return node;
  }
  return null;
}

// Found even when the node hangs off a parent that doesn't list it.
export function navNodeFromFiber(el: HTMLElement): any {
  try {
    const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    let fiber: any = key ? (el as any)[key] : null;
    for (let depth = 0; fiber && depth < 12; depth++, fiber = fiber.return) {
      const node = hookNavNode(fiber, el);
      if (node) return node;
    }
  } catch {}
  return null;
}

function contextReachesHome(ctx: any): boolean {
  const walk = (node: any): boolean => {
    const el = nodeElement(node);
    if (el?.classList?.contains("deck-shelves-root")) return true;
    return (node?.m_rgChildren ?? []).some(walk);
  };
  return (ctx?.m_rgGamepadNavigationTrees ?? []).some((t: any) => walk(t.m_Root ?? t.Root ?? t));
}

// Only when the active context can't reach the Home, never while another live context owns input.
// A focused native text field is released too, or BTakeFocus does nothing.
function shouldActivateContext(ctx: any, ctrl: any): boolean {
  if (!ctx || !ctrl || ctrl.m_ActiveContext === ctx) return false;
  return typeof ctx.SetActive === "function" && !contextReachesHome(ctrl.m_ActiveContext);
}

function releaseNativeTextFocus(doc: Document | null | undefined): void {
  const active = doc?.activeElement as HTMLElement | null;
  if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName) && !active.closest?.("#deck-shelves-home-root")) active.blur();
}

function activateNodeContext(navNode: any): void {
  try {
    const tree = navNode?.m_Tree;
    if (shouldActivateContext(tree?.m_context, tree?.m_Controller)) tree.m_context.SetActive(true);
    releaseNativeTextFocus(nodeElement(navNode)?.ownerDocument);
  } catch {}
}

function findNavNodeForElement(el: HTMLElement): any {
  const fromFiber = navNodeFromFiber(el);
  if (fromFiber) return fromFiber;
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
    activateNodeContext(navNode);
    if (typeof navNode.BTakeFocus === "function") { navNode.BTakeFocus(2); return true; }
    const tree = navNode.m_Tree;
    if (tree?.TakeFocus) { tree.TakeFocus(2, navNode); return true; }
    const ctrl = getFocusNavController();
    if (ctrl?.OnGamepadNavigationTreeFocused && tree) { ctrl.OnGamepadNavigationTreeFocused(tree, navNode); return true; }
  } catch {}
  return false;
}

// Steam's nav tree has no entry for this content, so raw DOM focus would desync activeElement from it.
function isUnintegratedDsElement(el: HTMLElement): boolean {
  return !!el.closest?.(".ds-card, .deck-shelves-root");
}

// A client that doesn't expose its router counts as not covered.
function homeCovered(): boolean {
  return homeRouteCovered();
}

// No automatic focus grabs while a game runs or the Home is covered or held: it would steal input.
function autoFocusAllowed(): boolean {
  try { if (getSessionState().gameRunning) return false; } catch {}
  if (homeCovered()) return false;
  return getPowerState() === 'active';
}

function autoTakeNavFocus(navNode: any): boolean {
  return autoFocusAllowed() && takeNavFocus(navNode);
}

export function focusElement(el: HTMLElement): boolean {
  const navNode = findNavNodeForElement(el);
  if (navNode && takeNavFocus(navNode)) return true;
  if (isUnintegratedDsElement(el)) return false;
  try { el.focus?.(); } catch {}
  return false;
}

// For automatic callers only: a no-op outside the active Home.
export function focusElementAuto(el: HTMLElement): boolean {
  return autoFocusAllowed() && focusElement(el);
}

const FOCUS_FIRST_POLL_MS = 600;
const FOCUS_FIRST_WINDOW_MS = 25_000;

// Retries landing on the first shelf while the Home is active, and once more on each return.
export function startFocusFirstPoll(tryFocus: () => boolean, aRealCardHasFocus: () => boolean): () => void {
  const started = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
  const start = () => {
    if (timer !== null || Date.now() - started > FOCUS_FIRST_WINDOW_MS) return;
    timer = setInterval(() => { if (tryFocus() || Date.now() - started > FOCUS_FIRST_WINDOW_MS) stop(); }, FOCUS_FIRST_POLL_MS);
  };
  const unregister = registerPeriodic("homeFocusFirst", {
    runIn: ["active"], start, stop,
    // A card left for a game or page wins over the tile Steam's own row remembers.
    onResume: () => { if (hasPendingFocus() || !aRealCardHasFocus()) tryFocus(); },
  });
  return () => { unregister(); stop(); };
}

export function hasPendingFocus(): boolean {
  return !!pendingAppid;
}

function findPendingCard(): HTMLElement | null {
  const doc = homeDocument();
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

// Steam's boot reflex parked focus in its search field, which needs no grace period.
function nativeTextFieldFocused(doc: Document): boolean {
  const a = doc.activeElement as HTMLElement | null;
  return !!a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !a.closest?.("#deck-shelves-home-root");
}

function fallbackGraceOver(doc: Document, start: number): boolean {
  return nativeTextFieldFocused(doc) || Date.now() - start > COLD_BOOT_FALLBACK_GRACE_MS;
}

export function tryRestoreFocus(): boolean {
  if (!pendingAppid) return false;
  if (Date.now() - pendingTimestamp > FOCUS_RESTORE_TIMEOUT) {
    clearPending();
    return false;
  }
  // The card can still hold focus while its game page opens: that is not a restore.
  if (homeCovered()) return false;

  const card = findPendingCard();
  if (!card) return false;

  if (isCardFocused(card)) {
    clearPending();
    return true;
  }

  const navNode = findNavNodeForElement(card);
  if (navNode) autoTakeNavFocus(navNode);
  // Keep the pending state so a later call retries once the nav tree registers the node.
  return false;
}

let coldBootAbort: AbortController | null = null;
// Local shelves can take ~4 s to populate on cold boot.
const COLD_BOOT_GUARD_MS = 6000;
// The window counts from the first rendered card; this caps the wait for it.
const COLD_BOOT_GUARD_MAX_MS = 30000;

// Steam's boot reflex can land outside our cards; give it a head start, then claim the first card.
const COLD_BOOT_FALLBACK_GRACE_MS = 2000;

function walkBackToEarlierShelf(doc: Document, orderedShelfIds: string[], focusedIdx: number): void {
  for (let i = 0; i < focusedIdx; i++) {
    const earlier = doc.querySelector(`.ds-card[data-shelfid="${orderedShelfIds[i]}"]`) as HTMLElement | null;
    if (!earlier) continue;
    const navNode = findNavNodeForElement(earlier);
    if (navNode) autoTakeNavFocus(navNode);
    break;
  }
}

// `activeElement` is reliable here; the gpfocus class isn't always applied.
function focusedDsCard(doc: Document): HTMLElement | null {
  const byClass = doc.querySelector(".ds-card.gpfocus") as HTMLElement | null;
  if (byClass) return byClass;
  const active = doc.activeElement as HTMLElement | null;
  return (active?.closest?.(".ds-card") as HTMLElement | null) ?? null;
}

function shouldReclaim(doc: Document, start: number, lastClaimAt: number): boolean {
  return Date.now() - lastClaimAt >= 400 && fallbackGraceOver(doc, start);
}

// The first configured shelf may be empty or filtered out on this device.
function claimFirstCardFocus(doc: Document, orderedShelfIds: string[]): boolean {
  for (const id of orderedShelfIds) {
    const first = doc.querySelector(`.ds-card[data-shelfid="${id}"]`) as HTMLElement | null;
    if (!first) continue;
    const navNode = findNavNodeForElement(first);
    return !!navNode && autoTakeNavFocus(navNode);
  }
  return false;
}

// Steam's own row on screen above our shelves (its recents, or the replaced ones) comes before all of them.
export type NativeRowFocus = { holdsFocus: (doc: Document) => boolean; focusFirst: (doc: Document) => boolean };

// An online shelf can render before an earlier local shelf and Steam's boot focus follows that race,
// so focus is walked back once an earlier shelf has cards.
export function beginColdBootFocusGuard(orderedShelfIds: string[], nativeRow?: NativeRowFocus): void {
  if (hasPendingFocus() || orderedShelfIds.length < 1) return;
  coldBootAbort?.abort();
  const abort = new AbortController();
  coldBootAbort = abort;

  const doc = getPreferredSteamDocument();
  if (!doc) return;

  // A real directional press means the user is in control; stand down for good.
  let userNavigated = false;
  const onDirection = () => { userNavigated = true; };
  doc.addEventListener("vgp_ondirection", onDirection, true);
  const cleanup = () => doc.removeEventListener("vgp_ondirection", onDirection, true);
  abort.signal.addEventListener("abort", cleanup, { once: true });

  // BTakeFocus reports success even when the node isn't reachable, so keep claiming until a card holds focus.
  let lastClaimAt = 0;
  const armedAt = Date.now();
  let start = armedAt;
  const expired = () => Date.now() - start >= COLD_BOOT_GUARD_MS || Date.now() - armedAt >= COLD_BOOT_GUARD_MAX_MS;
  // A boot-only helper: it also stands down while a game or another page holds the Home.
  const standDown = () => abort.signal.aborted || userNavigated || getPowerState() !== 'active';
  const claim = () => {
    lastClaimAt = Date.now();
    if (!nativeRow?.focusFirst(doc)) claimFirstCardFocus(doc, orderedShelfIds);
  };
  const correctFocus = () => {
    const gp = focusedDsCard(doc);
    if (gp && nativeRow?.focusFirst(doc)) return;
    const focusedIdx = orderedShelfIds.indexOf(gp?.getAttribute("data-shelfid") ?? "");
    if (focusedIdx > 0) walkBackToEarlierShelf(doc, orderedShelfIds, focusedIdx);
    else if (!gp && shouldReclaim(doc, start, lastClaimAt)) claim();
  };
  const tick = () => {
    if (standDown()) { cleanup(); return; }
    if (!doc.querySelector(".ds-card")) start = Date.now();
    if (!nativeRow?.holdsFocus(doc)) correctFocus();
    if (!expired()) { setTimeout(tick, 200); return; }
    cleanup();
  };
  setTimeout(tick, 200);
}

let activeAbort: AbortController | null = null;
let activeTarget: number | null = null;
let activeRetake: (() => void) | null = null;
const RETAKE_WINDOW_MS = 3500;
// How much longer a restore waits for a card that is not on the page yet.
const LATE_SHELF_GRACE_MS = 24_000;

export function beginFocusRestoreLoop(): void {
  if (!pendingAppid) return;
  // The loop for this target is still alive (the Home came back while it waited): a fresh window, not a second loop.
  if (activeAbort && !activeAbort.signal.aborted && activeTarget === pendingAppid) { activeRetake?.(); return; }

  activeAbort?.abort();
  const abort = new AbortController();
  activeAbort = abort;
  activeTarget = pendingAppid;

  const targetAppid = pendingAppid;
  const targetShelfId = pendingShelfId;
  const doc = homeDocument();
  if (!doc?.body) return;

  const FALLBACK_AFTER = Date.now() + 2500;
  // Prefer the original shelf until FALLBACK_AFTER, or another shelf with the same appid wins focus.
  const findCard = (): HTMLElement | null => {
    const d = homeDocument();
    if (targetShelfId) {
      const scoped = d.querySelector(`.ds-card[data-appid="${targetAppid}"][data-shelfid="${targetShelfId}"]`) as HTMLElement | null;
      if (scoped) return scoped;
      if (Date.now() < FALLBACK_AFTER) return null;
    }
    return d.querySelector(`.ds-card[data-appid="${targetAppid}"]`) as HTMLElement | null;
  };

  const isDone = () => abort.signal.aborted || !pendingAppid || pendingAppid !== targetAppid;

  // Steam's own first-card focus can fire seconds after the Home remounts, so focus is re-taken if it drifts.
  // Gated on `activeAbort === abort` because `succeed()` itself aborts the signal.
  const scheduleConfirmation = () => {
    // A directional press means the user is back in control; stand down for good.
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
        if (navNode && autoTakeNavFocus(navNode)) reTakes++;
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
    if (homeCovered()) return false;
    const card = findCard();
    if (!card) return false;
    // BTakeFocus returns true even on a stale node, so success waits until the card really holds focus.
    if (card.classList.contains("gpfocus")) { succeed(); return true; }
    const navNode = findNavNodeForElement(card);
    if (navNode) {
      autoTakeNavFocus(navNode);
      return false;
    }
    // The outer hard timeout clears the pending state.
    return false;
  };

  // setTimeout, not rAF: rAF is throttled while the shared context is hidden.
  let deadline = Date.now() + RETAKE_WINDOW_MS;
  const tick = () => {
    if (isDone()) return;
    if (attempt()) return;
    if (Date.now() >= deadline) return;
    setTimeout(tick, 120);
  };
  setTimeout(tick, 0);
  // A card that lands late (a lower shelf mounting its row) is taken at once
  // and, after the window, gets a re-issue window of its own.
  const retakeWindow = () => {
    const expired = Date.now() >= deadline;
    deadline = Date.now() + RETAKE_WINDOW_MS;
    if (expired) setTimeout(tick, 0);
    else attempt();
  };
  activeRetake = retakeWindow;

  // A card added later (its shelf just mounted its row) sits inside the added
  // node, not on the mutation's target.
  const holdsTarget = (n: Node): boolean => {
    const el = n as HTMLElement;
    if (el.nodeType !== 1) return false;
    const sel = `.ds-card[data-appid="${targetAppid}"]`;
    return !!el.matches?.(sel) || !!el.querySelector?.(sel);
  };
  const targetAppeared = (m: MutationRecord): boolean => m.type === "childList" && Array.from(m.addedNodes).some(holdsTarget);
  const isTargetCard = (el: HTMLElement): boolean => {
    if (!el.matches?.(`.ds-card[data-appid="${targetAppid}"]`)) return false;
    return !(targetShelfId && el.dataset?.shelfid && el.dataset.shelfid !== targetShelfId);
  };

  // Succeed only on the target card; reacting to any focus change would hijack the user's navigation.
  const observer = new MutationObserver((mutations) => {
    if (isDone()) { observer.disconnect(); return; }
    for (const m of mutations) {
      if (targetAppeared(m)) { retakeWindow(); return; }
      const el = m.target as HTMLElement;
      if (!isTargetCard(el)) continue;
      if (el.classList.contains("gpfocus")) { succeed(); observer.disconnect(); return; }
      attempt();
      return;
    }
  });
  const observeRoot = (doc.querySelector(".deck-shelves-root") as HTMLElement | null) ?? doc.body;
  observer.observe(observeRoot, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });

  // Long enough for the confirmation window; a card not on the page yet is kept longer.
  // While a game or another page holds the Home the target is kept: the return starts a new loop.
  const giveUp = () => {
    if (abort.signal.aborted) return;
    observer.disconnect();
    if (getPowerState() === 'active') clearPending();
    abort.abort();
  };
  setTimeout(() => {
    if (abort.signal.aborted) return;
    if (!findCard()) { setTimeout(giveUp, LATE_SHELF_GRACE_MS); return; }
    giveUp();
  }, 6000);

  abort.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
