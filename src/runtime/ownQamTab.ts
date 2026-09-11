/* Own native Quick Access tab under Decky alone (opt-in, off by default).
   Registers a `QuickAccessTab` enum key, `afterPatch`es the consumer, then
   re-points an already-mounted consumer's live fiber (ports a fix already
   validated in a neutral host's own runtime) and finds the real tab-list
   owner by prop shape, not a name match. Confirmed live via CDP (2026-09-09). */

import type { ReactNode } from "react";
import { afterPatch, findInReactTree, findModuleByExport } from "./host/decky";
import { logError, logInfo, logWarn } from "./logger";

// The consumer is only ever patched once, at boot — turning this setting
// back ON needs a Steam restart to re-run that patch. `false` = restart the
// Steam client only, not a full OS power cycle.
export function restartSteam(): void {
  try { ((globalThis as any).SteamClient ?? (window as any).SteamClient)?.User?.StartRestart?.(false); } catch {}
}

const TRIP_KEY = "ds-own-qam-tab-trip";
const STALE_ARM_MS = 15_000;
// A stale arm may be a real crash OR just a reload before the first healthy
// render (Steam restart / host switch). One stale arm is retried as transient;
// only repeated stale arms (a real crash-loop) latch the breaker.
const MAX_STALE_STRIKES = 2;
const DEFAULT_TAB_KEY = 901;
const DEFAULT_AFTER_KEY = 5; // Steam's QuickAccessTab.Perf — sit just after Performance
const MAX_INSTALL_ATTEMPTS = 20;
const INSTALL_RETRY_MS = 1000;

function tripGet(): string | null {
  try { return window.localStorage.getItem(TRIP_KEY); } catch { return null; }
}
function tripSet(v: string): void {
  try { window.localStorage.setItem(TRIP_KEY, v); } catch {}
}
function tripClear(): void {
  try { window.localStorage.removeItem(TRIP_KEY); } catch {}
}

/* Breaker: an arm that never confirmed MAY mean the confirming render crashed
   the renderer. A recent arm is a normal re-inject; a stale arm is a "strike"
   (first one retried as transient, carried forward), and reaching
   MAX_STALE_STRIKES latches "tripped". `armStrikes()` reads the carried count. */
function armStrikes(): number {
  const prior = tripGet();
  if (!prior?.startsWith("armed")) return 0;
  return Number(prior.split(":")[2]) || 0;
}
/* Pure breaker decision (exported for unit tests — no `window`/localStorage):
   given the stored value + `now`, returns the decision and the next value to
   store (`null` = leave unchanged). */
export function evaluateBreaker(
  prior: string | null,
  now: number,
): { decision: "ok" | "tripped"; next: string | null } {
  if (!prior) return { decision: "ok", next: null };
  if (prior.startsWith("tripped")) return { decision: "tripped", next: null };
  if (!prior.startsWith("armed")) return { decision: "ok", next: null };
  const parts = prior.split(":");
  const armTs = Number(parts[1]) || 0;
  const strikes = Number(parts[2]) || 0;
  if (now - armTs <= STALE_ARM_MS) return { decision: "ok", next: null };
  if (strikes + 1 >= MAX_STALE_STRIKES) return { decision: "tripped", next: `tripped:${now}` };
  return { decision: "ok", next: `armed:${now}:${strikes + 1}` };
}
function checkBreaker(): "ok" | "tripped" {
  const { decision, next } = evaluateBreaker(tripGet(), Date.now());
  if (next !== null) tripSet(next);
  return decision;
}

/* Tab-ownership handshake with a neutral host (ShelvesHub) in coexistence: the
   host owns the Deck Shelves QAM tab, but ours retracts ONLY once the host's has
   actually landed — never on the mere presence of the `__SHELVES_QAM__` bridge
   (created at boot, before any tab), which risked dropping ours into a gap if
   the host set the bridge but its own insert was delayed or failed. */
// Either race-safe signal suffices; if neither holds ours stays as the fallback:
// `hostStampedOwner` (owner global, stamped on real insertion) and `hostTabInList`
// (the host's tab observed in the live array, by its `__shelvesTab` marker).
const HOST_TAB_MARKER = "__shelvesTab";

function hostStampedOwner(): boolean {
  try {
    const o = (window as any).__SHELVES_QAM_OWNER__;
    return typeof o === "string" && o.length > 0;
  } catch { return false; }
}

/** Pure (exported for tests): is the host's own Deck Shelves tab already in this
 *  list? Matched by the host's marker and excluding our own key, so the two
 *  never mistake each other. */
export function hostTabInList(tabs: any[], ownKey: number): boolean {
  return (
    Array.isArray(tabs) &&
    tabs.some((t) => t && t.key !== ownKey && (t as any)[HOST_TAB_MARKER] === true)
  );
}

function tabEnum(): any {
  try {
    return (
      findModuleByExport((m: any) => m && m.Notifications === 0 && m.Settings === 4 && m.Help === 6) ??
      findModuleByExport((m: any) =>
        m && typeof m === "object" &&
        typeof m.Notifications === "number" && typeof m.Settings === "number" && typeof m.Help === "number" &&
        m[m.Settings] === "Settings")
    );
  } catch { return null; }
}

function registerTabEnum(key: number, name: string): boolean {
  try {
    const e = tabEnum();
    if (!e) return false;
    if (e[key] === undefined) { e[key] = name; e[name] = key; }
    return true;
  } catch { return false; }
}

// The tab-list *builder* export is a sealed webpack getter and can't be
// wrapped; `QuickAccessMenuBrowserView` (and its embedded twin) has a
// writable `.type`, so that's what gets `afterPatch`ed instead.
function findQamConsumer(): { bv: any; embedded: any } | null {
  const mod = findModuleByExport((e: any) =>
    e?.type && typeof e.type === "function" && e.type.toString().includes("QuickAccessMenuBrowserView"));
  if (!mod) return null; // consumer chunk not loaded yet — caller retries
  const values = Object.values(mod as Record<string, any>);
  const bv = values.find((e: any) => e?.type?.toString?.().includes("QuickAccessMenuBrowserView"));
  if (!bv || typeof (bv as any).type !== "function") return null;
  const embedded = values.find((e: any) => e?.type?.toString?.().includes("QuickAccessMenuEmbedded"));
  return { bv, embedded };
}

function patchConsumer(component: any, handler: (args: any, ret: any) => any): void {
  if (!component || typeof component.type !== "function" || component.type.__dsOwnQamTabPatched) return;
  afterPatch(component, "type", handler);
  component.type.__dsOwnQamTabPatched = true;
}

/* `QuickAccessMenuBrowserView`'s own return never carries `props.tabs` — it
   just portals a second, closure-captured component (not a stable webpack
   export) whose OWN render builds the tabs array. Found by PROP SHAPE
   (stable across minification) inside `ret`'s tree; its `.type` gets
   swapped every render, same mechanism `afterPatch` uses for `bv`. */
function isQamRootElement(x: any): boolean {
  return !!x?.props && typeof x.type === "function" &&
    "onFocusNavActivated" in x.props && "onFocusNavDeactivated" in x.props && "expanded" in x.props;
}

/* `QuickAccessMenuBrowserView` portals its content into a separate CEF
   surface, but the fiber stays on Steam's main gamepad-UI window's own
   tree — reachable via `SteamUIStore`'s window store, not this bundle's own
   `document`. A consumer already mounted keeps its pre-patch `.type` cached,
   so patching the shared export alone only takes effect on a future mount. */
function getGamepadUiDocument(): Document | null {
  try {
    const w = (globalThis as any).SteamUIStore?.WindowStore?.GamepadUIMainWindowInstance;
    return w?.m_BrowserWindow?.document ?? null;
  } catch { return null; }
}

function findAnyFiber(doc: Document): any {
  const els = doc.querySelectorAll("div");
  for (let i = 0; i < els.length; i++) {
    const key = Object.keys(els[i]).find((k) => k.startsWith("__reactFiber$"));
    if (key) return (els[i] as any)[key];
  }
  return null;
}

function fiberTreeRoot(doc: Document): any {
  const fiber = findAnyFiber(doc);
  if (!fiber) return null;
  let node = fiber;
  let top = fiber;
  for (let i = 0; i < 2000 && node; i++) { top = node; node = node.return; }
  return top;
}

function findMountedNode(root: any, bv: any, embedded: any): any {
  let found: any = null;
  let steps = 0;
  const walk = (n: any) => {
    if (!n || found || steps++ > 200_000) return;
    if (n.elementType === bv || (embedded && n.elementType === embedded)) { found = n; return; }
    walk(n.child);
    walk(n.sibling);
  };
  walk(root);
  return found;
}

// A consumer already mounted keeps its pre-patch `.type` cached — re-point
// that ONE fiber (and its double-buffer alternate) so an already-open menu
// picks up the tab without waiting for a remount that may never happen.
function repointMountedConsumer(bv: any, embedded: any): "repointed" | "not-mounted" | "no-doc" | "error" {
  try {
    const doc = getGamepadUiDocument();
    if (!doc) return "no-doc";
    const root = fiberTreeRoot(doc);
    if (!root) return "no-doc";
    const node = findMountedNode(root, bv, embedded);
    if (!node?.elementType?.type) return "not-mounted";
    node.type = node.elementType.type;
    if (node.alternate) node.alternate.type = node.type;
    logInfo("RUNTIME", "own QAM tab: re-pointed already-mounted consumer.");
    return "repointed";
  } catch (e) {
    logWarn("RUNTIME", "own QAM tab: mounted re-point skipped: " + String(e));
    return "error";
  }
}

export interface OwnQamTabOptions {
  key?: number;
  afterKey?: number | null;
  title: string;
  icon: ReactNode;
  renderPanel: () => ReactNode;
  /** Read fresh on every QAM render (so the setting can retract the tab
   *  without a Steam restart) AND polled at boot until it reads true or the
   *  retry budget runs out (settings may not have loaded yet — see
   *  `tryInstall`). Turning it back ON needs a restart regardless — the
   *  consumer is only ever patched once, at call time. */
  isEnabled: () => boolean;
}

export function installOwnQamTab(opts: OwnQamTabOptions): () => void {
  const KEY = opts.key ?? DEFAULT_TAB_KEY;
  const AFTER = opts.afterKey === undefined ? DEFAULT_AFTER_KEY : opts.afterKey;
  let patched = false;
  let confirmed = false;
  let disposed = false;
  let cachedTab: any = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Temporary on-device debug hook (__DEV__-only) for investigating why the
  // tab isn't showing up despite a successful enum + consumer patch.
  const debugState = { renderCalls: 0, rootFound: null as boolean | null, lastNodeFound: null as boolean | null, lastTabsLength: null as number | null, repoint: null as string | null };
  if (__DEV__) {
    try { (globalThis as any).__ds_dev_own_qam_tab_debug = () => ({ ...debugState, patched, confirmed, hostOwner: hostStampedOwner(), enabled: opts.isEnabled() }); } catch {}
  }

  function insertAt(tabs: any[]): void {
    const i = AFTER == null ? -1 : tabs.findIndex((t) => t?.key === AFTER);
    tabs.splice(i >= 0 ? i + 1 : tabs.length, 0, cachedTab);
  }

  // Retract on every render where the feature is off or the host has taken
  // ownership of the tab (stamped the owner signal, or its tab is already in
  // this list), so both take effect on the very next QAM render.
  function pushTab(tabs: any[]): void {
    if (hostStampedOwner() || hostTabInList(tabs, KEY) || !opts.isEnabled()) {
      const i = tabs.findIndex((t) => t?.key === KEY);
      if (i >= 0) tabs.splice(i, 1);
      return;
    }
    if (tabs.some((t) => t?.key === KEY)) return; // already present, idempotent
    // Built once and reused — a fresh object every render would hand Steam
    // a new panel element each time, remounting the settings UI.
    cachedTab ??= { key: KEY, strTitle: opts.title, title: null, tab: opts.icon, panel: opts.renderPanel(), vrLocation: "quick-access-menu", __dsOwnQamTab: true };
    insertAt(tabs);
    if (!confirmed) { confirmed = true; tripClear(); logInfo("RUNTIME", "own QAM tab: inserted, healthy."); }
  }

  function injectTabs(ret: any): void {
    debugState.renderCalls += 1;
    const rootEl = findInReactTree(ret, isQamRootElement);
    debugState.rootFound = !!rootEl;
    if (!rootEl) return;
    const origType = rootEl.type;
    rootEl.type = (props: any) => {
      const innerRet = origType(props);
      const node = findInReactTree(innerRet, (x: any) => x?.props && Array.isArray(x.props.tabs));
      debugState.lastNodeFound = !!node;
      debugState.lastTabsLength = node ? node.props.tabs.length : null;
      if (node) pushTab(node.props.tabs);
      return innerRet;
    };
  }

  function install(): boolean {
    if (patched) return true;
    try {
      const consumer = findQamConsumer();
      if (!consumer) return false;
      if (consumer.bv.type.__dsOwnQamTabPatched) { patched = true; return true; }
      // Steam derives the panel wrapper's class as `tab_${QuickAccessTab[key]}`,
      // so the enum name must be a single CSS-safe token, not the spaced
      // display title (that lives on `strTitle`) — matching "Notifications"/"Perf".
      if (!registerTabEnum(KEY, "DeckShelves")) {
        logWarn("RUNTIME", "own QAM tab: enum not found — standing down (would render as tab_undefined).");
        return false;
      }
      const handler = (_args: any, ret: any) => {
        try {
          // Re-arm before the risky render, preserving the carried strike count
          // (see checkBreaker) so a real crash-loop still latches while a one-off
          // interruption that later confirms clears cleanly.
          if (!confirmed) tripSet(`armed:${Date.now()}:${armStrikes()}`);
          injectTabs(ret);
        } catch (e) { logWarn("RUNTIME", "own QAM tab: append error (ignored): " + String(e)); }
        return ret;
      };
      patchConsumer(consumer.bv, handler);
      patchConsumer(consumer.embedded, handler);
      patched = true;
      logInfo("RUNTIME", "own QAM tab: consumer patched.");
      debugState.repoint = repointMountedConsumer(consumer.bv, consumer.embedded);
      return true;
    } catch (e) {
      tripClear();
      logWarn("RUNTIME", "own QAM tab: install failed: " + String(e));
      return false;
    }
  }

  let attempts = 0;
  const tryInstall = () => {
    if (disposed || patched) { timer = null; return; }
    /* Settings may not have loaded yet — a ONE-SHOT check at call time can
       silently and permanently miss a feature that really is on (observed
       on-device: enabling, restarting, still no tab). Poll here instead,
       same retry budget as an install() failure — window/Steam internals
       stay untouched whether that's a slow load or genuinely disabled. */
    if (!opts.isEnabled()) {
      if (++attempts >= MAX_INSTALL_ATTEMPTS) { timer = null; return; }
      timer = setTimeout(tryInstall, INSTALL_RETRY_MS);
      return;
    }
    const breaker = checkBreaker();
    if (breaker === "tripped") {
      logError("RUNTIME", `own QAM tab: breaker tripped — standing down; clear localStorage['${TRIP_KEY}'] to retry.`);
      timer = null;
      return;
    }
    if (install() || ++attempts >= MAX_INSTALL_ATTEMPTS) { timer = null; return; }
    timer = setTimeout(tryInstall, INSTALL_RETRY_MS);
  };
  /* Deferred start, same discipline as index.tsx's own idle-scheduled work —
     never touch Steam's module graph on the hottest boot frame. A `timeout`
     is required: without one, requestIdleCallback has no firing guarantee at
     all if the UI never has a long-enough idle window (observed on-device —
     the callback can be starved for a minute or more otherwise). */
  const ric = (globalThis as any).requestIdleCallback;
  const schedule = ric ? (cb: () => void) => ric(cb, { timeout: 5000 }) : (cb: () => void) => setTimeout(cb, 2000);
  schedule(tryInstall);

  return () => {
    disposed = true;
    if (timer !== null) { clearTimeout(timer); timer = null; }
  };
}
