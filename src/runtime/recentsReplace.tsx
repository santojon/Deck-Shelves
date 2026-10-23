import { findInReactTree } from "./host/decky";
import { installRecentsRowPatch, type RecentsRowContent, type RecentsRowHooks, type RecentsRowPatch, type RecentsRowReport } from "./recentsRowPatch";
import { getCurrentSettings, subscribeSettings } from "../settingsStore";
import { evalVisibility } from "../steam/smartShelves";
import { applyManualOrder } from "../steam";
import { isOnlineSource } from "../domain/sourceUtils";
import { getPlatform } from "./platformContext";
import { subscribeShelfRefresh } from "../core/shelfRefresh";
import { logError, logInfo, logWarn } from "./logger";
import { notify } from "../components/notify";
import i18next from "i18next";

type PatchHandle = { uninstall?: () => void } | null;

let cachedAppIds: number[] | null = null;
let cachedShelfId: string | null = null;
let cachedTitle: string | null = null;
let resolvePromise: Promise<void> | null = null;
let lastResolveKey = "";
/* A thrown resolve (vs. a clean empty result) is usually a transient
   cold-boot race (e.g. collectionStore not built yet) rather than a
   genuinely broken shelf — retry the SAME shelf a couple of times before
   giving up and promoting the next candidate. */
let lastFailedShelfId: string | null = null;
let sameShelfRetryCount = 0;
const SAME_SHELF_MAX_RETRIES = 2;
const SAME_SHELF_RETRY_MS = 1200;
let silentPatchFailures = 0;
let overlayFocusedAppId = 0;
let rowPatch: RecentsRowPatch | null = null;
// Focus pacing: app-overview changes fire constantly while an app is
// running/updating; without pacing they re-resolve and re-render the row
// mid-navigation, and focus jumps.
let lastItemFocusAt = 0;
let overviewDebounce: ReturnType<typeof setTimeout> | null = null;
let remountTimer: ReturnType<typeof setTimeout> | null = null;
const FOCUS_GUARD_MS = 2000;
const OVERVIEW_DEBOUNCE_MS = 1500;
function clearPacingTimers(): void {
  if (overviewDebounce) { clearTimeout(overviewDebounce); overviewDebounce = null; }
  if (remountTimer) { clearTimeout(remountTimer); remountTimer = null; }
}

const CRASH_WINDOW_MS = 10000;
const CRASH_THRESHOLD = 5;
let crashCount = 0;
let crashWindowStart = 0;
function resetCrashCounter() { crashCount = 0; crashWindowStart = 0; }

export function getOverlayFocusedAppId(): number { return overlayFocusedAppId; }
export function getOverlayFirstCachedAppId(): number { return cachedAppIds?.[0] ?? 0; }

// --- Failed state (pub/sub) ---------------------------------------------
let replaceFailed = false;
let replaceError: string | null = null;
const failedListeners = new Set<() => void>();

export function getRecentsReplaceFailed(): boolean { return replaceFailed; }
export function getRecentsReplaceError(): string | null { return replaceError; }
export function subscribeRecentsReplaceFailed(cb: () => void): () => void {
  failedListeners.add(cb);
  return () => { failedListeners.delete(cb); };
}
export function getRecentsReplaceActiveShelfId(): string | null { return cachedShelfId; }
export function isRecentsReplaceInjecting(): boolean {
  if (replaceFailed) return false;
  const shelf = activeFirstShelf();
  return !!shelf && !!cachedAppIds && cachedAppIds.length > 0;
}
const injectingListeners = new Set<() => void>();
export function subscribeRecentsReplaceInjecting(cb: () => void): () => void {
  injectingListeners.add(cb);
  return () => { injectingListeners.delete(cb); };
}
function notifyInjectingChange() { for (const cb of injectingListeners) { try { cb(); } catch {} } }
export function resetRecentsReplaceFailed(): void {
  replaceFailed = false;
  replaceError = null;
  silentPatchFailures = 0;
  cachedAppIds = null;
  cachedShelfId = null;
  lastResolveKey = "";
  clearPacingTimers();
  resetCrashCounter();
  notifyFailedChange();
  notifyInjectingChange();
}
function notifyFailedChange() { for (const cb of failedListeners) { try { cb(); } catch {} } }
function markReplaceFailed(reason: string) {
  if (replaceFailed) return;
  replaceFailed = true;
  replaceError = reason;
  if (__DEV__) logError("RUNTIME", "recents replace disabled due to error", reason);
  notify("error", { title: i18next.t("recents_replace_error_title"), body: i18next.t("recents_replace_error_desc") });
  notifyFailedChange();
  notifyInjectingChange();
  // Back to Steam's games; deferred because a report can arrive mid-render.
  void Promise.resolve().then(requestRemount);
}

// --- Steam app validation -----------------------------------------------
const RENDERABLE_STEAM_APP_TYPES: ReadonlySet<number> = new Set([1, 2, 1073741824]); // Game, Application, Non-Steam Shortcut

const appIdOf = (v: any): number => (typeof v === "number" ? v : Number(v?.appid ?? v?.nAppID));

// The collection's `apps` comes as a Set, an array or a Map-like with `values()`.
function appsIterable(apps: any): Iterable<any> | null {
  if (apps instanceof Set || Array.isArray(apps)) return apps;
  return typeof apps?.values === "function" ? apps.values() : null;
}

function ownedAppsOf(cs: any): any {
  const coll = cs.allAppsCollection ?? cs.allGamesCollection ?? cs.localGamesCollection;
  return coll?.apps;
}

function getOwnedAppIdSet(): Set<number> | null {
  const cs: any = (globalThis as any).collectionStore;
  if (!cs) return null;
  const apps = ownedAppsOf(cs);
  if (!apps) return null;
  const out = new Set<number>();
  try {
    const it = appsIterable(apps);
    if (!it) return null;
    for (const v of it) {
      const id = appIdOf(v);
      if (Number.isFinite(id) && id > 0) out.add(id);
    }
  } catch { return null; }
  return out.size > 0 ? out : null;
}

function validAppIds(ids: number[]): number[] {
  return Array.isArray(ids) ? ids.filter((n) => typeof n === "number" && n > 0) : [];
}

function filterKnownAppIds(ids: number[]): number[] {
  const store: any = (globalThis as any).appStore;
  if (!store || typeof store.GetAppOverviewByAppID !== "function") return [];
  /* `getOwnedAppIdSet()` non-null is the readiness gate (collectionStore
     has hydrated) — keep it. We DON'T require per-id owned-set membership: a valid
     renderable overview from appStore is what's actually safe to inject, and the
     membership check wrongly dropped running/update-pending Proton/runtime apps
     that live outside allAppsCollection, promoting a mismatched shelf instead. */
  if (!getOwnedAppIdSet()) return [];
  const out: number[] = [];
  for (const id of ids) {
    try {
      const ov = store.GetAppOverviewByAppID(id);
      if (ov && typeof ov.app_type === "number" && RENDERABLE_STEAM_APP_TYPES.has(ov.app_type)) {
        out.push(id);
      }
    } catch { /* skip invalid lookups */ }
  }
  return out;
}

/* Fallback for when the strict renderable filter empties: ids appStore actually
   knows (a non-null overview), of ANY app_type — pending-update Proton / Steam
   Linux Runtime apps have a non-renderable app_type and land here, so we show
   THIS shelf's real items rather than promote a different shelf. Readiness-gated
   like the strict path; the error trap stands down if Steam can't render one. */
function appStoreKnownIds(ids: number[]): number[] {
  const store: any = (globalThis as any).appStore;
  if (!store || typeof store.GetAppOverviewByAppID !== "function") return [];
  if (!getOwnedAppIdSet()) return [];
  const out: number[] = [];
  for (const id of ids) {
    try { if (store.GetAppOverviewByAppID(id)) out.push(id); } catch { /* skip */ }
  }
  return out;
}

function smartShelfToCandidate(s: any) {
  if (!s) return null;
  return {
    id: s.id,
    title: s.title,
    enabled: s.enabled !== false,
    hidden: !!s.hidden,
    limit: s.limit ?? 20,
    source: {
      type: "smart" as const,
      mode: s.mode,
      filterGroup: s.filterGroup,
      smartParams: s.smartParams,
      refreshIntervalMinutes: s.refreshIntervalMinutes,
    } as any,
    sort: s.sort,
    manualOrder: s.manualOrder,
    manualBaseSort: s.manualBaseSort,
  };
}

function visibleCandidateShelves(): any[] {
  const s = getCurrentSettings();
  if (!s) return [];
  const normals = (s.shelves ?? []).filter((sh: any) => sh.enabled && !sh.hidden && !isOnlineSource(sh.source) && evalVisibility(sh));
  const smartEnabled = s.smartShelvesEnabled === true;
  const smarts = !smartEnabled
    ? []
    : (s.smartShelves ?? [])
        .filter((sm: any) => sm.enabled !== false && !sm.hidden)
        .filter((sm: any) => evalVisibility(sm))
        .map(smartShelfToCandidate)
        .filter(Boolean) as any[];
  return [...normals, ...smarts];
}

export function activeFirstShelf() {
  if (replaceFailed) return null;
  const s = getCurrentSettings();
  if (!s?.enabled || s.hideRecents !== true || s.recentsReplaceSource !== true) return null;
  const candidates = visibleCandidateShelves();
  return candidates[0] ?? null;
}

function shelfKey(shelf: any): string {
  /* Include sort + sortReverse + manualBaseSort + manualOrder in the cache
     key so the resolver re-runs when the user edits ANY of those fields on
     the promoted shelf. Without the manual* fields, dragging cards in the
     edit modal wouldn't visibly reorder the recents shelf until the cache
     expired. */
  const sortKey = JSON.stringify(shelf.sort ?? null);
  const reverseKey = JSON.stringify(shelf.sortReverse ?? null);
  const baseSortKey = JSON.stringify(shelf.manualBaseSort ?? null);
  const baseReverseKey = JSON.stringify(shelf.manualBaseSortReverse ?? null);
  // manualOrder can be long; use length + first/last as a cheap fingerprint
  // rather than serialising the whole array (cache key gets compared every
  // resolve tick).
  const mo = Array.isArray(shelf.manualOrder) ? shelf.manualOrder : [];
  const moKey = `${mo.length}:${mo[0] ?? ''}:${mo[mo.length - 1] ?? ''}`;
  return `${shelf.id}:${JSON.stringify(shelf.source)}:${shelf.limit ?? 20}:${sortKey}:${reverseKey}:${baseSortKey}:${baseReverseKey}:${moKey}`;
}

type ResolveContext = {
  isManual: boolean;
  sort: string | string[] | undefined;
  reverse: boolean | boolean[] | undefined;
  source: any;
  manualOrder: number[] | undefined;
  hiddenAppIds: number[] | undefined;
};

/* Filter sources carry their `sort` inside `source.filter` — under manual
   sort the resolver looks at that nested field, not the third arg. Swap it
   to the base sort for this resolve only (same trick Shelf.tsx uses). */
function manualResolveSource(shelf: any, manualBaseSort: any): any {
  if (shelf.source?.type !== 'filter') return shelf.source;
  return { ...shelf.source, filter: { ...(shelf.source as any).filter, sort: manualBaseSort ?? 'alphabetical' } };
}

/* The shelf's full sort context for the resolver. Mirrors Shelf.tsx's
   manual handling: resolve with manualBaseSort, then applyManualOrder, so
   the promoted recents row matches the home. */
function resolveContextFor(shelf: any): ResolveContext {
  const shelfSort = shelf.sort;
  const manualBaseSort = shelf.manualBaseSort;
  const primaryEffectiveSort = Array.isArray(shelfSort) ? shelfSort[0] : shelfSort;
  const isManual = primaryEffectiveSort === 'manual';
  return {
    isManual,
    sort: isManual ? (manualBaseSort ?? 'alphabetical') : shelfSort,
    reverse: isManual ? shelf.manualBaseSortReverse : shelf.sortReverse,
    source: isManual ? manualResolveSource(shelf, manualBaseSort) : shelf.source,
    manualOrder: shelf.manualOrder,
    hiddenAppIds: shelf.hiddenAppIds?.length ? shelf.hiddenAppIds : undefined,
  };
}

function scheduleResolve(shelf: any) {
  const key = shelfKey(shelf);
  if (key === lastResolveKey && cachedAppIds) return;
  if (resolvePromise) return;
  lastResolveKey = key;
  const platform = getPlatform();
  if (!platform) return;
  /* Forward the shelf's full sort context — without it the resolver falls
     back to its default ordering and the "shelf as recents" promotion
     ignores the user's chosen sort. shelfKey() above already namespaces
     the cache entry by source, so same-source shelves don't collide. */
  const rc = resolveContextFor(shelf);
  resolvePromise = platform
    .resolveShelfAppIds(rc.source, shelf.limit ?? 20, rc.sort, shelf.id, rc.reverse)
    .then((ids: number[]) => rc.isManual ? applyManualOrder(ids, rc.manualOrder, rc.hiddenAppIds) : ids)
    .then((ids: number[]) => {
      const prev = cachedAppIds;
      const valid = validAppIds(ids);
      let finalIds = filterKnownAppIds(valid);
      if (finalIds.length === 0) {
        if (valid.length > 0 && !getOwnedAppIdSet()) {
          // Fresh-boot window: collectionStore hasn't built
          // allAppsCollection yet. Injecting ids before that's ready
          /* crashes Steam's userCollections getter. Don't
             promote to next candidate either — every shelf will look
             "empty" until the store loads. Bail silently; the periodic
             tick + RegisterForAppOverviewChanges will retry once
             collectionStore comes online. */
          lastResolveKey = "";
          return;
        }
        /* Strict renderable filter emptied it. Try appStore-known ids of ANY
           type (pending-update Proton/runtime) so we show THIS shelf's items
           instead of PROMOTING a different shelf; still-empty → native recents
           (empty cachedAppIds → no content). Error trap guards a bad type. */
        finalIds = appStoreKnownIds(valid);
        if (finalIds.length === 0) { cachedAppIds = []; return; }
      }
      sameShelfRetryCount = 0;
      lastFailedShelfId = null;
      cachedAppIds = finalIds;
      cachedShelfId = shelf.id;
      cachedTitle = shelf.title ?? cachedTitle;
      const changed = prev?.length !== cachedAppIds.length || prev?.some((v, i) => v !== cachedAppIds![i]);
      if (changed) {
        notifyInjectingChange();
        requestRemount();
      }
    })
    .catch((err) => {
      logWarn("RUNTIME", "resolveShelfAppIds failed", String(err));
      sameShelfRetryCount = lastFailedShelfId === shelf.id ? sameShelfRetryCount + 1 : 1;
      lastFailedShelfId = shelf.id;
      if (sameShelfRetryCount <= SAME_SHELF_MAX_RETRIES) {
        lastResolveKey = "";
        setTimeout(() => scheduleResolve(shelf), SAME_SHELF_RETRY_MS);
        return;
      }
      // Retries exhausted — promote to the next candidate (typical for
      // online shelves when the network is down or online features are off)
      // so a persistently-failing first shelf doesn't leave recents empty.
      sameShelfRetryCount = 0;
      lastFailedShelfId = null;
      const candidates = visibleCandidateShelves();
      const currentIdx = candidates.findIndex((sh: any) => sh.id === shelf.id);
      const next = candidates[currentIdx + 1];
      if (next) {
        lastResolveKey = "";
        setTimeout(() => scheduleResolve(next), 0);
      } else {
        cachedAppIds = [];
      }
    })
    .finally(() => { resolvePromise = null; });
}

/* Ask the row to render again with the latest content, but never while the
   user is moving through it, so focus does not jump. If a tile was focused
   within FOCUS_GUARD_MS, defer and re-check once the window elapses
   (re-arming until navigation pauses). */
function requestRemount() {
  if (Date.now() - lastItemFocusAt > FOCUS_GUARD_MS) { safeCall(() => rowPatch?.requestRender()); return; }
  if (remountTimer) return;
  remountTimer = setTimeout(() => { remountTimer = null; requestRemount(); }, FOCUS_GUARD_MS);
}

function safeCall(fn: any): void {
  try { fn?.(); } catch {}
}

function shouldShowFeatured(shelf: any, s: any): boolean {
  return !!(shelf.highlightFirst || shelf.highlightAll || s?.globalHighlightFirst || s?.globalHighlightAll);
}

/* The heading's text element: the first element in the scope whose children
   is a single non-blank string. */
function findRecentsTitleNode(scope: any): any | null {
  try {
    return findInReactTree(scope, (x: any) => x?.props && typeof x.props.children === "string" && x.props.children.trim().length > 0) ?? null;
  } catch { return null; }
}

function setRecentsTitle(scope: any, title: string): void {
  if (!title) return;
  const node = findRecentsTitleNode(scope);
  if (node) { try { node.props.children = title; } catch {} }
}

/* What the row shows now. Null keeps Steam's games: no active shelf, or no
   games for it yet (a resolve is scheduled then). */
function rowContent(): RecentsRowContent | null {
  const shelf = activeFirstShelf();
  if (!shelf) return null;
  if (!cachedAppIds?.length) { scheduleResolve(shelf); return null; }
  return {
    appIds: cachedAppIds.slice(0, Math.max(1, shelf.limit ?? 20)),
    title: cachedTitle ?? shelf.title ?? "",
    largeFirstTile: shouldShowFeatured(shelf, getCurrentSettings()),
  };
}

function onRowTileFocus(appId: number): void {
  lastItemFocusAt = Date.now();
  overlayFocusedAppId = appId;
}

// Ten misses in a row, or one error, turn the feature off for the session.
function onRowReport(report: RecentsRowReport): void {
  if (report.kind === "applied") { silentPatchFailures = 0; return; }
  if (report.kind === "error") { markReplaceFailed(report.detail); return; }
  silentPatchFailures++;
  if (silentPatchFailures >= 10) markReplaceFailed(report.detail);
}

const rowHooks: RecentsRowHooks = {
  getContent: rowContent,
  writeTitle: setRecentsTitle,
  onTileFocus: onRowTileFocus,
  onReport: onRowReport,
};

// --- Global error trap --------------------------------------------------
// Any uncaught error whose stack references our plugin namespace AND contains
// the known collectionStore/appStore signatures flips the kill switch.
function isOurCrashFingerprint(msg: string): boolean {
  if (!msg) return false;
  if (msg.includes("Cannot read properties of undefined") && msg.includes("values")) return true;
  // Reading a system-collection getter before collectionStore has
  // hydrated throws inside Steam's SystemCollectionIdToName (undefined `.get`).
  // Match on the stack (below) so we don't over-catch generic `.get` errors.
  if (msg.includes("SystemCollectionIdToName") || msg.includes("recentAppsCollection")) return true;
  // React error #301 (Maximum update depth) — a state update cascade in a
  // render of the row.
  if (msg.includes("Minified React error #301")) return true;
  if (msg.includes("Maximum update depth")) return true;
  return false;
}

function extractErrorMessage(evt: any): string {
  const e = evt || {};
  // Include the stack: the crash message is a generic "reading 'get'"; only
  // the stack names the collection getter that identifies it as our crash.
  const cands = [e.error?.message, e.message, e.reason?.message, e.reason];
  for (const c of cands) if (c) return `${String(c)}\n${String(e.error?.stack ?? e.reason?.stack ?? "")}`;
  return "";
}

function installGlobalErrorTrap() {
  try {
    const handler = (evt: any) => {
      // Only fire when replacement is actively injecting (not just configured)
      if (!isRecentsReplaceInjecting()) return;
      const msg = extractErrorMessage(evt);
      if (!isOurCrashFingerprint(msg)) return;
      const now = Date.now();
      if (now - crashWindowStart > CRASH_WINDOW_MS) { crashCount = 0; crashWindowStart = now; }
      crashCount++;
      if (crashCount >= CRASH_THRESHOLD) markReplaceFailed(msg.slice(0, 160));
    };
    (globalThis as any).addEventListener?.("error", handler, true);
    (globalThis as any).addEventListener?.("unhandledrejection", handler, true);
    return () => {
      try {
        (globalThis as any).removeEventListener?.("error", handler, true);
        (globalThis as any).removeEventListener?.("unhandledrejection", handler, true);
      } catch {}
    };
  } catch { return () => {}; }
}

function reResolveActiveShelf(): void {
  const shelf = activeFirstShelf();
  if (shelf) { lastResolveKey = ""; scheduleResolve(shelf); }
}

// Debounced: an app running/updating fires overview changes continuously;
// coalesce them into one re-resolve so we don't churn the shelf mid-use.
function subscribeAppOverviewChanges(onChange: () => void): (() => void) | null {
  try {
    const client: any = (globalThis as any).SteamClient;
    const reg = client?.Apps?.RegisterForAppOverviewChanges?.(() => {
      if (overviewDebounce) clearTimeout(overviewDebounce);
      overviewDebounce = setTimeout(() => { overviewDebounce = null; onChange(); }, OVERVIEW_DEBOUNCE_MS);
    });
    return reg?.unregister ? () => reg.unregister() : null;
  } catch { return null; }
}

/* collectionStore.on('change') fires when the user's collections (and the
   underlying allAppsCollection.apps set) finish populating on cold boot, or
   when the user installs/removes an app. Either is a good moment to
   re-resolve: boot unblocks the owned-set filter, install/uninstall keeps
   the recents list aligned with the library. */
function subscribeCollectionChanges(onChange: () => void): (() => void) | null {
  try {
    const cs: any = (globalThis as any).collectionStore;
    if (!cs || typeof cs.on !== "function") return null;
    cs.on("change", onChange);
    return () => { try { cs.off?.("change", onChange); } catch {} };
  } catch { return null; }
}

function subscribeResumeFromSuspend(onResume: () => void): (() => void) | null {
  try {
    const client: any = (globalThis as any).SteamClient;
    const reg = client?.System?.RegisterForOnResumeFromSuspend?.(onResume);
    return reg?.unregister ? () => reg.unregister() : null;
  } catch { return null; }
}

export function installRecentsReplace(routerHook: any): PatchHandle {
  // Unavailable on this client: stay off quietly, nothing else installed.
  const handle = installRecentsRowPatch(routerHook, rowHooks);
  if (!handle) { logInfo("RUNTIME", "recents row unavailable"); return null; }
  rowPatch = handle;

  const uninstallErrorTrap = installGlobalErrorTrap();

  const unsubSettings = subscribeSettings(() => {
    const shelf = activeFirstShelf();
    if (!shelf) {
      const hadData = !!cachedAppIds?.length;
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null; lastResolveKey = "";
      // No longer wanted: the row goes back to Steam's games.
      if (hadData) { notifyInjectingChange(); requestRemount(); }
      return;
    }
    if (shelfKey(shelf) !== lastResolveKey) {
      cachedAppIds = null; cachedShelfId = null; lastResolveKey = "";
      notifyInjectingChange();
      scheduleResolve(shelf);
    }
  });

  const unsubApp = subscribeAppOverviewChanges(reResolveActiveShelf);

  /* The promoted shelf is "the first visible regular shelf" drawn a second
     time, so it needs the same central shelfRefresh signal the regular
     shelves already react to — without it, a change only shelfRefresh
     catches (e.g. a visibility-rule flip) left the replaced row stale until
     the next 90s tick or an unrelated settings edit re-primed the cache. */
  const unsubShelfRefresh = subscribeShelfRefresh(reResolveActiveShelf);

  /* Bootstrap: the row asks for content only when it renders, so resolve here
     too in case the Home is already up. Timers only call scheduleResolve, which
     requests a row render only when the games change. The range covers the
     first ~80s because collectionStore.allAppsCollection can take that long to
     populate on a cold boot; after that the 90s periodic tick takes over. */
  const bootstrapTimers: ReturnType<typeof setTimeout>[] = [];
  const tryResolve = () => {
    if (replaceFailed || (cachedAppIds && cachedAppIds.length > 0)) return;
    const shelf = activeFirstShelf();
    if (!shelf) return;
    lastResolveKey = "";
    scheduleResolve(shelf);
  };
  for (const d of [300, 1000, 2500, 5000, 10000, 20000, 40000, 80000]) {
    bootstrapTimers.push(setTimeout(tryResolve, d));
  }

  const unsubColl = subscribeCollectionChanges(reResolveActiveShelf);
  const resumeUnsub = subscribeResumeFromSuspend(() => {
    if (replaceFailed) return;
    cachedAppIds = null; lastResolveKey = "";
    setTimeout(tryResolve, 2000);
  });

  const periodicTimer = setInterval(tryResolve, 90 * 1000);

  logInfo("RUNTIME", "installed");

  return {
    uninstall() {
      safeCall(() => handle.uninstall());
      if (rowPatch === handle) rowPatch = null;
      safeCall(unsubSettings);
      safeCall(unsubApp);
      safeCall(unsubColl);
      safeCall(unsubShelfRefresh);
      safeCall(uninstallErrorTrap);
      safeCall(resumeUnsub);
      clearInterval(periodicTimer);
      for (const t of bootstrapTimers) { try { clearTimeout(t); } catch {} }
      clearPacingTimers();
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null;
      lastResolveKey = ""; overlayFocusedAppId = 0;
      sameShelfRetryCount = 0; lastFailedShelfId = null;
      notifyInjectingChange();
    },
  };
}
