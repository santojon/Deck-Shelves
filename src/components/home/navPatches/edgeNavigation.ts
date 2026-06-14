import { getPreferredSteamDocument } from "../../../runtime/steamHost";
import { logInfo } from "../../../runtime/logger";
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DS_EDGE_PATCHED, DS_EDGE_LISTENER } from "./constants";

export function patchShelfEdgeNavigation(mountEl: HTMLElement): void {
  const ctrl = (globalThis as any).FocusNavController
    ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller;
  if (!ctrl) return;

  const context = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
  const trees: any[] = context?.m_rgGamepadNavigationTrees ?? [];
  const mainTree = trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root");
  if (!mainTree) return;

  const root = mainTree.Root || mainTree.m_Root || mainTree;
  const proto = Object.getPrototypeOf(root);

  if (proto && !((proto as any)[DS_EDGE_PATCHED]) && typeof proto.BTryInternalNavigation === "function") {
    const orig = proto.BTryInternalNavigation;
    proto.BTryInternalNavigation = function (direction: number, flag: any) {
      if (direction === DIR_LEFT || direction === DIR_RIGHT) {
        const el = this.Element || this.m_element || this.m_Element;
        if (el && typeof el.className === "string" && el.className.includes("ds-row-scroll")) {
          const throttled: Set<HTMLElement> = (globalThis as any).__ds_scroll_throttle_rows;
          if (throttled?.has(el)) return true;
        }
      }
      // DOWN on the last DS shelf when the native tab bar is hidden (hideHomeTabs=true)
      // wraps focus to the top and visually tilts the view. Consume the event so focus
      // stays put — user can't navigate past the last shelf to a non-existent target.
      if (direction === DIR_DOWN) {
        try {
          const doc: Document | null = getPreferredSteamDocument();
          const mount = doc?.getElementById("deck-shelves-home-root") as HTMLElement | null;
          const focused = (doc?.querySelector(".gpfocus") as HTMLElement | null) ?? null;
          if (mount && focused && mount.contains(focused)) {
            const lastShelf = mount.querySelector<HTMLElement>(".ds-shelf:last-child");
            if (lastShelf && lastShelf.contains(focused)) {
              const tabs = doc?.querySelector('[role="tablist"]') as HTMLElement | null;
              const tabsVisible = !!tabs && tabs.getBoundingClientRect().height > 0;
              if (!tabsVisible) return true;
            }
          }
        } catch (e) { logInfo("HOME", "DOWN wrap guard failed", String(e)); }
      }
      const result = orig.call(this, direction, flag);
      if (!result && (direction === DIR_LEFT || direction === DIR_RIGHT)) {
        const el = this.Element || this.m_element || this.m_Element;
        if (el && typeof el.className === "string" && el.className.includes("ds-row-scroll")) {
          return true;
        }
      }
      return result;
    };
    (proto as any)[DS_EDGE_PATCHED] = true;
  }

  const wrapperEl = mountEl.querySelector(".deck-shelves-root") as HTMLElement | null;
  if (wrapperEl && !(wrapperEl as any)[DS_EDGE_LISTENER]) {
    (wrapperEl as any)[DS_EDGE_LISTENER] = true;
    wrapperEl.addEventListener("vgp_ondirection", (evt: Event) => {
      const btn = (evt as CustomEvent<any>).detail?.button;
      if (btn === DIR_LEFT || btn === DIR_RIGHT) {
        evt.stopPropagation();
      }
    });
  }
}
