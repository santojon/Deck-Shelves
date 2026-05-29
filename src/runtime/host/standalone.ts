// StandaloneHostApi — stub. Filled in when the standalone host repo
// ships. Compiles + throws on any call.
import { HOST_API_VERSION, type HostApi } from "./contract";

const notImpl = (name: string) => { throw new Error(`StandaloneHostApi.${name} not implemented`); };

export function createStandaloneHostApi(): HostApi {
  return {
    version: HOST_API_VERSION,
    lifecycle: { onUnmount() { notImpl("lifecycle.onUnmount"); } },
    rpc: { async call() { return notImpl("rpc.call") as never; } },
    ui: new Proxy({} as any, { get: (_t, k) => notImpl(`ui.${String(k)}`) }),
    routes: { add() { notImpl("routes.add"); }, remove() { notImpl("routes.remove"); } },
    notifications: undefined,
    platform: new Proxy({} as any, { get: (_t, k) => notImpl(`platform.${String(k)}`) }),
  };
}
