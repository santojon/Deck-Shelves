export function getFrontendLib(): any {
  const g = globalThis as any;
  return g.DFL
    ?? g.deckyFrontendLib
    ?? g.window?.DFL
    ?? g.window?.deckyFrontendLib
    ?? null;
}

const frontendLib = getFrontendLib();

if (!frontendLib) {
  throw new Error('Deck Shelves: host UI surface is not available.');
}

const classProxy = new Proxy({} as Record<string, string>, {
  get: (_target, prop) => String(prop),
});

const passthroughComponent = (props: any) => props?.children ?? null;
const passthroughMenu = (props: any) => props?.children ?? null;
const noop = () => {};

// Field is found by a Steam source string that can break; this fallback still renders label and description.
import { createElement } from 'react';

function buildLabel(label: any, icon: any) {
  if (label == null) return null;
  return createElement(
    'div',
    {
      style: {
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500,
        flex: 1, minWidth: 0,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      },
    },
    icon ?? null,
    label,
  );
}

function buildRow(labelEl: any, label: any, children: any, stackChildren: boolean) {
  if (label == null && children == null) return null;
  return createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: stackChildren ? 'column' : 'row',
        alignItems: stackChildren ? 'stretch' : 'center',
        gap: 8, width: '100%',
      },
    },
    labelEl,
    children != null
      ? createElement('div', {
          // Without a label the children fill the row, or right-aligned items collapse to the left.
          style: {
            display: 'flex', alignItems: 'center',
            flexGrow: label != null ? 0 : 1,
            flexShrink: label != null ? 0 : 1,
            minWidth: 0,
          },
        }, children)
      : null,
  );
}

const fieldFallback = (props: any) => {
  const { label, description, children, icon, bottomSeparator, indentLevel, childrenLayout } = props ?? {};
  const indentPx = (indentLevel || 0) * 16;
  const border = bottomSeparator === 'none' ? 'none' : '1px solid rgba(255,255,255,0.08)';
  const stackChildren = childrenLayout === 'below';
  const labelEl = buildLabel(label, icon);
  const row = buildRow(labelEl, label, children, stackChildren);
  return createElement(
    'div',
    {
      style: {
        display: 'flex', flexDirection: 'column', gap: 4,
        padding: '8px 16px', marginLeft: indentPx, borderBottom: border,
        color: 'inherit', width: '100%', boxSizing: 'border-box',
      },
    },
    row,
    description != null
      ? createElement('div', { style: { fontSize: 12, opacity: 0.85, width: '100%' } }, description)
      : null,
  );
};

export const ButtonItem = frontendLib.ButtonItem ?? passthroughComponent;
export const ConfirmModal = frontendLib.ConfirmModal ?? passthroughComponent;
export const DialogBody = frontendLib.DialogBody ?? passthroughComponent;
export const DialogControlsSection = frontendLib.DialogControlsSection ?? passthroughComponent;
export const DialogButton = frontendLib.DialogButton ?? frontendLib.ButtonItem ?? passthroughComponent;
export const DialogCheckbox = frontendLib.DialogCheckbox ?? passthroughComponent;
export const Dropdown = frontendLib.Dropdown ?? passthroughComponent;
export const DropdownItem = frontendLib.DropdownItem ?? frontendLib.Dropdown ?? passthroughComponent;
export const Field = frontendLib.Field ?? fieldFallback;
export const Focusable = frontendLib.Focusable ?? passthroughComponent;
// Numeric fallback matches the loader's enum for when its global isn't ready yet.
export const GamepadButton = frontendLib.GamepadButton ?? {
  INVALID: 0, OK: 1, CANCEL: 2, SECONDARY: 3, OPTIONS: 4,
  BUMPER_LEFT: 5, BUMPER_RIGHT: 6, TRIGGER_LEFT: 7, TRIGGER_RIGHT: 8,
  DIR_UP: 9, DIR_DOWN: 10, DIR_LEFT: 11, DIR_RIGHT: 12,
  SELECT: 13, START: 14, LSTICK_CLICK: 15, RSTICK_CLICK: 16,
};
export const Menu = frontendLib.Menu ?? passthroughMenu;
export const MenuGroup = frontendLib.MenuGroup ?? passthroughMenu;
export const MenuItem = frontendLib.MenuItem ?? passthroughComponent;
export const MenuSeparator = frontendLib.MenuSeparator ?? passthroughComponent;
export const Navigation = frontendLib.Navigation ?? { Navigate: noop };
export const PanelSection = frontendLib.PanelSection ?? passthroughComponent;
export const PanelSectionRow = frontendLib.PanelSectionRow ?? passthroughComponent;
export const ScrollPanel = frontendLib.ScrollPanel ?? passthroughComponent;
export const ScrollPanelGroup = frontendLib.ScrollPanelGroup ?? passthroughComponent;
export const SidebarNavigation = frontendLib.SidebarNavigation ?? passthroughComponent;
export const SliderField = frontendLib.SliderField ?? passthroughComponent;
export const Spinner = frontendLib.Spinner ?? passthroughComponent;
export const Tabs = frontendLib.Tabs ?? passthroughComponent;
export const TextField = frontendLib.TextField ?? passthroughComponent;
export const ToggleField = frontendLib.ToggleField ?? passthroughComponent;
export const showContextMenu = frontendLib.showContextMenu ?? noop;
export const showModal = frontendLib.showModal ?? noop;
export const afterPatch = frontendLib.afterPatch ?? ((_target: any, _method: any, _cb: any, _options?: any) => noop);
export const findInReactTree = frontendLib.findInReactTree ?? ((_node: any, _cb: any) => null);
export const findInTree = frontendLib.findInTree ?? ((_node: any, _cb: any, _opts?: any) => null);
export const findModuleChild = frontendLib.findModuleChild ?? ((_filter: any) => undefined);
// findModule is preferred: the loader's findModuleChild warns on every call.
const walkWithChildSearch = (filter: (variant: any) => unknown): any => {
  let hit: any;
  frontendLib.findModuleChild?.((variant: any) => {
    if (!filter(variant)) return false;
    hit = variant;
    return true;
  });
  return hit;
};
export const findModule = frontendLib.findModule ?? walkWithChildSearch;
export const findModuleByExport = frontendLib.findModuleByExport ?? ((_filter: any, _minExports?: number) => undefined);
export const fakeRenderComponent = frontendLib.fakeRenderComponent ?? ((_fn: any, _customHooks?: any) => null);
export const staticClasses = frontendLib.staticClasses ?? {};

export const gamepadDialogClasses =
  frontendLib.gamepadDialogClasses ??
  classProxy;

export const quickAccessControlsClasses =
  frontendLib.quickAccessControlsClasses ??
  classProxy;

export const scrollPanelClasses =
  frontendLib.scrollPanelClasses ??
  classProxy;

export const gamepadContextMenuClasses =
  frontendLib.gamepadContextMenuClasses ??
  classProxy;

export const quickAccessMenuClasses =
  frontendLib.quickAccessMenuClasses ??
  classProxy;

export type SingleDropdownOption = {
  data: any;
  label: any;
};

export const SingleDropdownOption = undefined as any;
