// HostApi contract (v1.0.0) — additive-only after this point.
//
// Capability interfaces consumed by the Deck Shelves bundle. Adapters
// fulfil this shape so the bundle's call sites don't depend on
// `@decky/*` imports directly:
//   - `DeckyHostApi` (Decky Loader runtime; only place new `@decky/*`
//     imports may be added).
//
// Scope: capability interfaces + re-export shapes only. No behavior.
import type { PlatformApi } from "../platform";

export const HOST_API_VERSION = "1.0.0" as const;

/** Plugin identity passed to `lifecycle.register` at boot. */
export interface PluginDescriptor {
  /** Plugin id — matches the bundle manifest `name` field. */
  name: string;
  /** Plugin semver. Surfaced to host diagnostics surfaces. */
  version: string;
}

/** Standard Disposable shape — return value of `register` calls so the
 *  host (or the plugin itself) can tear down side effects. */
export interface Disposable {
  dispose(): void;
}

export interface HostLifecycle {
  /** Called once at bundle boot. Returns a Disposable the host invokes
   *  on unload. Implementations may track the registered plugin for
   *  diagnostics even when only one bundle (Deck Shelves) is loaded. */
  register(plugin: PluginDescriptor): Disposable;
  /** Fires after the bundle has been mounted into the Steam UI (the
   *  CEF renderer has accepted our injected `<script>` and our root
   *  React component has rendered at least once). */
  onMount(cb: () => void): void;
  /** Fires when the bundle is about to be torn down — typically the
   *  Steam UI renderer is reloading or the host is unloading the
   *  plugin. */
  onUnmount(cb: () => void): void;
}

/** Generic RPC channel — `call<Req, Res>` is the unified surface.
 *  Decky adapter routes through `@decky/api`'s `call`. */
export interface HostRpc {
  call<Req = unknown, Res = unknown>(method: string, args?: Req): Promise<Res>;
}

export interface HostRoutes {
  /** Registers a route. Returns a Disposable the caller invokes to
   *  remove the route. */
  register(path: string, component: () => any): Disposable;
}

export interface ToastOptions {
  /** Short title (header line). When omitted the host shows the body
   *  text without a title row. */
  title?: string;
  /** Main body text. Required — a toast with no body is a no-op. */
  body: string;
  /** Auto-dismiss timeout in ms. Host default when omitted. */
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
