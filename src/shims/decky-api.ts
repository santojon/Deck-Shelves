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

const deckyGlobal =
  (globalThis as any).DFL ||
  (globalThis as any).deckyFrontendLib ||
  (globalThis as any).window?.DFL ||
  (globalThis as any).window?.deckyFrontendLib;

const deckyLoaderInit = (globalThis as any).window?.__DECKY_SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED_deckyLoaderAPIInit;

let legacyServerApi: LegacyServerApi | null = null;
let connectedApi: ConnectedApi | null = null;

function ensureConnected(): ConnectedApi | null {
  if (connectedApi) return connectedApi;
  try {
    if (deckyLoaderInit?.connect) {
      connectedApi = deckyLoaderInit.connect(1, 'Deck Shelves');
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
    return factory(serverAPI ?? legacyServerApi ?? ensureConnected() ?? deckyGlobal);
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

export const FileSelectionType = (deckyGlobal as any)?.FileSelectionType ?? {
  FILE: 0,
  FOLDER: 1,
};

export async function openFilePicker(...args: unknown[]) {
  const serverApi = legacyServerApi;
  if (typeof serverApi?.openFilePicker === 'function') return await serverApi.openFilePicker(...args);
  const api = ensureConnected();
  if (api?.openFilePicker) return await api.openFilePicker(...args);
  const picker = deckyGlobal?.openFilePicker ?? deckyGlobal?.filePicker?.openFilePicker;
  if (!picker) throw new Error('Deck Shelves: file picker is not available in this Decky runtime');
  return await picker(...args);
}

export const routerHook = deckyGlobal?.routerHook;

export const toaster = {
  toast(input: { title?: string; body?: string; duration?: number }) {
    try {
      if (legacyServerApi?.toaster?.toast) return legacyServerApi.toaster.toast(input);
      const api = ensureConnected();
      if (api?.toaster?.toast) return api.toaster.toast(input);
      return deckyGlobal?.toaster?.toast?.(input);
    } catch (error) {
      logWarn("RUNTIME", "toast failed", { error: String(error), input });
    }
  },
};
