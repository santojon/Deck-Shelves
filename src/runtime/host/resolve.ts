/* resolveHost — the ONE place in the bundle that knows a concrete host exists.
   The core depends only on `HostApi`; adding a host is a branch here plus its
   adapter file. Selection is by launch signal, not brand: a plugin loader hands
   us a serverApi / router hook, a neutral host injects a runtime global. Loader
   wins on a dual-install — the bundle uses the host that launched THIS instance. */
import { createDeckyHostApi } from "./decky";
import { createShelvesHubHostApi } from "./shelveshub";
import { getPlatform } from "../platformContext";
import { getInjectedHost, isForcedOwner, type HostApi } from "./contract";

function injectedHostRuntime(): any {
  const g = globalThis as any;
  return g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__ ?? null;
}

/** Cooperative force: the neutral host was forced to own AND its runtime is
    present, so the bundle binds to it even when a loader launched us (the loader
    keeps the renderer + its other plugins; Deck Shelves runs on the neutral host). */
export function shouldUseForcedHost(): boolean {
  return isForcedOwner() && !!getInjectedHost();
}

/** Wait (bounded) for the neutral host to publish `__SHELVES_HOST__`. Under
    cooperative force the loader may boot the bundle before the host is injected;
    this lets boot defer host selection until the host appears rather than racing. */
export function awaitInjectedHost(timeoutMs = 8000): Promise<HostApi | null> {
  const current = () => getInjectedHost();
  const ready = current();
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const iv = setInterval(() => {
      const h = current();
      if (h || Date.now() - startedAt > timeoutMs) {
        clearInterval(iv);
        resolve(h ?? null);
      }
    }, 100);
  });
}

/* True when a neutral host already provides its own native Quick Access tab
   (sole or coexisting with a plugin loader) — the plugin's opt-in "own QAM
   tab" option is then redundant, so the settings UI hides it and the runtime
   never double-adds a tab. `__SHELVES_QAM__` is the host's tab bridge;
   `__SHELVES_HOST__` covers the brief window before it injects. */
export function hostProvidesNativeTab(): boolean {
  const g = globalThis as any;
  try {
    return !!(
      g.window?.__SHELVES_QAM__ ?? g.__SHELVES_QAM__ ??
      g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__
    );
  } catch {
    return false;
  }
}

/* Build the HostApi from the injected neutral-host runtime. A conforming runtime
   (signalled by `notifications.toast`) supplies host mechanics directly, but
   `platform` is renderer-side Deck Shelves domain logic that must stay plugin-side
   — compose ours over the runtime's minimal OS platform. An older runtime shape
   falls back to the interim adapter. */
function injectedHostApi(): HostApi {
  const injected = injectedHostRuntime();
  return typeof injected?.notifications?.toast === "function"
    ? ({ ...(injected as object), platform: getPlatform() } as HostApi)
    : createShelvesHubHostApi();
}

export function resolveHost(serverApi: unknown, routerHook: unknown): HostApi {
  // Cooperative force: bind to the injected (neutral) host even when a loader
  // launched us — the user chose the neutral host as Deck Shelves' host/backend.
  if (shouldUseForcedHost()) return injectedHostApi();

  // A plugin loader launched us (it passed a serverApi, or left a router hook) —
  // use the Decky legacy bridge even if an injected host global also exists.
  if (serverApi || routerHook) return createDeckyHostApi(routerHook);

  if (injectedHostRuntime()) return injectedHostApi();

  throw new Error("Deck Shelves: no host available (no plugin loader, no injected host runtime)");
}
