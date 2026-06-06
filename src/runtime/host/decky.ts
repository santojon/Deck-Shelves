// DeckyHostApi — the ONLY place `@decky/*` imports may be added.
// Re-exports every primitive / helper / class-name binding DS source
// files need, so the rest of the codebase imports from this adapter
// (`runtime/host/decky`) instead of reaching into `@decky/ui`
// directly. Adding a new symbol? Add it here once and update callers.
import { call, toaster, openFilePicker } from "@decky/api";
// Re-export the @decky/api primitives DS source files need so the
// adapter is the single import point for both `@decky/ui` and
// `@decky/api`. Adding a new symbol? Add it here once and update
// callers — the only file that should keep an `@decky/api` import is
// `index.tsx` for `definePlugin` (the bundle entry point).
export { call, toaster, openFilePicker };
import {
  ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
  Dropdown, DropdownItem, Field, Focusable, GamepadButton,
  Menu, MenuGroup, MenuItem, Navigation, PanelSection, PanelSectionRow,
  SliderField, Spinner, Tabs, TextField, ToggleField, showContextMenu, showModal,
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  findModuleChild,
  gamepadDialogClasses,
  quickAccessControlsClasses,
  quickAccessMenuClasses,
  type SingleDropdownOption,
} from "@decky/ui";

export {
  ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
  Dropdown, DropdownItem, Field, Focusable, GamepadButton,
  Menu, MenuGroup, MenuItem, Navigation, PanelSection, PanelSectionRow,
  SliderField, Spinner, Tabs, TextField, ToggleField, showContextMenu, showModal,
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  findModuleChild,
  gamepadDialogClasses,
  quickAccessControlsClasses,
  quickAccessMenuClasses,
};
export type { SingleDropdownOption };
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
