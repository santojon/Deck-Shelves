// The only place `@decky/*` imports may be added.
import { call, toaster, openFilePicker } from "@host/api";
export { call, toaster, openFilePicker };
import {
  ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
  Dropdown, DropdownItem, Field, Focusable, GamepadButton,
  Menu, MenuGroup, MenuItem, MenuSeparator, Navigation, PanelSection, PanelSectionRow,
  SliderField, Spinner, Tabs, TextField, ToggleField, showContextMenu, showModal,
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModule,
  findModuleByExport,
  findModuleChild,
  gamepadDialogClasses,
  quickAccessControlsClasses,
  quickAccessMenuClasses,
  getFrontendLib,
  type SingleDropdownOption,
} from "@host/ui";

export {
  ConfirmModal, DialogBody, DialogButton, DialogControlsSection,
  Dropdown, DropdownItem, Field, Focusable, GamepadButton,
  Menu, MenuGroup, MenuItem, MenuSeparator, Navigation, PanelSection, PanelSectionRow,
  SliderField, Spinner, Tabs, TextField, ToggleField, showContextMenu, showModal,
  afterPatch,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModule,
  findModuleByExport,
  findModuleChild,
  gamepadDialogClasses,
  quickAccessControlsClasses,
  quickAccessMenuClasses,
  getFrontendLib,
};
export type { SingleDropdownOption };
import { HOST_API_VERSION, type Disposable, type HostApi, type PluginDescriptor, type ToastOptions } from "./contract";
import { getPlatform } from "../platformContext";
import type { PlatformApi } from "../platform";
import { logInfo } from "../logger";

export function createDeckyHostApi(routerHook: any): HostApi {
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
          (toaster as any)?.toast?.({
            title: opts.title ?? "",
            body: opts.body,
            duration: opts.durationMs,
          });
        } catch {}
      },
    },
    platform: getPlatform() as PlatformApi,
    ...({
      __fireMount: () => { for (const cb of mountCbs) try { cb(); } catch {} },
      __fireUnmount: () => { for (const cb of unmountCbs) try { cb(); } catch {} },
    } as any),
  };
}
