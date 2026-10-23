import { getPreferredSteamDocument } from "../../../runtime/steamHost";
import { logInfo } from "../../../runtime/logger";
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DS_EDGE_PATCHED, DS_EDGE_LISTENER } from "./constants";
import { findMainNavRoot, navNodeElement, resolveFocusNavController } from "./focusNav";

const isHorizontal = (direction: number): boolean => direction === DIR_LEFT || direction === DIR_RIGHT;

function isRowScrollNode(node: any): boolean {
  const el = navNodeElement(node);
  return !!el && typeof el.className === "string" && el.className.includes("ds-row-scroll");
}

function isThrottledRow(node: any): boolean {
  const throttled: Set<HTMLElement> | undefined = (globalThis as any).__ds_scroll_throttle_rows;
  const el = navNodeElement(node);
  return !!el && !!throttled?.has(el);
}

function homeTabsVisible(doc: Document): boolean {
  const tabs = doc.querySelector('[role="tablist"]') as HTMLElement | null;
  return !!tabs && tabs.getBoundingClientRect().height > 0;
}

/* The last *.ds-shelf* directly — :last-child fails when Steam re-injects an
   empty-state div as the trailing sibling of our shelves inside
   .deck-shelves-root, leaving no shelf as the literal last child. */
function focusInLastShelf(mount: HTMLElement, focused: HTMLElement): boolean {
  const shelves = mount.querySelectorAll<HTMLElement>(".ds-shelf");
  const lastShelf = shelves[shelves.length - 1];
  return !!lastShelf && lastShelf.contains(focused);
}

/* DOWN on the last DS shelf when the native tab bar is hidden (hideHomeTabs)
   wraps focus to the top and visually tilts the view. Consume the event so
   focus stays put — there is no target past the last shelf. */
function shouldSwallowDownAtLastShelf(): boolean {
  try {
    const doc = getPreferredSteamDocument();
    const mount = doc?.getElementById("deck-shelves-home-root") as HTMLElement | null;
    const focused = doc?.querySelector(".gpfocus") as HTMLElement | null;
    if (!doc || !mount || !focused || !mount.contains(focused)) return false;
    return focusInLastShelf(mount, focused) && !homeTabsVisible(doc);
  } catch (e) {
    logInfo("HOME", "DOWN wrap guard failed", String(e));
    return false;
  }
}

function installRowDirectionStopper(mountEl: HTMLElement): void {
  const wrapperEl = mountEl.querySelector(".deck-shelves-root") as HTMLElement | null;
  if (!wrapperEl || (wrapperEl as any)[DS_EDGE_LISTENER]) return;
  (wrapperEl as any)[DS_EDGE_LISTENER] = true;
  wrapperEl.addEventListener("vgp_ondirection", (evt: Event) => {
    const btn = (evt as CustomEvent<any>).detail?.button;
    if (isHorizontal(btn)) evt.stopPropagation();
  });
}

export function patchShelfEdgeNavigation(mountEl: HTMLElement): void {
  const ctrl = resolveFocusNavController();
  if (!ctrl) return;
  const root = findMainNavRoot(ctrl.m_ActiveContext || ctrl.m_LastActiveContext);
  if (!root) return;
  const proto = Object.getPrototypeOf(root);

  if (proto && !((proto as any)[DS_EDGE_PATCHED]) && typeof proto.BTryInternalNavigation === "function") {
    const orig = proto.BTryInternalNavigation;
    proto.BTryInternalNavigation = function (direction: number, flag: any) {
      if (isHorizontal(direction) && isRowScrollNode(this) && isThrottledRow(this)) return true;
      if (direction === DIR_DOWN && shouldSwallowDownAtLastShelf()) return true;
      const result = orig.call(this, direction, flag);
      if (!result && isHorizontal(direction) && isRowScrollNode(this)) return true;
      return result;
    };
    (proto as any)[DS_EDGE_PATCHED] = true;
  }

  installRowDirectionStopper(mountEl);
}
