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
      if (known.length === 0) {
        // Shelf resolved to 0 native-renderable apps — try next visible shelf.
        // setTimeout so resolvePromise is null before the next call.
        const s = getCurrentSettings();
        const visible = (s?.shelves ?? []).filter((sh: any) => sh.enabled && !sh.hidden);
        const currentIdx = visible.findIndex((sh: any) => sh.id === shelf.id);
        const next = visible[currentIdx + 1];
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

      if (!cachedAppIds?.length) scheduleResolve(shelf);

      afterPatch(props.children as any, "type", (_a: any, ret?: any) => {
        if (!ret) return ret;
        try {
          afterPatch(ret.type, "type", (_b: any, ret2?: any) => {
            if (!ret2) return ret2;
            try {
              const recents = findInReactTree(ret2, (x: any) =>
                x?.props && "autoFocus" in x.props && "showBackground" in x.props,
              );
              if (!recents) {
                // Tree walk failed to find the recents component (tree shape
                // mismatch). Increment counter — after 5 consecutive silent
                // failures, activate the killswitch so HomeInject falls back
                // to visual hide instead of leaving the state permanently broken.
                if (cachedAppIds?.length) {
                  silentPatchFailures++;
                  if (silentPatchFailures >= 5) markReplaceFailed("tree walk: recents node not found");
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
                      if (silentPatchFailures >= 5) markReplaceFailed("mutate: holder not found");
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

  const bootstrapTimers: ReturnType<typeof setTimeout>[] = [];
  const kickstart = () => {
    const shelf = activeFirstShelf();
    if (!shelf) return;
    if (!cachedAppIds?.length) {
      lastResolveKey = "";
      scheduleResolve(shelf);
    }
    forceRemountRecents();
  };
  for (const d of [80, 300, 800, 1800, 3500, 6000]) {
    bootstrapTimers.push(setTimeout(() => {
      if (replaceFailed) return;
      kickstart();
    }, d));
  }

  logInfo("RUNTIME", "installed");

  return {
    uninstall() {
      try { routerHook.removePatch?.("/library/home", patch); } catch {}
      try { unsubSettings?.(); } catch {}
      try { unsubApp?.(); } catch {}
      try { uninstallErrorTrap(); } catch {}
      for (const t of bootstrapTimers) { try { clearTimeout(t); } catch {} }
      cachedAppIds = null; cachedShelfId = null; cachedTitle = null;
      lastResolveKey = "";
      notifyInjectingChange();
    },
  };
}
