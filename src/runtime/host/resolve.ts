/* resolveHost — the ONE place in the bundle that knows a concrete host exists.
   The core depends only on `HostApi`; adding a host is a branch here plus its
   adapter file. Selection is by launch signal, not brand: a plugin loader hands
   us a serverApi / router hook, a neutral host injects a runtime global. Loader
   wins on a dual-install — the bundle uses the host that launched THIS instance. */
import { createDeckyHostApi } from "./decky";
import { createShelvesHubHostApi } from "./shelveshub";
import { getPlatform } from "../platformContext";
import type { HostApi } from "./contract";

function injectedHostRuntime(): any {
  const g = globalThis as any;
  return g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__ ?? null;
}

export function resolveHost(serverApi: unknown, routerHook: unknown): HostApi {
  // A plugin loader launched us (it passed a serverApi, or left a router hook) —
  // use the Decky legacy bridge even if an injected host global also exists.
  if (serverApi || routerHook) return createDeckyHostApi(routerHook);

  const injected = injectedHostRuntime();
  if (injected) {
    /* A conforming runtime (signalled by `notifications.toast`) supplies host
       mechanics directly, but `platform` is renderer-side Deck Shelves domain
       logic that must stay plugin-side — compose ours over the runtime's minimal
       OS platform. An older runtime shape falls back to the interim adapter. */
    return typeof injected?.notifications?.toast === "function"
      ? ({ ...(injected as object), platform: getPlatform() } as HostApi)
      : createShelvesHubHostApi();
  }

  throw new Error("Deck Shelves: no host available (no plugin loader, no injected host runtime)");
}
