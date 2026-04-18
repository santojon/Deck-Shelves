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

type PatchHandle = { uninstall?: () => void } | null;

let cachedAppIds: number[] | null = null;
let cachedShelfId: string | null = null;
let cachedTitle: string | null = null;
let resolvePromise: Promise<void> | null = null;
let lastResolveKey = "";
let silentPatchFailures = 0;
let lastMutationTime = 0;

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
  lastMutationTime = 0;
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

// --- Steam app validation -----------------------------------------------
/** Only Steam-native app types the recents component can safely render.
 *  Confirmed via CDP: native recents only contains `app_type === 1` (Game).
 *  Passing Shortcut (1073741824), Music, DLC, Tool etc. crashes Steam's
 *  `userCollections` getter because those collections don't index them. */
const RENDERABLE_STEAM_APP_TYPES: ReadonlySet<number> = new Set([1, 2]); // Game, Application

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
  return visible[0] ?? null;
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
      if (valid.length > 0 && known.length === 0) {
        // The shelf resolved but every app was filtered out (shortcuts, DLC,
        // music, etc.) — the native recents component can only render Steam
        // games (app_type 1/2). Signal failure so UI shows banner + falls
        // back to visual hide instead of silently leaving native recents.
        markReplaceFailed("first shelf contains no Steam-playable apps (app_type 1/2)");
        cachedAppIds = [];
        return;
      }
      cachedAppIds = known;
      cachedShelfId = shelf.id;
      cachedTitle = shelf.title ?? cachedTitle;
      const changed = prev?.length !== cachedAppIds.length || prev?.some((v, i) => v !== cachedAppIds![i]);
      if (changed) {
        lastMutationTime = 0;
        notifyInjectingChange();
        scheduleForceRemount(5);
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
 * React-Router's history library (v4) uses per-entry keys in window.history.state
 * to detect navigation. Firing popstate with the SAME key yields delta=0 → no
 * re-render. To force a real re-render we:
 *   1. pushState a dummy entry (new unique key) → histLen becomes 2
 *   2. dispatch popstate with that state → React-Router sees unknown key, treats as
 *      PUSH navigation to same pathname → route component re-renders → patch fires
 *   3. history.go(-1) → async popstate back to original entry → second re-render
 */
function forceRemountRecents() {
  try {
    const win: any = globalThis;
    const tmpKey = "ds_" + Math.random().toString(36).slice(2);
    win.history.pushState({ key: tmpKey, state: {} }, "", win.location.href);
    win.dispatchEvent(new PopStateEvent("popstate", { state: win.history.state }));
    win.history.go(-1);
  } catch (e) { logInfo("RUNTIME", "force-remount failed", String(e)); }
}

/** Retry forceRemountRecents up to `attemptsLeft` times (1.2s apart).
 *  Stops early if a mutation was confirmed (lastMutationTime updated).
 *  On exhaustion, marks the feature as failed so the banner shows. */
function scheduleForceRemount(attemptsLeft: number) {
  if (attemptsLeft <= 0) {
    markReplaceFailed("force remount: no mutation confirmed after max retries");
    return;
  }
  const before = lastMutationTime;
  forceRemountRecents();
  setTimeout(() => {
    if (!activeFirstShelf()) return;
    if (lastMutationTime > before) return;
    scheduleForceRemount(attemptsLeft - 1);
  }, 1200);
}

function mutateRecentsElement(ret3: any, shelf: any, appIds: number[]): boolean {
  try {
    const holder = findInReactTree(ret3, (x: any) => x?.props?.games && Array.isArray(x.props.games) && typeof x?.props?.onItemFocus === "function");
    if (!holder) return false;
    const trimmed = appIds.slice(0, Math.max(1, shelf.limit ?? 20));
    if (!trimmed.length) return false; // never pass empty — native expects non-empty
    holder.props.games = trimmed;
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

  const patchFn = (props: { children: ReactElement }) => {
    try {
      const shelf = activeFirstShelf();
      if (!shelf) return props;

      if (!cachedAppIds || cachedShelfId !== shelf.id) scheduleResolve(shelf);

      afterPatch(props.children as any, "type", (_a: any, ret?: any) => {
        if (!ret) return ret;
        try {
          afterPatch(ret.type, "type", (_b: any, ret2?: any) => {
            if (!ret2) return ret2;
            try {
              // Try direct approach first: if the games+onItemFocus holder is
              // already accessible in ret2 (some Steam versions flatten the tree),
              // mutate it without a third afterPatch level.
              const directHolder = findInReactTree(ret2, (x: any) =>
                x?.props?.games && Array.isArray(x.props.games) && typeof x?.props?.onItemFocus === "function",
              );
              if (directHolder) {
                const freshShelf = activeFirstShelf();
                if (freshShelf) {
                  const ids = cachedAppIds && cachedAppIds.length ? cachedAppIds : null;
                  if (ids) {
                    const ok = mutateRecentsElement(ret2, freshShelf, ids);
                    if (ok) { silentPatchFailures = 0; lastMutationTime = Date.now(); return ret2; }
                  }
                }
              }

              // Standard approach: find the recents wrapper component and
              // afterPatch its render to get ret3 where the holder lives.
              // Broadened selector: original autoFocus+showBackground, plus
              // fallback for structural variants (e.g. games in props at this level).
              const recents = findInReactTree(ret2, (x: any) => {
                if (!x?.props) return false;
                if ("autoFocus" in x.props && "showBackground" in x.props) return true;
                if (x.props.games && Array.isArray(x.props.games)) return true;
                return false;
              });
              if (!recents) {
                if (cachedAppIds?.length) {
                  silentPatchFailures++;
                  if (silentPatchFailures >= 10) markReplaceFailed("tree walk: recents node not found");
                }
                return ret2;
              }
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
                  lastMutationTime = Date.now();
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
    // If the feature is re-enabled after a failure, auto-reset so the patch
    // can retry without requiring a Steam restart.
    if (replaceFailed) {
      const s = getCurrentSettings();
      if (s?.enabled && s.hideRecents === true && s.recentsReplaceSource === true) {
        resetRecentsReplaceFailed();
        cachedAppIds = null; cachedShelfId = null; lastResolveKey = "";
      }
    }
    const shelf = activeFirstShelf();
    if (!shelf) {
      const hadData = !!cachedAppIds?.length;
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null; lastResolveKey = "";
      if (hadData) notifyInjectingChange();
      return;
    }
    if (shelfKey(shelf) !== lastResolveKey) {
      cachedAppIds = null; cachedShelfId = null; lastResolveKey = "";
      lastMutationTime = 0;
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
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null;
      lastResolveKey = "";
      notifyInjectingChange();
    },
  };
}
