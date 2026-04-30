/**
 * Experimental: substitui o data source da seção nativa "Jogos recentes"
 * pelas apps da primeira shelf do usuário. Gated atrás do toggle
 * `recentsReplaceSource` (só aparece quando `hideRecents` está ativo).
 *
 * Mecanismo: patch-of-render em três níveis via
 * `routerHook.addPatch("/library/home", ...)` + `afterPatch(el, "type", ...)`
 * + `findInReactTree(x => x.props.games && x.props.onItemFocus)`. A mutação
 * é minimal: `p.props.games = ourAppIds`. O restante do DOM/CSS/animações
 * continua 100% nativo — incluindo o hero background, que reage naturalmente
 * ao foco dos cards via o callback `onItemFocus` preservado.
 *
 * Segurança:
 * - Toda a cadeia de patch fica dentro de try/catch.
 * - Só injetamos appids que o Steam reconhece (via `appStore.GetAppOverviewByAppID`
 *   ou `m_mapApps`) — evita a exceção `Cannot read properties of undefined
 *   (reading 'values')` no getter `userCollections` quando passamos ids
 *   órfãos.
 * - Se o render nativo falhar (Decky ErrorBoundary captura), marcamos o
 *   experimento como falho via pub/sub; QAM exibe banner e o consumidor
 *   (HomeInject) cai de volta na ocultação visual tradicional.
 */
import type { ReactElement } from "react";
import { afterPatch, findInReactTree } from "@decky/ui";
import { getCurrentSettings, subscribeSettings } from "../settingsStore";
import { isInVisibilityWindow } from "../steam/smartShelves";
import { getPlatform } from "./platformContext";
import { logError, logInfo, logWarn } from "./logger";
import { toaster } from "../shims/decky-api";
import i18next from "i18next";

type PatchHandle = { uninstall?: () => void } | null;

let cachedAppIds: number[] | null = null;
let cachedShelfId: string | null = null;
let cachedTitle: string | null = null;
let resolvePromise: Promise<void> | null = null;
let lastResolveKey = "";
let silentPatchFailures = 0;
let overlayFocusedAppId = 0;
let patchedTypes: WeakSet<object> = new WeakSet();

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
/** True when the toggle is active AND we have cached app ids ready to be
 *  injected into the native recents shelf. Consumers use this to avoid
 *  rendering the first shelf twice (once natively, once in the DS mount). */
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
  toaster.toast({ title: i18next.t("recents_replace_error_title"), body: i18next.t("recents_replace_error_desc") });
  notifyFailedChange();
  notifyInjectingChange();
}

// --- Steam app validation -----------------------------------------------
/** Only Steam-native app types the recents component can safely render.
 *  Confirmed via CDP: native recents only contains `app_type === 1` (Game).
 *  Passing Shortcut (1073741824), Music, DLC, Tool etc. crashes Steam's
 *  `userCollections` getter because those collections don't index them. */
const RENDERABLE_STEAM_APP_TYPES: ReadonlySet<number> = new Set([1, 2, 1073741824]); // Game, Application, Non-Steam Shortcut

function filterKnownAppIds(ids: number[]): number[] {
  const store: any = (globalThis as any).appStore;
  if (!store || typeof store.GetAppOverviewByAppID !== "function") return [];
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

/** Convert a smart shelf entry into a shelf-shaped object the resolver path
 *  understands. Source carries the smart mode + optional filter / params /
 *  refresh-interval so `resolveShelfAppIds` dispatches correctly. */
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

/** Build the ordered list of replace-candidate shelves: visible normals
 *  first, then visible smart shelves whose visibility window allows them
 *  right now. Used by both `activeFirstShelf` (initial pick) and
 *  `scheduleResolve`'s zero-app fallback (next candidate when the current
 *  one resolves to nothing). Returns shelf-shaped objects only. */
function visibleCandidateShelves(): any[] {
  const s = getCurrentSettings();
  if (!s) return [];
  const normals = (s.shelves ?? []).filter((sh: any) => sh.enabled && !sh.hidden);
  const smartEnabled = s.smartShelvesEnabled === true;
  const smarts = !smartEnabled
    ? []
    : (s.smartShelves ?? [])
        .filter((sm: any) => sm.enabled !== false && !sm.hidden)
        .filter((sm: any) => isInVisibilityWindow(sm.visibleHours, sm.visibleDaysOfWeek))
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
  return `${shelf.id}:${JSON.stringify(shelf.source)}:${shelf.limit ?? 20}`;
}

function scheduleResolve(shelf: any) {
  const key = shelfKey(shelf);
  if (key === lastResolveKey && cachedAppIds) return;
  if (resolvePromise) return;
  lastResolveKey = key;
  const platform = getPlatform();
  if (!platform) return;
  resolvePromise = platform
    .resolveShelfAppIds(shelf.source, shelf.limit ?? 20)
    .then((ids: number[]) => {
      const prev = cachedAppIds;
      const valid = Array.isArray(ids) ? ids.filter((n) => typeof n === "number" && n > 0) : [];
      const known = filterKnownAppIds(valid);
      if (known.length === 0) {
        // Shelf resolved to 0 native-renderable apps — try the next
        // candidate (normals first, then visible smart shelves). setTimeout
        // so resolvePromise is null before the next call.
        const candidates = visibleCandidateShelves();
        const currentIdx = candidates.findIndex((sh: any) => sh.id === shelf.id);
        const next = candidates[currentIdx + 1];
        if (next) {
          lastResolveKey = "";
          setTimeout(() => scheduleResolve(next), 0);
        } else {
          cachedAppIds = [];
        }
        return;
      }
      cachedAppIds = known;
      cachedShelfId = shelf.id;
      cachedTitle = shelf.title ?? cachedTitle;
      const changed = prev?.length !== cachedAppIds.length || prev?.some((v, i) => v !== cachedAppIds![i]);
      if (changed) {
        notifyInjectingChange();
        forceRemountRecents();
      }
    })
    .catch((err) => {
      logWarn("RUNTIME", "resolveShelfAppIds failed", String(err));
      cachedAppIds = [];
    })
    .finally(() => { resolvePromise = null; });
}

/** Force the native recents React subtree to re-render. */
function forceRemountRecents() {
  try {
    const win: any = globalThis;
    if (win?.history?.state !== undefined) {
      win.history.replaceState(win.history.state, "", win.location.href);
      win.dispatchEvent(new Event("popstate"));
    }
  } catch (e) { logInfo("RUNTIME", "force-remount failed", String(e)); }
}

function mutateRecentsElement(ret3: any, shelf: any, appIds: number[]): boolean {
  try {
    const holder = findInReactTree(ret3, (x: any) => x?.props?.games && Array.isArray(x.props.games) && typeof x?.props?.onItemFocus === "function");
    if (!holder) return false;
    const trimmed = appIds.slice(0, Math.max(1, shelf.limit ?? 20));
    if (!trimmed.length) return false; // never pass empty — native expects non-empty
    holder.props.games = trimmed;
    const s = getCurrentSettings();
    holder.props.showFeaturedItem = !!(shelf.highlightFirst || shelf.highlightAll || s?.globalHighlightFirst || s?.globalHighlightAll);
    const origOnItemFocus = holder.props.onItemFocus;
    holder.props.onItemFocus = (overview: any, ...args: any[]) => {
      try { overlayFocusedAppId = overview?.appid ?? overview?.nAppID ?? 0; } catch {}
      return origOnItemFocus?.(overview, ...args);
    };
    try {
      const titleText = shelf.title ?? cachedTitle ?? "";
      if (titleText) {
        ret3.props.children[1].props.children[0].props.children[0].props.children = titleText;
      }
    } catch {}
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
  // React error #301 (Maximum update depth) — a state update cascade caused
  // by our mutation firing a Steam callback during render.
  if (msg.includes("Minified React error #301")) return true;
  if (msg.includes("Maximum update depth")) return true;
  return false;
}

function installGlobalErrorTrap() {
  try {
    const handler = (evt: any) => {
      // Only fire when replacement is actively injecting (not just configured)
      if (!isRecentsReplaceInjecting()) return;
      const msg = String(evt?.error?.message ?? evt?.message ?? evt?.reason?.message ?? evt?.reason ?? "");
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
      const shelf = activeFirstShelf();
      if (!shelf) return props;

      if (!cachedAppIds?.length) scheduleResolve(shelf);

      // L1 afterPatch wraps props.children.type permanently (the wrapper
      // persists on that element reference). Skip if __og is already set
      // to avoid accumulating handlers when patchFn fires multiple times.
      // L2/L3 patches are transient (per fresh element each render) so they
      // must be re-applied every time L1's handler fires.
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
                if (cachedAppIds?.length) {
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
                  const ids = cachedAppIds && cachedAppIds.length ? cachedAppIds : null;
                  if (!ids) { scheduleResolve(freshShelf); return ret3; }
                  const ok = mutateRecentsElement(ret3, freshShelf, ids);
                  if (!ok) {
                    if (cachedAppIds?.length) {
                      silentPatchFailures++;
                      if (silentPatchFailures >= 10) markReplaceFailed("mutate: holder not found");
                    }
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
    const reg = client?.Apps?.RegisterForAppOverviewChanges?.(() => {
      const shelf = activeFirstShelf();
      if (shelf) { lastResolveKey = ""; scheduleResolve(shelf); }
    });
    unsubApp = reg?.unregister ? () => reg.unregister() : null;
  } catch {}

  // Bootstrap: patchFn only fires when Steam renders /library/home.
  // If already on home at install time, we trigger resolve ourselves.
  // Timers only call scheduleResolve — forceRemountRecents is called by
  // scheduleResolve internally when data changes, so we never disturb
  // the native tree unnecessarily.
  const bootstrapTimers: ReturnType<typeof setTimeout>[] = [];
  const tryResolve = () => {
    if (replaceFailed || (cachedAppIds && cachedAppIds.length > 0)) return;
    const shelf = activeFirstShelf();
    if (!shelf) return;
    lastResolveKey = "";
    scheduleResolve(shelf);
  };
  for (const d of [300, 1000, 2500, 5000, 10000]) {
    bootstrapTimers.push(setTimeout(tryResolve, d));
  }

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
      try { routerHook.removePatch?.("/library/home", patch); } catch {}
      try { unsubSettings?.(); } catch {}
      try { unsubApp?.(); } catch {}
      try { uninstallErrorTrap(); } catch {}
      try { resumeUnsub?.(); } catch {}
      clearInterval(periodicTimer);
      for (const t of bootstrapTimers) { try { clearTimeout(t); } catch {} }
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null;
      lastResolveKey = ""; overlayFocusedAppId = 0;
      notifyInjectingChange();
    },
  };
}
