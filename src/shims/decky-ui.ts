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

// Decky resolves `Field` via `findModuleExport` against a Steam-internal
// string ("shift-children-below"). When Steam refactors that source, the
/* match breaks and `decky.Field` becomes undefined. The previous fallback
   (`passthroughComponent`) silently dropped `label` and `description`,
   hiding shelf-list titles and the EditShelfModal title input. This
   fallback renders both visibly with the standard Decky row layout so
   the plugin remains usable while Decky catches up. */
import { createElement } from 'react';
const fieldFallback = (props: any) => {
  const { label, description, children, icon, bottomSeparator, indentLevel, childrenLayout } = props ?? {};
  const indentPx = (indentLevel || 0) * 16;
  const border = bottomSeparator === 'none' ? 'none' : '1px solid rgba(255,255,255,0.08)';
  const stackChildren = childrenLayout === 'below';
  const labelEl = label != null
    ? createElement(
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
      )
    : null;
  const row = (label != null || children != null)
    ? createElement(
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
              /* When there's no label the children container should
                 expand to fill the row — otherwise an inner Focusable
                 with `width: 100%` collapses to the children's natural
                 width and right-aligned items (justify-content:
                 space-between) end up flush against the left buttons. */
              style: {
                display: 'flex', alignItems: 'center',
                flexGrow: label != null ? 0 : 1,
                flexShrink: label != null ? 0 : 1,
                minWidth: 0,
              },
            }, children)
          : null,
      )
    : null;
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

export const ButtonItem = decky.ButtonItem ?? passthroughComponent;
export const ConfirmModal = decky.ConfirmModal ?? passthroughComponent;
export const DialogBody = decky.DialogBody ?? passthroughComponent;
export const DialogControlsSection = decky.DialogControlsSection ?? passthroughComponent;
export const DialogButton = decky.DialogButton ?? decky.ButtonItem ?? passthroughComponent;
export const DialogCheckbox = decky.DialogCheckbox ?? passthroughComponent;
export const Dropdown = decky.Dropdown ?? passthroughComponent;
export const DropdownItem = decky.DropdownItem ?? decky.Dropdown ?? passthroughComponent;
export const Field = decky.Field ?? fieldFallback;
export const Focusable = decky.Focusable ?? passthroughComponent;
/* Runtime enum that Decky exposes via FooterLegend. Required for
   gamepad-button comparison in the local ReorderableList. Fallback keeps
   the numeric values stable (see @decky/ui FooterLegend.d.ts) so any
   destructuring still works when Decky's global hasn't initialised yet. */
export const GamepadButton = decky.GamepadButton ?? {
  INVALID: 0, OK: 1, CANCEL: 2, SECONDARY: 3, OPTIONS: 4,
  BUMPER_LEFT: 5, BUMPER_RIGHT: 6, TRIGGER_LEFT: 7, TRIGGER_RIGHT: 8,
  DIR_UP: 9, DIR_DOWN: 10, DIR_LEFT: 11, DIR_RIGHT: 12,
  SELECT: 13, START: 14, LSTICK_CLICK: 15, RSTICK_CLICK: 16,
};
export const Menu = decky.Menu ?? passthroughMenu;
export const MenuGroup = decky.MenuGroup ?? passthroughMenu;
export const MenuItem = decky.MenuItem ?? passthroughComponent;
export const Navigation = decky.Navigation ?? { Navigate: noop };
export const PanelSection = decky.PanelSection ?? passthroughComponent;
export const PanelSectionRow = decky.PanelSectionRow ?? passthroughComponent;
export const ReorderableList = decky.ReorderableList ?? passthroughComponent;
export const ScrollPanel = decky.ScrollPanel ?? passthroughComponent;
export const ScrollPanelGroup = decky.ScrollPanelGroup ?? passthroughComponent;
export const SidebarNavigation = decky.SidebarNavigation ?? passthroughComponent;
export const SliderField = decky.SliderField ?? passthroughComponent;
export const Spinner = decky.Spinner ?? passthroughComponent;
export const Tabs = decky.Tabs ?? passthroughComponent;
export const TextField = decky.TextField ?? passthroughComponent;
export const ToggleField = decky.ToggleField ?? passthroughComponent;
export const showContextMenu = decky.showContextMenu ?? noop;
export const showModal = decky.showModal ?? noop;
export const afterPatch = decky.afterPatch ?? ((_target: any, _method: any, _cb: any, _options?: any) => noop);
export const findInReactTree = decky.findInReactTree ?? ((_node: any, _cb: any) => null);
export const findInTree = decky.findInTree ?? ((_node: any, _cb: any, _opts?: any) => null);
export const findModuleChild = decky.findModuleChild ?? ((_filter: any) => undefined);
export const findModuleByExport = decky.findModuleByExport ?? ((_filter: any, _minExports?: number) => undefined);
export const fakeRenderComponent = decky.fakeRenderComponent ?? ((_fn: any, _customHooks?: any) => null);
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
