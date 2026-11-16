import { HOST_API_VERSION, type Disposable, type HostApi, type PluginDescriptor, type ToastOptions } from "./contract";
import { getPlatform } from "../platformContext";
import type { PlatformApi } from "../platform";
import { logInfo } from "../logger";

interface ShelvesHostRuntime {
  readonly version?: string;
  readonly ui: HostApi["ui"];
  readonly rpc: { call<Req = unknown, Res = unknown>(method: string, args?: Req): Promise<Res> };
  readonly lifecycle: { register(): void; onMount(cb: () => void): void; onUnmount(cb: () => void): void };
  readonly routes: { addRoute(path: string, component: () => any): void; removeRoute(path: string): void };
  readonly notifications: { send(title: string, body: string, timeout?: number): void };
}

function getRuntime(): ShelvesHostRuntime | null {
  const g = globalThis as any;
  return (g.__SHELVES_HOST__ ?? g.window?.__SHELVES_HOST__ ?? null) as ShelvesHostRuntime | null;
}

export function createShelvesHubHostApi(): HostApi {
  const rt = getRuntime();
  if (!rt) {
    throw new Error("Deck Shelves: window.__SHELVES_HOST__ is not present — the host runtime was not injected.");
  }

  const mountCbs = new Set<() => void>();
  const unmountCbs = new Set<() => void>();
  let registeredPlugin: PluginDescriptor | null = null;
  logInfo("RUNTIME", "HostApi source: shelveshub (window.__SHELVES_HOST__)");

  return {
    version: HOST_API_VERSION,
    lifecycle: {
      register(plugin) {
        registeredPlugin = plugin;
        try { rt.lifecycle.register(); } catch {}
        logInfo("RUNTIME", "HostApi.lifecycle.register", { name: plugin.name, version: plugin.version });
        return {
          dispose() { if (registeredPlugin?.name === plugin.name) registeredPlugin = null; },
        } satisfies Disposable;
      },
      onMount(cb) { mountCbs.add(cb); try { rt.lifecycle.onMount(cb); } catch {} },
      onUnmount(cb) { unmountCbs.add(cb); try { rt.lifecycle.onUnmount(cb); } catch {} },
    },
    rpc: {
      async call<Req = unknown, Res = unknown>(method: string, args?: Req): Promise<Res> {
        return rt.rpc.call<Req, Res>(method, args);
      },
    },
    ui: rt.ui,
    routes: {
      register(path, component) {
        try { rt.routes.addRoute(path, component); } catch {}
        return {
          dispose() { try { rt.routes.removeRoute(path); } catch {} },
        } satisfies Disposable;
      },
    },
    notifications: {
      toast(opts: ToastOptions) {
        try { rt.notifications.send(opts.title ?? "", opts.body, opts.durationMs); } catch {}
      },
    },
    platform: getPlatform() as PlatformApi,
    ...({
      __fireMount: () => { for (const cb of mountCbs) try { cb(); } catch {} },
      __fireUnmount: () => { for (const cb of unmountCbs) try { cb(); } catch {} },
    } as any),
  };
}
