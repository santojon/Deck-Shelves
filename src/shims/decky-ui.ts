const decky =
  (globalThis as any).DFL ||
  (globalThis as any).deckyFrontendLib ||
  (globalThis as any).window?.DFL ||
  (globalThis as any).window?.deckyFrontendLib;

if (!decky) {
  throw new Error('Deck Shelves: Decky UI globals are not available.');
}

const classProxy = new Proxy({} as Record<string, string>, {
  get: (_target, prop) => String(prop),
});

const passthroughComponent = (props: any) => props?.children ?? null;
const passthroughMenu = (props: any) => props?.children ?? null;
const noop = () => {};

export const ButtonItem = decky.ButtonItem ?? passthroughComponent;
export const ConfirmModal = decky.ConfirmModal ?? passthroughComponent;
export const DialogButton = decky.DialogButton ?? decky.ButtonItem ?? passthroughComponent;
export const DialogCheckbox = decky.DialogCheckbox ?? passthroughComponent;
export const Dropdown = decky.Dropdown ?? passthroughComponent;
export const DropdownItem = decky.DropdownItem ?? decky.Dropdown ?? passthroughComponent;
export const Field = decky.Field ?? passthroughComponent;
export const Focusable = decky.Focusable ?? passthroughComponent;
export const Menu = decky.Menu ?? passthroughMenu;
export const MenuGroup = decky.MenuGroup ?? passthroughMenu;
export const MenuItem = decky.MenuItem ?? passthroughComponent;
export const Navigation = decky.Navigation ?? { Navigate: noop };
export const PanelSection = decky.PanelSection ?? passthroughComponent;
export const PanelSectionRow = decky.PanelSectionRow ?? passthroughComponent;
export const ReorderableList = decky.ReorderableList ?? passthroughComponent;
export const SidebarNavigation = decky.SidebarNavigation ?? passthroughComponent;
export const SliderField = decky.SliderField ?? passthroughComponent;
export const Spinner = decky.Spinner ?? passthroughComponent;
export const TextField = decky.TextField ?? passthroughComponent;
export const ToggleField = decky.ToggleField ?? passthroughComponent;
export const showContextMenu = decky.showContextMenu ?? noop;
export const showModal = decky.showModal ?? noop;
export const afterPatch = decky.afterPatch ?? ((_target: any, _method: any, _cb: any, _options?: any) => noop);
export const staticClasses = decky.staticClasses ?? {};

export const gamepadDialogClasses =
  decky.gamepadDialogClasses ??
  decky.staticClasses?.gamepadDialogClasses ??
  decky.staticClasses?.GamepadDialog ??
  classProxy;

export const quickAccessControlsClasses =
  decky.quickAccessControlsClasses ??
  decky.staticClasses?.quickAccessControlsClasses ??
  decky.staticClasses?.QuickAccessControls ??
  classProxy;

export const scrollPanelClasses =
  decky.scrollPanelClasses ??
  decky.staticClasses?.scrollPanelClasses ??
  decky.staticClasses?.ScrollPanel ??
  classProxy;

export const gamepadContextMenuClasses =
  decky.gamepadContextMenuClasses ??
  decky.staticClasses?.gamepadContextMenuClasses ??
  decky.staticClasses?.GamepadContextMenu ??
  classProxy;

export const quickAccessMenuClasses =
  decky.quickAccessMenuClasses ??
  decky.staticClasses?.quickAccessMenuClasses ??
  decky.staticClasses?.QuickAccessMenu ??
  classProxy;

export type ReorderableEntry<T> = {
  label: any;
  position: number;
  data?: T;
};

export type SingleDropdownOption = {
  data: any;
  label: string;
};

export const ReorderableEntry = undefined as any;
export const SingleDropdownOption = undefined as any;
