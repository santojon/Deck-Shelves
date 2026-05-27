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

// Both globals are looked up LAZILY (via getters) because the shim
// module executes very early in the plugin bootstrap — earlier than
// Decky finishes attaching `DFL` / `__DECKY_SECRET_INTERNALS_…` to
// `window`. Capturing them at module load left the toaster (and any
// other DFL-backed primitive) wired to `undefined` for the entire
// plugin session, silently dropping every `toaster.toast()` call from
// boot-time code paths (the update notifier toast was the visible
// casualty). Lazy lookup re-checks `globalThis` on every access, so the
// first call after Decky exposes the API succeeds.
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

export async function call<TArgs extends unknown[], TResult>(method: string, ...args: TArgs): Promise<TResult> {
  const payload = args.length === 0 ? {} : args.length === 1 ? args[0] : { args };

  const serverApi = legacyServerApi;
  if (serverApi?.callPluginMethod) {
    const response = await serverApi.callPluginMethod(method, payload);
    if (response && typeof response === 'object' && 'result' in response) {
      return response.result as TResult;
    }
    return response as TResult;
  }
  if (serverApi?.call) {
    return await serverApi.call(method, payload) as TResult;
  }

  const api = ensureConnected();
  if (api?.call) {
    return await api.call<TResult>(method, ...args);
  }

  throw new Error(`Deck Shelves: backend not ready for ${method}`);
}

export function callable<TArgs extends unknown[], TResult>(method: string) {
  return (...args: TArgs) => call<TArgs, TResult>(method, ...args);
}

// Late-resolved via Proxy: enum lookups happen at access time so
// `FileSelectionType.FILE` works even when this module loaded before
// DFL was attached. Falls back to the documented numeric values when
// DFL truly never provides the enum.
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

// Getter-style accessor so callers reading at boot still pick up the
// hook after DFL initialises. Existing call sites that captured this
// at import time (rare) get whatever was available then; new code
// should call `getRouterHook()` directly.
export const routerHook = (() => {
  // Defer to first access via a thenable-like getter on the export
  // would break ES module semantics — instead expose a function for
  // late callers AND keep the original symbol for back-compat with any
  // existing immediate reader. Most readers happen post-bootstrap, so
  // the immediate value is usually correct anyway.
  return getDeckyGlobal()?.routerHook;
})();
export function getRouterHook(): any { return getDeckyGlobal()?.routerHook; }

export const toaster = {
  toast(input: { title?: string; body?: string; duration?: number }) {
    try {
      if (legacyServerApi?.toaster?.toast) return legacyServerApi.toaster.toast(input);
      const api = ensureConnected();
      if (api?.toaster?.toast) return api.toaster.toast(input);
      return getDeckyGlobal()?.toaster?.toast?.(input);
    } catch (error) {
      logWarn("RUNTIME", "toast failed", { error: String(error), input });
    }
  },
};
