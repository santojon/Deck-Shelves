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

// Looked up lazily: the loader attaches these globals after this module runs.
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
    if (serverAPI) legacyServerApi = serverAPI;
    return factory(serverAPI ?? legacyServerApi ?? ensureConnected() ?? getDeckyGlobal());
  };
}

// `callPluginMethod` wraps the value in `{ result }`; `call` returns it raw.
function unwrapResult<T>(response: any): T {
  if (response && typeof response === 'object' && 'result' in response) return response.result as T;
  return response as T;
}

// No args → {}, one arg → as-is (kwargs-shaped), many → wrapped.
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

  throw new Error(`Deck Shelves: backend not ready for ${method}`);
}

export function callable<TArgs extends unknown[], TResult>(method: string) {
  return (...args: TArgs) => call<TArgs, TResult>(method, ...args);
}

// Proxy so enum lookups resolve at access time, with the documented numbers as fallback.
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

export const routerHook = (() => {
  return getDeckyGlobal()?.routerHook;
})();
export function getRouterHook(): any { return getDeckyGlobal()?.routerHook; }

// Called as a method so `this` stays the toaster.
function tryToast(target: any, input: any): { done: boolean; result?: any } {
  const toaster = target?.toaster;
  if (!toaster?.toast) return { done: false };
  return { done: true, result: toaster.toast(input) };
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
    } catch (error) {
      logWarn("RUNTIME", "toast failed", { error: String(error), input });
    }
  },
};
