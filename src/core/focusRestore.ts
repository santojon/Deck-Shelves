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

/* Once the player moves around the Home themselves, a pending restore is stale.
   Left alone it fired later, when its shelf finally mounted, and pulled focus
   into that shelf in the middle of their navigation. */
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

/* Drop a pending restore target and stop its loop: for a driver that takes
   the focus itself (a dev hook), so no earlier target pulls it back. */
export function clearFocusTarget(): void {
  activeAbort?.abort();
  clearPending();
}

// The card a Home rebuild should land on, if a restore is pending.
export function getPendingFocusTarget(): { appid: number; shelfId: string | null } | null {
  if (!pendingAppid || Date.now() - pendingTimestamp > FOCUS_RESTORE_TIMEOUT) return null;
  return { appid: pendingAppid, shelfId: pendingShelfId };
}

/* Remember the currently focused DS card as the restore target — for leave
   paths that aren't a card activation (B to Library, QAM, side nav). Nav
   tree first, gpfocus class as fallback. Never overwrites a pending target:
   an activation already saved a newer, more specific one. */
export function saveFocusTargetFromFocusedCard(): void {
  if (pendingAppid) return;
  const card = findFocusedDsCard();
  if (!card) return;
  const appid = Number(card.getAttribute("data-appid"));
  if (!Number.isFinite(appid) || appid <= 0) return;
  saveFocusTarget(appid, card.getAttribute("data-shelfid") ?? undefined);
}

/* Home tree's last-focus node first; the nav CONTEXT's last-focus node next (a
   freshly rebuilt home tree can carry none while the context still does —
   seen live as "no card to remember" on some leaves); `gpfocus` class last. */
function findFocusedDsCard(): HTMLElement | null {
  const fromTree = getLastFocusedElement()?.closest?.(".ds-card") as HTMLElement | null | undefined;
  if (fromTree) return fromTree;
  const fromContext = getActiveFocusedElement()?.closest?.(".ds-card") as HTMLElement | null | undefined;
  if (fromContext) return fromContext;
  return (getPreferredSteamDocument()?.querySelector(".ds-card.gpfocus") as HTMLElement | null) ?? null;
}

// Exposed for on-device drivers (dev hooks): the focused DS card by the same rules.
export function getFocusedDsCardAppid(): string | null {
  return findFocusedDsCard()?.getAttribute("data-appid") ?? null;
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

/* The nav node a DS element actually registered, read off its React fiber
   (Steam's Focusable keeps it in a ref hook). Realm/context-independent: a
   cold boot on this beta can leave the controller's active/last contexts with
   tree COPIES lacking our nodes (or no active context), so the tree walk finds
   nothing and focus stays where Steam's boot reflex parked it (search field). */
function hookNavNode(fiber: any, el: HTMLElement): any {
  for (let hook = fiber.memoizedState; hook && typeof hook === "object"; hook = hook.next) {
    const node = hook.memoizedState?.current;
    if (!node || node.m_Tree === undefined) continue;
    const owner = nodeElement(node);
    if (owner === el || owner?.contains(el)) return node;
  }
  return null;
}

// The nav node a Steam Focusable keeps on its own fiber (a ref hook) — found
// even when the node hangs off a parent that does not list it.
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

// Whether a tree in this context carries our Home (a `.deck-shelves-root` node).
function contextReachesHome(ctx: any): boolean {
  const walk = (node: any): boolean => {
    const el = nodeElement(node);
    if (el?.classList?.contains("deck-shelves-root")) return true;
    return (node?.m_rgChildren ?? []).some(walk);
  };
  return (ctx?.m_rgGamepadNavigationTrees ?? []).some((t: any) => walk(t.m_Root ?? t.Root ?? t));
}

/* Make the node's own context the controller's active one when the active
   context cannot reach our Home (none, or a copy without our nodes) — never
   while another live context (QAM, a modal) legitimately owns input. Also
   release a native text field holding DOM focus, or BTakeFocus is a no-op. */
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

/* Confirmed live (2026-09-11 beta): Steam's real nav tree has no entry for
   our shelf content on this build. Raw DOM .focus() here would desync
   document.activeElement from the node Steam's tree still tracks (e.g. the
   search bar) — native elements with a real nav node keep the fallback. */
function isUnintegratedDsElement(el: HTMLElement): boolean {
  return !!el.closest?.(".ds-card, .deck-shelves-root");
}

/* Another page (a game page that is opening) covers the Home, which stays
   mounted behind it for a moment. Read from Steam's own router (see the gate);
   a client that doesn't expose it counts as not covered. */
function homeCovered(): boolean {
  return homeRouteCovered();
}

/* No automatic focus grabs while a game runs, while another page covers the
   Home, or while the gate holds the Home (suspend): taking focus then steals
   input from the Steam menu / Quick Access, or leaves the opening page with
   none. The pending target is kept. */
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

// focusElement for the automatic callers (first-shelf landing, plugin-off
// restore): a no-op outside the active Home. User-driven moves keep focusElement.
export function focusElementAuto(el: HTMLElement): boolean {
  return autoFocusAllowed() && focusElement(el);
}

const FOCUS_FIRST_POLL_MS = 600;
const FOCUS_FIRST_WINDOW_MS = 25_000;

/* The Home's "land on the first shelf" poll as a gate task: `tryFocus` every
   600 ms for up to 25 s while the Home is active (the home tree can become the
   active context well after mount), held while it is not, and one more attempt
   on each return when no real card holds focus. Returns the cleanup. */
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
    onResume: () => { if (!aRealCardHasFocus()) tryFocus(); },
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

// Steam's boot reflex parked focus in its own search field — a known-wrong
// landing we don't need to give any grace to before claiming the first card.
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
// The window counts from the first rendered card (a themed cold boot mounted
// ~6 s before any card and dropped focus 2 s after it landed, past the window)
// — this cap bounds the wait for that first card.
const COLD_BOOT_GUARD_MAX_MS = 30000;

/* Steam's own "focus first card" boot reflex can land on something that
   isn't one of our cards at all (confirmed live: the native search field,
   persistently, on a beta's Big Art home) — give it a head start in case
   it's just slow, then claim the first card ourselves if it never showed. */
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

/* `activeElement` is the reliable read on this client; the `gpfocus` class
   is not always applied. */
function focusedDsCard(doc: Document): HTMLElement | null {
  const byClass = doc.querySelector(".ds-card.gpfocus") as HTMLElement | null;
  if (byClass) return byClass;
  const active = doc.activeElement as HTMLElement | null;
  return (active?.closest?.(".ds-card") as HTMLElement | null) ?? null;
}

function shouldReclaim(doc: Document, start: number, lastClaimAt: number): boolean {
  return Date.now() - lastClaimAt >= 400 && fallbackGraceOver(doc, start);
}

/* First shelf *with a card* in order — the first configured shelf may be
   empty or filtered out on this device, so keying on its id alone never
   claimed anything (seen live on a themed cold boot). */
function claimFirstCardFocus(doc: Document, orderedShelfIds: string[]): boolean {
  for (const id of orderedShelfIds) {
    const first = doc.querySelector(`.ds-card[data-shelfid="${id}"]`) as HTMLElement | null;
    if (!first) continue;
    const navNode = findNavNodeForElement(first);
    return !!navNode && autoTakeNavFocus(navNode);
  }
  return false;
}

/* Cold-boot default-focus fix: an online shelf reads a synchronous
   localStorage cache and can render before an earlier LOCAL shelf finishes
   loading Steam's own library store. Steam's "focus first card" boot reflex
   ignores shelf order, so it lands wherever that race landed first — walk it
   back once an earlier shelf has cards; no-op once it already landed right. */
export function beginColdBootFocusGuard(orderedShelfIds: string[]): void {
  if (hasPendingFocus() || orderedShelfIds.length < 1) return;
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

  /* `BTakeFocus` reports success even when the node isn't reachable yet, so
     never latch on it: keep claiming (every other tick) until a card really
     holds focus. */
  let lastClaimAt = 0;
  const armedAt = Date.now();
  let start = armedAt;
  const expired = () => Date.now() - start >= COLD_BOOT_GUARD_MS || Date.now() - armedAt >= COLD_BOOT_GUARD_MAX_MS;
  // A boot-only helper: it also stands down while a game or another page holds the Home.
  const standDown = () => abort.signal.aborted || userNavigated || getPowerState() !== 'active';
  const tick = () => {
    if (standDown()) { cleanup(); return; }
    if (!doc.querySelector(".ds-card")) start = Date.now();
    const gp = focusedDsCard(doc);
    const focusedIdx = orderedShelfIds.indexOf(gp?.getAttribute("data-shelfid") ?? "");
    if (focusedIdx > 0) {
      walkBackToEarlierShelf(doc, orderedShelfIds, focusedIdx);
    } else if (!gp && shouldReclaim(doc, start, lastClaimAt)) {
      lastClaimAt = Date.now();
      claimFirstCardFocus(doc, orderedShelfIds);
    }
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

  // Cancel any previous restore loop
  activeAbort?.abort();
  const abort = new AbortController();
  activeAbort = abort;
  activeTarget = pendingAppid;

  const targetAppid = pendingAppid;
  const targetShelfId = pendingShelfId;
  const doc = homeDocument();
  if (!doc?.body) return;

  const FALLBACK_AFTER = Date.now() + 2500;
  // Prefer the original shelf for as long as possible; only fall back to
  // any-appid match after FALLBACK_AFTER. Without this, a shelf with the
  // same appid (online wishlist, etc.) that resolves first wins focus.
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

  // Steam's native "focus first card on home mount" fires once,
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
    // Success is declared ONLY when the card actually holds gamepad focus.
    // BTakeFocus returns true even on a stale node during the post-remount
    // nav-tree rebuild, so the previous tick's BTakeFocus is verified here.
    if (card.classList.contains("gpfocus")) { succeed(); return true; }
    const navNode = findNavNodeForElement(card);
    if (navNode) {
      autoTakeNavFocus(navNode);
      // Not confirmed yet — let the next poll verify gpfocus landed.
      return false;
    }
    // No navNode: skip the raw DOM-focus fallback (see focusElement above)
    // and let the outer 6s hard timeout clear pending state.
    return false;
  };

  // setTimeout-based poll — NOT requestAnimationFrame: rAF does fire in
  /* SharedJSContext, but it is throttled whenever that context is hidden, and
     this retry needs a steady cadence. Polling every ~120ms keeps re-issuing
     BTakeFocus until the rebuilt nav tree settles and the focus sticks. The
     3.5s window covers a shelf below the fold that renders ~2-3s later. */
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

  // MutationObserver: succeed only when TARGET card is added/focused.
  // Do NOT re-steal focus on arbitrary gpfocus changes — that hijacks the
  // user's own navigation after the initial restore window.
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

  /* 6 s lets scheduleConfirmation's 5 s window run before the target is
     dropped. A target whose card is not on the page yet (a lower shelf still
     mounting on a rebuilt Home) is kept longer, bounded; the observer above
     retries when the card lands. */
  const giveUp = () => {
    if (abort.signal.aborted) return;
    observer.disconnect();
    clearPending();
    abort.abort();
  };
  setTimeout(() => {
    if (abort.signal.aborted) return;
    if (!findCard()) { setTimeout(giveUp, LATE_SHELF_GRACE_MS); return; }
    giveUp();
  }, 6000);

  // Cleanup on abort
  abort.signal.addEventListener("abort", () => observer.disconnect(), { once: true });
}
