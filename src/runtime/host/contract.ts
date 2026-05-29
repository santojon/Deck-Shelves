// HostApi contract (v1.0.0) — additive-only after this point.
//
// Locked early so feature sprints can target this surface from day one
// instead of being retrofitted later. Two adapters fulfil the contract:
// `DeckyHostApi` (Decky Loader runtime) and `StandaloneHostApi` (stub —
// real impl ships with the standalone host when it lands).
//
// Scope: re-exports + capability interfaces only. No behavior change.
import type { PlatformApi } from "../platform";

export const HOST_API_VERSION = "1.0.0" as const;

export interface HostLifecycle {
  onUnmount(cb: () => void): void;
}

export interface HostRpc {
  call<T = unknown>(method: string, args?: unknown): Promise<T>;
}

export interface HostRoutes {
  add(path: string, render: () => any): void;
  remove(path: string): void;
}

export interface HostNotifications {
  toast(message: string): void;
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
