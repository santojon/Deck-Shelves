import { createDeckyHostApi } from "./decky";
import { createShelvesHubHostApi } from "./shelveshub";
import { getPlatform } from "../platformContext";
import { getInjectedHost, isForcedOwner, type HostApi } from "./contract";

function injectedHostRuntime(): any {
  const g = globalThis as any;
  return g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__ ?? null;
}

export function shouldUseForcedHost(): boolean {
  return isForcedOwner() && !!getInjectedHost();
}

/** Under cooperative force the loader can boot the bundle before the host is injected. */
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

export function hostProvidesNativeTab(): boolean {
  const g = globalThis as any;
  try {
    return !!(g.window?.__SHELVES_QAM__ ?? g.__SHELVES_QAM__ ?? g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__);
  } catch {
    return false;
  }
}

// `platform` stays plugin-side, composed over the runtime's minimal OS platform.
function injectedHostApi(): HostApi {
  const injected = injectedHostRuntime();
  return typeof injected?.notifications?.toast === "function"
    ? ({ ...(injected as object), platform: getPlatform() } as HostApi)
    : createShelvesHubHostApi();
}

export function resolveHost(serverApi: unknown, routerHook: unknown): HostApi {
  if (shouldUseForcedHost()) return injectedHostApi();

  // The launching loader wins even if an injected host global also exists.
  if (serverApi || routerHook) return createDeckyHostApi(routerHook);

  if (injectedHostRuntime()) return injectedHostApi();

  throw new Error("Deck Shelves: no host available (no plugin loader, no injected host runtime)");
}
