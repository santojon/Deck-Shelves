// @decky/ui stub for the vitest Node environment.
// The real package's webpack init expects `window.webpackChunksteamui`
// which doesn't exist outside the browser. Tests that transitively
// import @decky/ui (via runtime/host/decky → re-exports) crash the
// whole file at module-load. This stub exposes the same shape with
// no-op implementations so the tests can load without touching the
// host's webpack machinery.
import { createElement, type ComponentType } from 'react';

const passthrough: ComponentType<any> = (props: any) => props?.children ?? null;
const noop = () => {};
const classProxy = new Proxy({} as Record<string, string>, { get: (_t, p) => String(p) });

export const ConfirmModal = passthrough;
export const DialogBody = passthrough;
export const DialogButton = ((props: any) => createElement('button', props, props?.children)) as ComponentType<any>;
export const DialogControlsSection = passthrough;
export const Dropdown = passthrough;
export const DropdownItem = passthrough;
export const Field = passthrough;
export const Focusable = passthrough;
export const Menu = passthrough;
export const MenuGroup = passthrough;
export const MenuItem = passthrough;
export const Navigation: any = { Navigate: noop, NavigateBack: noop };
export const PanelSection = passthrough;
export const PanelSectionRow = passthrough;
export const SliderField = passthrough;
export const Spinner = passthrough;
export const Tabs = passthrough;
export const TextField = passthrough;
export const ToggleField = passthrough;
export const GamepadButton = { SELECT: 0, START: 1, A: 2, B: 3, X: 4, Y: 5 } as const;

export const showContextMenu = noop;
export const showModal = noop;
export const afterPatch = noop as any;
export const fakeRenderComponent = (() => null) as any;
export const findInReactTree = (() => null) as any;
export const findInTree = (() => null) as any;
export const findModuleByExport = (() => null) as any;
export const findModuleChild = (() => null) as any;
export const gamepadDialogClasses: any = classProxy;
export const quickAccessControlsClasses: any = classProxy;
export const quickAccessMenuClasses: any = classProxy;
export type SingleDropdownOption = { data?: any; label?: string };
