import { createDeckyHostApi } from "./decky";
import type { HostApi } from "./contract";

export function resolveHost(serverApi: unknown, routerHook: unknown): HostApi {
  if (serverApi || routerHook) return createDeckyHostApi(routerHook);
  throw new Error("Deck Shelves: no host available (no plugin loader)");
}
