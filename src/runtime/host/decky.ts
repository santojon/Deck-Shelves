// DeckyHostApi — the only place new `@decky/*` imports may be added
// going forward. Re-exports the existing `@decky/ui` shim under the
// HostApi.ui shape. Pure adapter; no behavior change.
import { call, toaster } from "@decky/api";
import {
  ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
  Dropdown, DropdownItem, Field, Focusable, GamepadButton,
  Menu, MenuItem, Navigation, SliderField, Spinner,
  Tabs, TextField, ToggleField, showContextMenu, showModal,
} from "@decky/ui";

// Re-export the 19 primitives so pilot consumers can swap their
// `@decky/ui` import with a `runtime/host/decky` import without
// touching call sites. Remaining direct imports migrate through the
// same path as the codebase converts.
export {
  ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
  Dropdown, DropdownItem, Field, Focusable, GamepadButton,
  Menu, MenuItem, Navigation, SliderField, Spinner,
  Tabs, TextField, ToggleField, showContextMenu, showModal,
};
import { HOST_API_VERSION, type Disposable, type HostApi, type PluginDescriptor, type ToastOptions } from "./contract";
import { getPlatform } from "../platformContext";
import type { PlatformApi } from "../platform";
import { logInfo } from "../logger";

export function createDeckyHostApi(routerHook: any): HostApi {
  // Subscriber sets — `lifecycle.onMount` / `onUnmount` fire callbacks
  // once when the corresponding event occurs. Steam's component
  // lifecycle wires `onMount` at the first home render via index.tsx;
  // `onUnmount` fires when index.tsx's teardown runs (Decky plugin
  // unload OR Steam UI reload).
  const mountCbs = new Set<() => void>();
  const unmountCbs = new Set<() => void>();
  let registeredPlugin: PluginDescriptor | null = null;
  return {
    version: HOST_API_VERSION,
    lifecycle: {
      register(plugin) {
        registeredPlugin = plugin;
        logInfo("RUNTIME", "HostApi.lifecycle.register", { name: plugin.name, version: plugin.version });
        return {
          dispose() {
            if (registeredPlugin?.name === plugin.name) registeredPlugin = null;
          },
        } satisfies Disposable;
      },
      onMount(cb) { mountCbs.add(cb); },
      onUnmount(cb) { unmountCbs.add(cb); },
    },
    rpc: {
      async call<Req = unknown, Res = unknown>(method: string, args?: Req): Promise<Res> {
        // `@decky/api`'s `call` accepts the args array directly; passing
        // `args` (object or array) lets the Python backend receive the
        // same shape callers send. Decky deserialises both shapes.
        return call<any[], Res>(method, args as any);
      },
    },
    ui: {
      ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
      Dropdown, DropdownItem, Field, Focusable, GamepadButton,
      Menu, MenuItem, Navigation, SliderField, Spinner,
      Tabs, TextField, ToggleField, showContextMenu, showModal,
    },
    routes: {
      register(path, component) {
        try { routerHook?.addRoute?.(path, component); } catch {}
        return {
          dispose() { try { routerHook?.removeRoute?.(path); } catch {} },
        } satisfies Disposable;
      },
    },
    notifications: {
      toast(opts: ToastOptions) {
        try {
          // Decky's `toaster.toast` accepts `{ title, body, duration }`.
          // The contract's `durationMs` maps to that `duration` field;
          // `title` is optional in both shapes.
          (toaster as any)?.toast?.({
            title: opts.title ?? "",
            body: opts.body,
            duration: opts.durationMs,
          });
        } catch {}
      },
    },
    platform: getPlatform() as PlatformApi,
    // Internal hooks the Decky bundle's index.tsx invokes at the
    // corresponding lifecycle moments. NOT part of the HostApi
    // contract — exposed via TypeScript `as any` cast at the call site.
    ...({
      __fireMount: () => { for (const cb of mountCbs) try { cb(); } catch {} },
      __fireUnmount: () => { for (const cb of unmountCbs) try { cb(); } catch {} },
    } as any),
  };
}
