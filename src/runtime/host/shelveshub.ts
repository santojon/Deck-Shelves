/* ShelvesHubHostApi — fulfils the HostApi contract using the runtime ShelvesHub
   injects as `window.__SHELVES_HOST__`, so the bundle runs unchanged without the
   plugin loader. Sibling of `decky.ts`; contains NO `@decky/*` imports. Interim
   bridge only: `resolveHost` uses a conforming injected runtime as-is, falling
   back here for the older runtime shape until the runtime conforms directly. */
import { HOST_API_VERSION, type Disposable, type HostApi, type PluginDescriptor, type ToastOptions } from "./contract";
import { getPlatform } from "../platformContext";
import type { PlatformApi } from "../platform";
import { logInfo } from "../logger";

/* Shape of the runtime ShelvesHub injects before the bundle. Only the members
   this adapter consumes are typed; `ui` is the contract's own `ui`, so the
   Steam-native components the runtime locates flow straight through. */
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
    throw new Error("Deck Shelves: window.__SHELVES_HOST__ is not present — the ShelvesHub host runtime was not injected.");
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
    // The runtime locates the Steam-native components; they satisfy `HostUi`.
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
        // Contract's `{ title?, body, durationMs? }` maps to the runtime's
        // `send(title, body, timeout)`.
        try { rt.notifications.send(opts.title ?? "", opts.body, opts.durationMs); } catch {}
      },
    },
    // Platform is renderer-side (SteamClient / collectionStore), identical under
    // both hosts — reuse the same provider the plugin loader adapter does.
    platform: getPlatform() as PlatformApi,
    // Internal hooks index.tsx fires at the matching lifecycle moments (not part
    // of the HostApi contract — exposed via an `as any` cast at the call site).
    ...({
      __fireMount: () => { for (const cb of mountCbs) try { cb(); } catch {} },
      __fireUnmount: () => { for (const cb of unmountCbs) try { cb(); } catch {} },
    } as any),
  };
}
