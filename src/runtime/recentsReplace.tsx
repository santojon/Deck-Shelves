import type { ReactElement } from "react";
import { afterPatch, findInReactTree } from "./host/decky";
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
let patchedTypes: WeakSet<object> = new WeakSet();
// Focus/remount pacing: app-overview changes fire constantly while an app is
// running/updating; without pacing they re-resolve + popstate-remount the shelf
// mid-navigation, which resets gamepad focus to the first card.
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
  patchedTypes = new WeakSet();
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
}

// --- Steam app validation -----------------------------------------------
const RENDERABLE_STEAM_APP_TYPES: ReadonlySet<number> = new Set([1, 2, 1073741824]); // Game, Application, Non-Steam Shortcut

function getOwnedAppIdSet(): Set<number> | null {
  const cs: any = (globalThis as any).collectionStore;
  if (!cs) return null;
  const coll = cs.allAppsCollection ?? cs.allGamesCollection ?? cs.localGamesCollection;
  const apps = coll?.apps;
  if (!apps) return null;
  const out = new Set<number>();
  try {
    if (apps instanceof Set) {
      for (const v of apps) {
        const id = typeof v === "number" ? v : Number((v as any)?.appid ?? (v as any)?.nAppID);
        if (Number.isFinite(id) && id > 0) out.add(id);
      }
    } else if (typeof apps?.values === "function") {
      for (const v of apps.values()) {
        const id = typeof v === "number" ? v : Number((v as any)?.appid ?? (v as any)?.nAppID);
        if (Number.isFinite(id) && id > 0) out.add(id);
      }
    } else if (Array.isArray(apps)) {
      for (const v of apps) {
        const id = typeof v === "number" ? v : Number((v as any)?.appid ?? (v as any)?.nAppID);
        if (Number.isFinite(id) && id > 0) out.add(id);
      }
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
  /* `getOwnedAppIdSet()` non-null is the issue-#60 readiness gate (collectionStore
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

function activeFirstShelf() {
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

function scheduleResolve(shelf: any) {
  const key = shelfKey(shelf);
  if (key === lastResolveKey && cachedAppIds) return;
  if (resolvePromise) return;
  lastResolveKey = key;
  const platform = getPlatform();
  if (!platform) return;
  /* Forward the shelf's full sort context — without this, the resolver
     falls back to its default ordering (effectively alphabetical for many
     sources), which makes the "shelf as recents" promotion ignore the
     user's chosen sort. shelfKey() above already namespaces the cache */
  /* entry by source so two shelves with the same source but different
     sorts don't collide.

     Mirror Shelf.tsx's manual handling: resolve with manualBaseSort
     then applyManualOrder so the promoted recents matches the home. */
  const shelfSort = (shelf as any).sort;
  const shelfSortReverse = (shelf as any).sortReverse;
  const manualBaseSort = (shelf as any).manualBaseSort;
  const manualBaseSortReverse = (shelf as any).manualBaseSortReverse;
  const manualOrder: number[] | undefined = (shelf as any).manualOrder;
  const hiddenAppIds: number[] | undefined = (shelf as any).hiddenAppIds?.length ? (shelf as any).hiddenAppIds : undefined;
  const primaryEffectiveSort = Array.isArray(shelfSort) ? shelfSort[0] : shelfSort;
  const isManual = primaryEffectiveSort === 'manual';
  const resolveSort: string | string[] | undefined = isManual
    ? (manualBaseSort ?? 'alphabetical')
    : shelfSort;
  const resolveReverse: boolean | boolean[] | undefined = isManual
    ? manualBaseSortReverse
    : shelfSortReverse;
  /* Filter sources carry their `sort` inside `source.filter` — under
     manual sort the resolver looks at that nested field, not the third
     arg. Swap it to the base sort for this resolve only (same trick
     Shelf.tsx uses). */
  let resolveSource: any = shelf.source;
  if (isManual && shelf.source?.type === 'filter') {
    resolveSource = { ...shelf.source, filter: { ...(shelf.source as any).filter, sort: manualBaseSort ?? 'alphabetical' } };
  }
  resolvePromise = platform
    .resolveShelfAppIds(resolveSource, shelf.limit ?? 20, resolveSort, shelf.id, resolveReverse)
    .then((ids: number[]) => isManual ? applyManualOrder(ids, manualOrder, hiddenAppIds) : ids)
    .then((ids: number[]) => {
      const prev = cachedAppIds;
      const valid = validAppIds(ids);
      let finalIds = filterKnownAppIds(valid);
      if (finalIds.length === 0) {
        if (valid.length > 0 && !getOwnedAppIdSet()) {
          // Fresh-boot window: collectionStore hasn't built
          // allAppsCollection yet. Injecting ids before that's ready
          /* crashes Steam's userCollections getter (issue #60). Don't
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
           (empty cachedAppIds → mutate no-ops). Error trap guards a bad type. */
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

function forceRemountRecents() {
  try {
    const win: any = globalThis;
    if (win?.history?.state !== undefined) {
      win.history.replaceState(win.history.state, "", win.location.href);
      win.dispatchEvent(new Event("popstate"));
    }
  } catch (e) { logInfo("RUNTIME", "force-remount failed", String(e)); }
}

/* Remount the native recents shelf to reflect new content, but never while the
   user is actively navigating it — the popstate remount would reset focus to the
   first card. If a card was focused within FOCUS_GUARD_MS, defer and re-check
   once the window elapses (re-arming until navigation pauses). */
function requestRemount() {
  if (Date.now() - lastItemFocusAt > FOCUS_GUARD_MS) { forceRemountRecents(); return; }
  if (remountTimer) return;
  remountTimer = setTimeout(() => { remountTimer = null; requestRemount(); }, FOCUS_GUARD_MS);
}

function safeCall(fn: any): void {
  try { fn?.(); } catch {}
}

function shouldShowFeatured(shelf: any, s: any): boolean {
  return !!(shelf.highlightFirst || shelf.highlightAll || s?.globalHighlightFirst || s?.globalHighlightAll);
}

function setRecentsTitle(ret3: any, title: string): void {
  try {
    if (title) ret3.props.children[1].props.children[0].props.children[0].props.children = title;
  } catch {}
}

function mutateRecentsElement(ret3: any, shelf: any, appIds: number[]): boolean {
  try {
    const holder = findInReactTree(ret3, (x: any) => x?.props?.games && Array.isArray(x.props.games) && typeof x?.props?.onItemFocus === "function");
    if (!holder) return false;
    const trimmed = appIds.slice(0, Math.max(1, shelf.limit ?? 20));
    if (!trimmed.length) return false; // never pass empty — native expects non-empty
    holder.props.games = trimmed;
    holder.props.showFeaturedItem = shouldShowFeatured(shelf, getCurrentSettings());
    const origOnItemFocus = holder.props.onItemFocus;
    holder.props.onItemFocus = (overview: any, ...args: any[]) => {
      lastItemFocusAt = Date.now();
      try { overlayFocusedAppId = overview?.appid ?? overview?.nAppID ?? 0; } catch {}
      return origOnItemFocus?.(overview, ...args);
    };
    setRecentsTitle(ret3, cachedTitle ?? shelf.title ?? "");
    return true;
  } catch (e) {
    logWarn("RUNTIME", "mutate failed", String(e));
    return false;
  }
}

// --- Global error trap --------------------------------------------------
// Any uncaught error whose stack references our plugin namespace AND contains
// the known collectionStore/appStore signatures flips the kill switch.
function isOurCrashFingerprint(msg: string): boolean {
  if (!msg) return false;
  if (msg.includes("Cannot read properties of undefined") && msg.includes("values")) return true;
  // issue #113 — reading a system-collection getter before collectionStore has
  // hydrated throws inside Steam's SystemCollectionIdToName (undefined `.get`).
  // Match on the stack (below) so we don't over-catch generic `.get` errors.
  if (msg.includes("SystemCollectionIdToName") || msg.includes("recentAppsCollection")) return true;
  // React error #301 (Maximum update depth) — a state update cascade caused
  // by our mutation firing a Steam callback during render.
  if (msg.includes("Minified React error #301")) return true;
  if (msg.includes("Maximum update depth")) return true;
  return false;
}

function extractErrorMessage(evt: any): string {
  const e = evt || {};
  // Include the stack: issue #113's message is a generic "reading 'get'"; only
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

export function installRecentsReplace(routerHook: any): PatchHandle {
  if (!routerHook?.addPatch) return null;

  let patch: any = null;
  let unsubSettings: (() => void) | null = null;
  const uninstallErrorTrap = installGlobalErrorTrap();

  const patchFn = (props: { children: ReactElement }) => {
    try {
      // All three layers (L1 → L2 → L3) install UNCONDITIONALLY so the
      /* patch chain is fully in place regardless of `recentsReplaceSource`
         state. Only the L3 mutation step gates on the active shelf — that
         way, toggling the setting after Steam boot takes effect on the very
         next render of the native recents component (focus shift, app
         overview change, etc.), without requiring a restart. */
      if ((props.children as any)?.type?.__og) return props;

      afterPatch(props.children as any, "type", (_a: any, ret?: any) => {
        if (!ret) return ret;
        try {
          if (!ret.type || patchedTypes.has(ret.type)) return ret;
          patchedTypes.add(ret.type);
          afterPatch(ret.type, "type", (_b: any, ret2?: any) => {
            if (!ret2) return ret2;
            try {
              const recents = findInReactTree(ret2, (x: any) =>
                x?.props && "autoFocus" in x.props && "showBackground" in x.props,
              );
              if (!recents) {
                // Only count as failure when injection is actively trying to fire
                // (active shelf + cached ids). Otherwise it's a normal idle render.
                if (activeFirstShelf() && cachedAppIds?.length) {
                  silentPatchFailures++;
                  if (silentPatchFailures >= 10) markReplaceFailed("tree walk: recents node not found");
                }
                return ret2;
              }
              if (!recents.type || patchedTypes.has(recents.type)) return ret2;
              patchedTypes.add(recents.type);
              afterPatch(recents.type, "type", (_c: any, ret3?: any) => {
                if (!ret3) return ret3;
                try {
                  const freshShelf = activeFirstShelf();
                  if (!freshShelf) return ret3;
                  if (!cachedAppIds?.length) { scheduleResolve(freshShelf); return ret3; }
                  const ok = mutateRecentsElement(ret3, freshShelf, cachedAppIds);
                  if (!ok) {
                    silentPatchFailures++;
                    if (silentPatchFailures >= 10) markReplaceFailed("mutate: holder not found");
                    return ret3;
                  }
                  silentPatchFailures = 0;
                } catch (e) {
                  logInfo("RUNTIME", "ret3 patch failed", String(e));
                  markReplaceFailed("ret3: " + String(e));
                }
                return ret3;
              });
            } catch (e) {
              logInfo("RUNTIME", "ret2 findInReactTree failed", String(e));
              markReplaceFailed("ret2: " + String(e));
            }
            return ret2;
          });
        } catch (e) {
          logInfo("RUNTIME", "ret patch failed", String(e));
          markReplaceFailed("ret: " + String(e));
        }
        return ret;
      });
    } catch (e) {
      logInfo("RUNTIME", "outer patch failed", String(e));
      markReplaceFailed("outer: " + String(e));
    }
    return props;
  };

  try {
    patch = routerHook.addPatch("/library/home", patchFn);
  } catch (e) {
    logWarn("RUNTIME", "addPatch failed", String(e));
    markReplaceFailed("addPatch: " + String(e));
    return null;
  }

  unsubSettings = subscribeSettings(() => {
    const shelf = activeFirstShelf();
    if (!shelf) {
      const hadData = !!cachedAppIds?.length;
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null; lastResolveKey = "";
      if (hadData) notifyInjectingChange();
      return;
    }
    if (shelfKey(shelf) !== lastResolveKey) {
      cachedAppIds = null; cachedShelfId = null; lastResolveKey = "";
      notifyInjectingChange();
      scheduleResolve(shelf);
    }
  });

  let unsubApp: (() => void) | null = null;
  try {
    const client: any = (globalThis as any).SteamClient;
    // Debounced: an app running/updating fires overview changes continuously;
    // coalesce them into one re-resolve so we don't churn the shelf mid-use.
    const reg = client?.Apps?.RegisterForAppOverviewChanges?.(() => {
      if (overviewDebounce) clearTimeout(overviewDebounce);
      overviewDebounce = setTimeout(() => {
        overviewDebounce = null;
        const shelf = activeFirstShelf();
        if (shelf) { lastResolveKey = ""; scheduleResolve(shelf); }
      }, OVERVIEW_DEBOUNCE_MS);
    });
    unsubApp = reg?.unregister ? () => reg.unregister() : null;
  } catch {}

  /* The promoted shelf is "the first visible regular shelf" drawn a second
     time, so it needs the same central shelfRefresh signal the regular
     shelves already react to — without it, a change only shelfRefresh
     catches (e.g. a visibility-rule flip) left the replaced row stale until
     the next 90s tick or an unrelated settings edit re-primed the cache. */
  const unsubShelfRefresh = subscribeShelfRefresh(() => {
    const shelf = activeFirstShelf();
    if (shelf) { lastResolveKey = ""; scheduleResolve(shelf); }
  });

  // Bootstrap: patchFn only fires when Steam renders /library/home.
  // If already on home at install time, we trigger resolve ourselves.
  /* Timers only call scheduleResolve — forceRemountRecents is called by
     scheduleResolve internally when data changes, so we never disturb
     the native tree unnecessarily. Range covers the first ~80s because
     collectionStore.allAppsCollection can take that long to populate on
     a cold boot (issue #60); after that the 90s periodic tick takes over. */
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

  // collectionStore.on('change') fires when the user's collections (and
  /* the underlying allAppsCollection.apps set) finish populating on cold
     boot, or when the user installs/removes an app. Either trigger is a
     good moment to re-resolve: the boot case unblocks the filter that
     requires owned-set membership, and the install/uninstall case keeps
     the recents list aligned with the user's library state. */
  let unsubColl: (() => void) | null = null;
  try {
    const cs: any = (globalThis as any).collectionStore;
    if (cs && typeof cs.on === "function") {
      const handler = () => {
        const shelf = activeFirstShelf();
        if (shelf) { lastResolveKey = ""; scheduleResolve(shelf); }
      };
      cs.on("change", handler);
      unsubColl = () => { try { cs.off?.("change", handler); } catch {} };
    }
  } catch {}

  let resumeUnsub: (() => void) | null = null;
  try {
    const client: any = (globalThis as any).SteamClient;
    const reg = client?.System?.RegisterForOnResumeFromSuspend?.(() => {
      if (replaceFailed) return;
      cachedAppIds = null; lastResolveKey = "";
      setTimeout(tryResolve, 2000);
    });
    resumeUnsub = reg?.unregister ? () => reg.unregister() : null;
  } catch {}

  const periodicTimer = setInterval(tryResolve, 90 * 1000);

  logInfo("RUNTIME", "installed");

  return {
    uninstall() {
      safeCall(() => routerHook.removePatch?.("/library/home", patch));
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
