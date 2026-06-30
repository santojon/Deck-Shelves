/* HostApi contract (v1.0.0) — additive-only after this point.

   Capability interfaces consumed by the Deck Shelves bundle. Adapters
   fulfil this shape so the bundle's call sites don't depend on */
/* `@decky/*` imports directly:
     - `DeckyHostApi` (Decky Loader runtime; only place new `@decky/*`
       imports may be added).

   Scope: capability interfaces + re-export shapes only. No behavior. */
import type { PlatformApi } from "../platform";

export const HOST_API_VERSION = "1.0.0" as const;

export interface PluginDescriptor {
  name: string;
  version: string;
}

export interface Disposable {
  dispose(): void;
}

export interface HostLifecycle {
  register(plugin: PluginDescriptor): Disposable;
  onMount(cb: () => void): void;
  onUnmount(cb: () => void): void;
}

/** Generic RPC channel — `call<Req, Res>` is the unified surface.
 *  Decky adapter routes through `@decky/api`'s `call`. */
export interface HostRpc {
  call<Req = unknown, Res = unknown>(method: string, args?: Req): Promise<Res>;
}

export interface HostRoutes {
  register(path: string, component: () => any): Disposable;
}

export interface ToastOptions {
  title?: string;
  body: string;
  durationMs?: number;
}

export interface HostNotifications {
  toast(opts: ToastOptions): void;
}

export interface HostUi {
  ConfirmModal: any; DialogBody: any; DialogButton: any; DialogControlsSection: any;
  Dropdown: any; DropdownItem: any; Field: any; Focusable: any; GamepadButton: any;
  Menu: any; MenuItem: any; Navigation: any; SliderField: any; Spinner: any;
  Tabs: any; TextField: any; ToggleField: any;
  showContextMenu: (m: any) => void; showModal: (m: any) => void;
}

export interface HostApi {
  readonly version: typeof HOST_API_VERSION;
  readonly lifecycle: HostLifecycle;
  readonly rpc: HostRpc;
  readonly ui: HostUi;
  readonly routes: HostRoutes;
  readonly notifications?: HostNotifications;
  readonly platform: PlatformApi;
}
