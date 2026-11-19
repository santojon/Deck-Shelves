import { isHomeRoute } from "./mountUtils";
import type { NativeRowFocus } from "../../core/focusRestore";
import { focusNativeRecentsFirstCard, findNativeRecentsEl, nativeRecentsHoldsFocus } from "../../features/sidenav/ShelfSideNav";
import { releaseDetachedNavNodes } from "./navPatches";
import { steamUIStore } from "../../steam/internals";

export const NATIVE_ROW_FOCUS: NativeRowFocus = { holdsFocus: nativeRecentsHoldsFocus, focusFirst: focusNativeRecentsFirstCard };

// While Steam's own row is on screen above our shelves, the first focus stays there.
export function nativeRowOnScreen(doc: Document | null, hideRecents: boolean): boolean {
  return !hideRecents && !!doc && !!findNativeRecentsEl(doc);
}

// Steam's router doesn't use window history; the route commits after the router event.
export function watchHomeLeave(mountEl: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const release = (tries: number) => {
    timer = null;
    if (isHomeRoute() || releaseDetachedNavNodes(mountEl) >= 0 || tries >= 5) return;
    timer = setTimeout(() => release(tries + 1), 200);
  };
  let unlisten: unknown = null;
  try {
    const router = steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
    unlisten = router?.listen?.(() => { if (!timer && !isHomeRoute()) release(0); });
  } catch {}
  return () => {
    if (timer) clearTimeout(timer);
    if (typeof unlisten === "function") unlisten();
  };
}
