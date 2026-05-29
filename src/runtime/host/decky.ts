// DeckyHostApi — the only place new `@decky/*` imports may be added
// going forward. Re-exports the existing `@decky/ui` shim under the
// HostApi.ui shape. Pure adapter; no behavior change.
import { call } from "@decky/api";
import {
  ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
  Dropdown, DropdownItem, Field, Focusable, GamepadButton,
  Menu, MenuItem, Navigation, SliderField, Spinner,
  Tabs, TextField, ToggleField, showContextMenu, showModal,
} from "@decky/ui";

// Re-export the 19 primitives so pilot consumers can swap their
// `@decky/ui` import with a `runtime/host/decky` import without
// touching call sites. Future sprints absorb the remaining direct
// imports the same way.
export {
  ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
  Dropdown, DropdownItem, Field, Focusable, GamepadButton,
  Menu, MenuItem, Navigation, SliderField, Spinner,
  Tabs, TextField, ToggleField, showContextMenu, showModal,
};
import { HOST_API_VERSION, type HostApi } from "./contract";
import { getPlatform } from "../platformContext";
import type { PlatformApi } from "../platform";

export function createDeckyHostApi(routerHook: any): HostApi {
  const unmountCbs = new Set<() => void>();
  return {
    version: HOST_API_VERSION,
    lifecycle: {
      onUnmount(cb) { unmountCbs.add(cb); },
    },
    rpc: {
      async call<T>(method: string, args?: unknown): Promise<T> { return call<any[], T>(method, args as any); },
    },
    ui: {
      ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
      Dropdown, DropdownItem, Field, Focusable, GamepadButton,
      Menu, MenuItem, Navigation, SliderField, Spinner,
      Tabs, TextField, ToggleField, showContextMenu, showModal,
    },
    routes: {
      add(path, render) { try { routerHook?.addRoute?.(path, render); } catch {} },
      remove(path) { try { routerHook?.removeRoute?.(path); } catch {} },
    },
    notifications: undefined,
    platform: getPlatform() as PlatformApi,
  };
}
