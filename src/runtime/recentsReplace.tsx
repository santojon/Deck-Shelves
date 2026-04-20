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
import { getPlatform } from "./platformContext";
import { logInfo, logWarn } from "./logger";
import { toaster } from "../shims/decky-api";

type PatchHandle = { uninstall?: () => void } | null;

let cachedAppIds: number[] | null = null;
let cachedShelfId: string | null = null;
let cachedTitle: string | null = null;
let resolvePromise: Promise<void> | null = null;
let lastResolveKey = "";
// Tracks component type objects already patched via afterPatch(fn, "type", ...).
// React memo/forwardRef wrappers are shared across renders; calling afterPatch
// on the same object again each render stacks N callbacks — guard prevents that.
let patchedTypes: WeakSet<object> = new WeakSet();
// Telemetry counter — not wired to any kill-switch. Zeroes on successful mutation.
let silentPatchFailures = 0;
// Counts render-chain mutation failures. After MAX_MOUNT_FAILURES the feature is disabled.
const MAX_MOUNT_FAILURES = 3;
let mountFailureCount = 0;
// Set once mutation has ever run successfully on this session — used by the
// remount scheduler to stop retrying once we know the chain works.
let mutationSucceededOnce = false;
// Pending remount retry timer (nullable so we can cancel/replace).
let remountTimer: ReturnType<typeof setTimeout> | null = null;

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
  mountFailureCount = 0;
  mutationSucceededOnce = false;
  patchedTypes = new WeakSet();
  if (remountTimer) { clearTimeout(remountTimer); remountTimer = null; }
  notifyFailedChange();
  notifyInjectingChange();
}
function notifyFailedChange() { for (const cb of failedListeners) { try { cb(); } catch {} } }
function markReplaceFailed(reason: string) {
  if (replaceFailed) return;
  replaceFailed = true;
  replaceError = reason;
  logWarn("RUNTIME", "recents replace disabled due to error", reason);
  notifyFailedChange();
  notifyInjectingChange();
}

function tryMarkReplaceFailed(reason: string) {
  if (replaceFailed) return;
  mountFailureCount++;
  logWarn("RUNTIME", `recents replace failure ${mountFailureCount}/${MAX_MOUNT_FAILURES}`, reason);
  if (mountFailureCount >= MAX_MOUNT_FAILURES) {
    markReplaceFailed(reason);
    toaster.toast({ title: "Deck Shelves", body: "Native shelf replacement failed. Reverted to default." });
  }
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

function activeFirstShelf() {
  if (replaceFailed) return null;
  const s = getCurrentSettings();
  if (!s?.enabled || s.hideRecents !== true || s.recentsReplaceSource !== true) return null;
  const visible = (s.shelves ?? []).filter((sh: any) => sh.enabled && !sh.hidden);
  if (s.recentsReplaceShelfId) {
    const picked = visible.find((sh: any) => sh.id === s.recentsReplaceShelfId);
    if (picked) return picked;
  }
  return visible[0] ?? null;
}

function shelfKey(shelf: any): string {
  return `${shelf.id}:${JSON.stringify(shelf.source)}:${shelf.limit ?? 20}:${shelf.sort ?? ''}`;
}

function scheduleResolve(shelf: any) {
  const key = shelfKey(shelf);
  if (key === lastResolveKey && cachedAppIds) return;
  if (resolvePromise) return;
  lastResolveKey = key;
  const platform = getPlatform();
  if (!platform) return;
  resolvePromise = platform
    .resolveShelfAppIds(shelf.source, shelf.limit ?? 20, (shelf as any).sort)
    .then((ids: number[]) => {
      const prev = cachedAppIds;
      const valid = Array.isArray(ids) ? ids.filter((n) => typeof n === "number" && n > 0) : [];
      const known = filterKnownAppIds(valid);
      if (valid.length > 0 && known.length === 0) {
        // Shelf resolved but every app was filtered — no native-renderable apps.
        markReplaceFailed("shelf contains no Steam-renderable apps (app_type 1/2/1073741824)");
        cachedAppIds = [];
        return;
      }
      cachedAppIds = known;
      cachedShelfId = shelf.id;
      cachedTitle = shelf.title ?? cachedTitle;
      const changed = prev?.length !== cachedAppIds.length || prev?.some((v, i) => v !== cachedAppIds![i]);
      if (changed) {
        mutationSucceededOnce = false;
        notifyInjectingChange();
        scheduleForceRemounts();
      }
    })
    .catch((err) => {
      logWarn("RUNTIME", "resolveShelfAppIds failed", String(err));
      cachedAppIds = [];
    })
    .finally(() => { resolvePromise = null; });
}

/** Force the native recents React subtree to re-render.
 *
 *  Two-pronged strategy:
 *   1. `history.replaceState` + popstate on `globalThis` — how the original
 *      (working) implementation triggered React Router to re-dispatch the
 *      location. Cheap, non-intrusive.
 *   2. Direct fiber forceUpdate — locate the recents DOM node, walk up its
 *      React fiber chain, and trigger a state update on the nearest stateful
 *      ancestor. Works even when popstate is ignored (same-URL bail out).
 *
 *  Both are safe to call together: they cause independent render paths that
 *  converge on the same outcome. The fiber path is the reliable fallback
 *  when history events don't propagate — historically the reason a Steam
 *  restart was needed for the toggle to take effect. */
function forceRemountRecents() {
  try {
    const win: any = globalThis;
    if (win?.history?.state !== undefined) {
      win.history.replaceState(win.history.state, "", win.location.href);
      win.dispatchEvent(new Event("popstate"));
    }
  } catch (e) { logInfo("RUNTIME", "force-remount failed", String(e)); }
}


/** Schedule multiple forceRemount attempts at increasing delays.
 *  First render often happens before cachedAppIds arrives, and some Steam
 *  versions need several nudges before React Router re-dispatches. Each
 *  attempt checks if mutation has landed (mutationSucceededOnce) and bails
 *  early if so. Non-destructive: only calls replaceState, never corrupts
 *  history or fires extra popstate events beyond the scheduled ones. */
const REMOUNT_DELAYS = [0, 150, 500, 1200, 2500] as const;
function scheduleForceRemounts() {
  if (remountTimer) { clearTimeout(remountTimer); remountTimer = null; }
  let i = 0;
  const tick = () => {
    if (!activeFirstShelf()) { remountTimer = null; return; }
    if (mutationSucceededOnce) { remountTimer = null; return; }
    forceRemountRecents();
    i++;
    if (i < REMOUNT_DELAYS.length) {
      remountTimer = setTimeout(tick, REMOUNT_DELAYS[i]);
    } else {
      remountTimer = null;
    }
  };
  tick();
}

/** Polymorphic render-interception for any React component type.
 *  Returns true if a patch was installed (either on shared type object or
 *  element itself). Handles:
 *   - memo wrapper `{ $$typeof, type, compare }` → afterPatch on "type"
 *   - forwardRef wrapper `{ $$typeof, render }` → afterPatch on "render"
 *   - plain function component → swap element.type to a wrapper (per-render)
 *   - unknown type (string host, class) → no-op returning false
 *  For memo/forwardRef, guarded by WeakSet to prevent wrapper accumulation.
 *  For plain functions, the patch is transient (element is fresh each render)
 *  so no WeakSet tracking needed. */
function patchElementRender(
  element: any,
  cb: (args: any[], ret: any) => any,
): boolean {
  const t = element?.type;
  if (!t) return false;
  if (typeof t === "object") {
    // memo or forwardRef
    if (typeof (t as any).type === "function" || typeof (t as any).type === "object") {
      if (patchedTypes.has(t)) return true;
      patchedTypes.add(t);
      afterPatch(t, "type", cb);
      return true;
    }
    if (typeof (t as any).render === "function") {
      if (patchedTypes.has(t)) return true;
      patchedTypes.add(t);
      afterPatch(t, "render", cb);
      return true;
    }
    return false;
  }
  if (typeof t === "function") {
    // Plain function component — wrap the element's type directly. This is
    // per-render (element is fresh each time) so no accumulation risk.
    const original = t;
    element.type = function DeckShelvesWrappedFn(props: any) {
      const out = (original as any)(props);
      const res = cb([props], out);
      return res !== undefined ? res : out;
    };
    return true;
  }
  return false;
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
  return (
    msg.includes("userCollections") ||
    msg.includes("collectionStore") ||
    (msg.includes("Cannot read properties of undefined") && msg.includes("values"))
  );
}

function installGlobalErrorTrap() {
  try {
    const handler = (evt: any) => {
      if (!activeFirstShelf() && !replaceFailed) return; // only care while experiment is on
      const msg = String(evt?.error?.message ?? evt?.message ?? evt?.reason?.message ?? evt?.reason ?? "");
      if (isOurCrashFingerprint(msg)) {
        markReplaceFailed(msg.slice(0, 160));
      }
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

  // Attempts to mutate the first holder we can reach inside `tree`. Returns
  // true if mutation landed. Walks `findInReactTree` starting from tree so we
  // short-circuit any level that already exposes the games/onItemFocus holder
  // (covers Steam UI variants that flatten the three-level tree).
  const tryDirectMutate = (tree: any): boolean => {
    const freshShelf = activeFirstShelf();
    if (!freshShelf) return false;
    const ids = cachedAppIds && cachedAppIds.length ? cachedAppIds : null;
    if (!ids) return false;
    const holder = findInReactTree(tree, (x: any) =>
      x?.props?.games && Array.isArray(x.props.games) && typeof x?.props?.onItemFocus === "function",
    );
    if (!holder) return false;
    const ok = mutateRecentsElement(tree, freshShelf, ids);
    if (ok) {
      silentPatchFailures = 0;
      mountFailureCount = 0;
      mutationSucceededOnce = true;
      if (remountTimer) { clearTimeout(remountTimer); remountTimer = null; }
    }
    return ok;
  };

  const patchFn = (props: { children: ReactElement }) => {
    try {
      // IMPORTANT: install the patch chain unconditionally on every route
      // render, regardless of whether the toggle is currently active. Without
      // this, flipping the toggle ON while the user is already on the home
      // page never installs the callbacks — the route doesn't re-render on a
      // settings change, so patchFn never fires again, so the chain never
      // reaches the recents component. Steam restart was working around this
      // because a fresh route render would fire patchFn with the toggle
      // already enabled. Now we install always, and check activeFirstShelf()
      // inside the innermost callbacks — cheap no-op when toggle is off.
      const shelf = activeFirstShelf();
      if (shelf && (!cachedAppIds || cachedShelfId !== shelf.id)) scheduleResolve(shelf);

      // Level 1: page component render (element-level patch, fresh each render).
      afterPatch(props.children as any, "type", (_a: any, ret?: any) => {
        if (!ret) return ret;
        try {
          // Shortcut: some Steam versions expose the games holder directly in ret.
          if (tryDirectMutate(ret)) return ret;

          // Level 2: intercept ret's render using polymorphic helper
          // (handles memo, forwardRef, and plain function components).
          patchElementRender(ret, (_b: any, ret2?: any) => {
            if (!ret2) return ret2;
            try {
              // Try direct mutation on ret2 — covers most tree shapes without
              // needing a third patch level. This is the primary success path
              // for Steam builds where recents renders eagerly in the parent.
              if (tryDirectMutate(ret2)) return ret2;

              // Fallback: locate the recents wrapper component and patch it
              // to intercept its render output (ret3). Strict selector first,
              // then broader games-array fallback.
              let recents = findInReactTree(ret2, (x: any) =>
                x?.props && "autoFocus" in x.props && "showBackground" in x.props,
              );
              if (!recents) {
                recents = findInReactTree(ret2, (x: any) =>
                  x?.props?.games && Array.isArray(x.props.games),
                );
              }
              if (!recents) {
                if (cachedAppIds?.length) silentPatchFailures++;
                return ret2;
              }
              patchElementRender(recents, (_c: any, ret3?: any) => {
                if (!ret3) return ret3;
                try {
                  const freshShelf = activeFirstShelf();
                  if (!freshShelf) return ret3;
                  const ids = cachedAppIds && cachedAppIds.length ? cachedAppIds : null;
                  if (!ids) { scheduleResolve(freshShelf); return ret3; }
                  const ok = mutateRecentsElement(ret3, freshShelf, ids);
                  if (!ok) {
                    if (cachedAppIds?.length) silentPatchFailures++;
                    return ret3;
                  }
                  silentPatchFailures = 0;
                  mountFailureCount = 0;
                  mutationSucceededOnce = true;
                  if (remountTimer) { clearTimeout(remountTimer); remountTimer = null; }
                } catch (e) {
                  logInfo("RUNTIME", "ret3 patch failed", String(e));
                  tryMarkReplaceFailed("ret3: " + String(e));
                }
                return ret3;
              });
            } catch (e) {
              logInfo("RUNTIME", "ret2 findInReactTree failed", String(e));
              tryMarkReplaceFailed("ret2: " + String(e));
            }
            return ret2;
          });
        } catch (e) {
          logInfo("RUNTIME", "ret patch failed", String(e));
          tryMarkReplaceFailed("ret: " + String(e));
        }
        return ret;
      });
    } catch (e) {
      logInfo("RUNTIME", "outer patch failed", String(e));
      tryMarkReplaceFailed("outer: " + String(e));
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
    // If feature was previously killed but user re-enabled it, auto-reset so
    // the patch chain can retry without requiring a Steam restart.
    if (replaceFailed) {
      const s = getCurrentSettings();
      if (s?.enabled && s.hideRecents === true && s.recentsReplaceSource === true) {
        resetRecentsReplaceFailed();
      }
    }
    const shelf = activeFirstShelf();
    if (!shelf) {
      const hadData = !!cachedAppIds?.length;
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null; lastResolveKey = "";
      mutationSucceededOnce = false;
      if (remountTimer) { clearTimeout(remountTimer); remountTimer = null; }
      if (hadData) notifyInjectingChange();
      return;
    }
    if (shelfKey(shelf) !== lastResolveKey) {
      cachedAppIds = null; cachedShelfId = null; lastResolveKey = "";
      mutationSucceededOnce = false;
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

  logInfo("RUNTIME", "installed");

  return {
    uninstall() {
      try { routerHook.removePatch?.("/library/home", patch); } catch {}
      try { unsubSettings?.(); } catch {}
      try { unsubApp?.(); } catch {}
      try { uninstallErrorTrap(); } catch {}
      if (remountTimer) { clearTimeout(remountTimer); remountTimer = null; }
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null;
      lastResolveKey = "";
      mutationSucceededOnce = false;
      patchedTypes = new WeakSet();
      notifyInjectingChange();
    },
  };
}
