// A neutral (non-loader) host injects its runtime as `__SHELVES_HOST__`,
// exposing the Steam-native components it located as `host.ui` — the
// sole-host fallback (no loader present to publish `DFL`/`deckyFrontendLib`).
function getShelvesHost(): any {
  const g = globalThis as any;
  return g.window?.__SHELVES_HOST__ ?? g.__SHELVES_HOST__ ?? null;
}

/* THE single host-parametric resolver for the whole UI surface: a plugin loader
   publishes it as a global (`DFL`/`deckyFrontendLib`); a neutral host exposes the
   same surface on `__SHELVES_HOST__.ui`. Call sites that need the raw lib object
   go through THIS — don't re-derive the chain inline. Lazy (a function, not a
   const) so late-injected sole-host UI resolves too. */
export function getFrontendLib(): any {
  const g = globalThis as any;
  return g.DFL
    ?? g.deckyFrontendLib
    ?? g.window?.DFL
    ?? g.window?.deckyFrontendLib
    ?? getShelvesHost()?.ui
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

// Decky resolves `Field` via `findModuleExport` against a Steam-internal
// string ("shift-children-below"). When Steam refactors that source, the
/* match breaks and `frontendLib.Field` becomes undefined. The previous fallback
   (`passthroughComponent`) silently dropped `label` and `description`,
   hiding shelf-list titles and the EditShelfModal title input. This
   fallback renders both visibly with the standard Decky row layout so
   the plugin remains usable while Decky catches up. */
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
          /* When there's no label the children container should expand to
             fill the row — otherwise an inner Focusable with `width: 100%`
             collapses to the children's natural width and right-aligned items
             (justify-content: space-between) end up flush against the left
             buttons. */
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
      /* Horizontal padding matches Decky's native Field (~16 px each
         side) so labels and right-aligned children don't touch the QAM
         scope edges. Without it the shelf-list rows sat flush with the
         Quick Access panel borders. */
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
/* Runtime enum that Decky exposes via FooterLegend. Required for
   gamepad-button comparison in the local ReorderableList. Fallback keeps
   the numeric values stable (see @host/ui FooterLegend.d.ts) so any
   destructuring still works when Decky's global hasn't initialised yet. */
export const GamepadButton = frontendLib.GamepadButton ?? {
  INVALID: 0, OK: 1, CANCEL: 2, SECONDARY: 3, OPTIONS: 4,
  BUMPER_LEFT: 5, BUMPER_RIGHT: 6, TRIGGER_LEFT: 7, TRIGGER_RIGHT: 8,
  DIR_UP: 9, DIR_DOWN: 10, DIR_LEFT: 11, DIR_RIGHT: 12,
  SELECT: 13, START: 14, LSTICK_CLICK: 15, RSTICK_CLICK: 16,
};
export const Menu = frontendLib.Menu ?? passthroughMenu;
export const MenuGroup = frontendLib.MenuGroup ?? passthroughMenu;
export const MenuItem = frontendLib.MenuItem ?? passthroughComponent;
export const Navigation = frontendLib.Navigation ?? { Navigate: noop };
export const PanelSection = frontendLib.PanelSection ?? passthroughComponent;
export const PanelSectionRow = frontendLib.PanelSectionRow ?? passthroughComponent;
export const ReorderableList = frontendLib.ReorderableList ?? passthroughComponent;
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
export const findModuleByExport = frontendLib.findModuleByExport ?? ((_filter: any, _minExports?: number) => undefined);
export const fakeRenderComponent = frontendLib.fakeRenderComponent ?? ((_fn: any, _customHooks?: any) => null);
export const staticClasses = frontendLib.staticClasses ?? {};

export const gamepadDialogClasses =
  frontendLib.gamepadDialogClasses ??
  frontendLib.staticClasses?.gamepadDialogClasses ??
  frontendLib.staticClasses?.GamepadDialog ??
  classProxy;

export const quickAccessControlsClasses =
  frontendLib.quickAccessControlsClasses ??
  frontendLib.staticClasses?.quickAccessControlsClasses ??
  frontendLib.staticClasses?.QuickAccessControls ??
  classProxy;

export const scrollPanelClasses =
  frontendLib.scrollPanelClasses ??
  frontendLib.staticClasses?.scrollPanelClasses ??
  frontendLib.staticClasses?.ScrollPanel ??
  classProxy;

export const gamepadContextMenuClasses =
  frontendLib.gamepadContextMenuClasses ??
  frontendLib.staticClasses?.gamepadContextMenuClasses ??
  frontendLib.staticClasses?.GamepadContextMenu ??
  classProxy;

export const quickAccessMenuClasses =
  frontendLib.quickAccessMenuClasses ??
  frontendLib.staticClasses?.quickAccessMenuClasses ??
  frontendLib.staticClasses?.QuickAccessMenu ??
  classProxy;

export type ReorderableEntry<T> = {
  label: any;
  position: number;
  data?: T;
};

export type SingleDropdownOption = {
  data: any;
  label: any; // string or a React node — Steam dropdowns accept both
};

export const ReorderableEntry = undefined as any;
export const SingleDropdownOption = undefined as any;
