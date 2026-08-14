type LegacyServerApi = {
  call?: (method: string, args?: unknown) => Promise<unknown>;
  callPluginMethod?: (method: string, args?: unknown) => Promise<{ success?: boolean; result?: unknown }>;
  openFilePicker?: (...args: unknown[]) => Promise<any>;
  toaster?: { toast: (input: { title?: string; body?: string; duration?: number }) => unknown };
  routerHook?: any;
};

import { logWarn } from "../runtime/logger";

type ConnectedApi = {
  call?: <T = unknown>(route: string, ...args: any[]) => Promise<T>;
  callable?: <T = unknown>(route: string) => (...args: any[]) => Promise<T>;
  toaster?: { toast: (input: { title?: string; body?: string; duration?: number }) => unknown };
  openFilePicker?: (...args: unknown[]) => Promise<any>;
  routerHook?: any;
};

/* Both globals are looked up LAZILY (via getters) because the shim
   module executes very early in the plugin bootstrap — earlier than
   Decky finishes attaching `DFL` / `__DECKY_SECRET_INTERNALS_…` to
   `window`. Capturing them at module load left the toaster (and any */
/* other DFL-backed primitive) wired to `undefined` for the entire
   plugin session, silently dropping every `toaster.toast()` call from
   boot-time code paths (the update notifier toast was the visible
   casualty). Lazy lookup re-checks `globalThis` on every access, so the
   first call after Decky exposes the API succeeds. */
function getDeckyGlobal(): any {
  const w: any = (globalThis as any).window ?? globalThis;
  return (globalThis as any).DFL
    || (globalThis as any).deckyFrontendLib
    || w?.DFL
    || w?.deckyFrontendLib;
}
function getDeckyLoaderInit(): any {
  const w: any = (globalThis as any).window ?? globalThis;
  return w?.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;
}

let legacyServerApi: LegacyServerApi | null = null;
let connectedApi: ConnectedApi | null = null;

function ensureConnected(): ConnectedApi | null {
  if (connectedApi) return connectedApi;
  try {
    const init = getDeckyLoaderInit();
    if (init?.connect) {
      connectedApi = init.connect(1, 'Deck Shelves');
      return connectedApi;
    }
  } catch (error) {
    logWarn("RUNTIME", "failed to connect Decky loader api", String(error));
  }
  return null;
}

export function definePlugin(factory: (serverAPI?: any) => unknown) {
  return function deckyPluginEntry(serverAPI?: any) {
    // Prefer the runtime serverAPI that Decky passes into the plugin entry.
    // This is the most reliable transport for callPluginMethod and toaster in QAM.
    if (serverAPI) legacyServerApi = serverAPI;
    return factory(serverAPI ?? legacyServerApi ?? ensureConnected() ?? getDeckyGlobal());
  };
}

// `callPluginMethod` wraps the value in `{ result }`; `call` returns it raw.
function unwrapResult<T>(response: any): T {
  if (response && typeof response === 'object' && 'result' in response) return response.result as T;
  return response as T;
}

// The neutral host (e.g. ShelvesHub) injects its runtime as `__SHELVES_HOST__`
// on the renderer global; it carries `rpc.call` (backend proxy) + `notifications`.
function getShelvesHost(): any {
  const g = globalThis as any;
  return g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__ ?? null;
}

// The shim's wire payload: no args → `{}`, one arg → the arg as-is (kwargs-shaped
// object), many → wrapped. Matches what every host dispatches as arguments.
function toPayload(args: unknown[]): unknown {
  if (args.length === 0) return {};
  return args.length === 1 ? args[0] : { args };
}

export async function call<TArgs extends unknown[], TResult>(method: string, ...args: TArgs): Promise<TResult> {
  const payload = toPayload(args);

  const serverApi = legacyServerApi;
  if (serverApi?.callPluginMethod) {
    return unwrapResult<TResult>(await serverApi.callPluginMethod(method, payload));
  }
  if (serverApi?.call) {
    return await serverApi.call(method, payload) as TResult;
  }

  const api = ensureConnected();
  if (api?.call) {
    return await api.call<TResult>(method, ...args);
  }

  // ShelvesHub / neutral host: the runner proxies renderer RPC to the backend
  // via `window.__SHELVES_HOST__.rpc`. `payload` is the kwargs-shaped object the
  // runner dispatches as keyword arguments (see the backend host contract).
  const sh = getShelvesHost();
  if (sh?.rpc?.call) return await sh.rpc.call(method, payload) as TResult;

  throw new Error(`Deck Shelves: backend not ready for ${method}`);
}

export function callable<TArgs extends unknown[], TResult>(method: string) {
  return (...args: TArgs) => call<TArgs, TResult>(method, ...args);
}

/* Late-resolved via Proxy: enum lookups happen at access time so
   `FileSelectionType.FILE` works even when this module loaded before
   DFL was attached. Falls back to the documented numeric values when
   DFL truly never provides the enum. */
const FILE_SELECTION_FALLBACK = { FILE: 0, FOLDER: 1 };
export const FileSelectionType: { FILE: number; FOLDER: number } = new Proxy({} as any, {
  get(_t, prop) {
    const fromGlobal = (getDeckyGlobal() as any)?.FileSelectionType;
    return (fromGlobal && (prop in fromGlobal)) ? fromGlobal[prop as any] : (FILE_SELECTION_FALLBACK as any)[prop];
  },
});

export async function openFilePicker(...args: unknown[]) {
  const serverApi = legacyServerApi;
  if (typeof serverApi?.openFilePicker === 'function') return await serverApi.openFilePicker(...args);
  const api = ensureConnected();
  if (api?.openFilePicker) return await api.openFilePicker(...args);
  const dg = getDeckyGlobal();
  const picker = dg?.openFilePicker ?? dg?.filePicker?.openFilePicker;
  if (!picker) throw new Error('Deck Shelves: file picker is not available in this Decky runtime');
  return await picker(...args);
}

/* Getter-style accessor so callers reading at boot still pick up the
   hook after DFL initialises. Existing call sites that captured this
   at import time (rare) get whatever was available then; new code
   should call `getRouterHook()` directly. */
export const routerHook = (() => {
  /* Defer to first access via a thenable-like getter on the export
     would break ES module semantics — instead expose a function for
     late callers AND keep the original symbol for back-compat with any
     existing immediate reader. Most readers happen post-bootstrap, so
     the immediate value is usually correct anyway. */
  return getDeckyGlobal()?.routerHook;
})();
export function getRouterHook(): any { return getDeckyGlobal()?.routerHook; }

// Toast via a candidate's `toaster.toast` if present (called as a method so
// `this` stays the toaster); `done` false means this candidate had none.
function tryToast(target: any, input: any): { done: boolean; result?: any } {
  const toaster = target?.toaster;
  if (!toaster?.toast) return { done: false };
  return { done: true, result: toaster.toast(input) };
}

// ShelvesHub / neutral host: route toasts through its notification API. A
// contract-conforming runtime exposes toast(opts); older ones expose send().
function tryShelvesHubToast(input: { title?: string; body?: string; duration?: number }): { done: boolean; result?: any } {
  const notifs = getShelvesHost()?.notifications;
  if (notifs?.toast) return { done: true, result: notifs.toast({ title: input.title ?? "", body: input.body, durationMs: input.duration }) };
  if (notifs?.send) return { done: true, result: notifs.send(input.title ?? "", input.body ?? "", input.duration) };
  return { done: false };
}

export const toaster = {
  toast(input: { title?: string; body?: string; duration?: number }) {
    try {
      const a = tryToast(legacyServerApi, input);
      if (a.done) return a.result;
      const b = tryToast(ensureConnected(), input);
      if (b.done) return b.result;
      const c = tryToast(getDeckyGlobal(), input);
      if (c.done) return c.result;
      const d = tryShelvesHubToast(input);
      if (d.done) return d.result;
    } catch (error) {
      logWarn("RUNTIME", "toast failed", { error: String(error), input });
    }
  },
};
