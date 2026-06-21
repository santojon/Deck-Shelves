import { getPreferredSteamDocument } from "../../../runtime/steamHost";
import { logInfo } from "../../../runtime/logger";
import { focusElement } from "../../../core/focusRestore";
import { DIR_DOWN, DIR_UP, DS_BRIDGE_ATTACHED } from "./constants";

export function installVerticalFocusBridge(mountEl: HTMLElement): void {
  const doc = getPreferredSteamDocument();
  if (!doc || (doc as any)[DS_BRIDGE_ATTACHED]) return;
  (doc as any)[DS_BRIDGE_ATTACHED] = true;

  const handler = (evt: Event) => {
    try {
      const btn = (evt as CustomEvent<any>).detail?.button;
      if (btn !== DIR_DOWN && btn !== DIR_UP) return;
      const mount = doc.getElementById("deck-shelves-home-root") as HTMLElement | null;
      if (!mount || !mount.isConnected) return;
      const parent = mount.parentElement;
      if (!parent) return;
      const before = doc.querySelector<HTMLElement>(".gpfocus");
      if (!before) return;
      const beforeRect = before.getBoundingClientRect();
      const mountRect = mount.getBoundingClientRect();

      let redirectTarget: HTMLElement | null = null;

      if (btn === DIR_DOWN) {
        const parentChildren = Array.from(parent.children);
        const mountIdx = parentChildren.indexOf(mount);

        if (mount.contains(before)) {
          // Bug A: prevent wrap-around on last shelf.
          const lastShelf = mount.querySelector<HTMLElement>(".ds-shelf:last-child");
          if (lastShelf?.contains(before)) {
            requestAnimationFrame(() => {
              try {
                const after = doc.querySelector<HTMLElement>(".gpfocus");
                if (!after || mount.contains(after)) return;
                const afterRect = after.getBoundingClientRect();
                if (afterRect.top < beforeRect.top - 20) focusElement(before);
              } catch (e) { logInfo("HOME", "bug-a rAF failed", String(e)); }
            });
          }
          return;
        }

        const sibling = parentChildren.find(
          (c) => c !== mount && (c as Element).contains(before),
        ) as HTMLElement | undefined;
        if (!sibling) return;
        if (parentChildren.indexOf(sibling) > mountIdx) return;
        // Only redirect from lower half of sibling (user has scrolled to bottom row).
        const sibRect = sibling.getBoundingClientRect();
        if (sibRect.height > 0 && beforeRect.bottom < sibRect.top + sibRect.height * 0.5) return;
        redirectTarget = mount.querySelector<HTMLElement>(".ds-card");

      } else if (btn === DIR_UP) {
        // UP handled by Steam's native NavTree (native container is a Panel Focusable
        // sibling). focusElement on BP-native cards from SJC uses the wrong
        // NavController and causes flicker — don't bridge UP.
        return;
      }

      if (!redirectTarget) return;

      requestAnimationFrame(() => {
        try {
          const after = doc.querySelector<HTMLElement>(".gpfocus");
          if (!after) { focusElement(redirectTarget!); return; }
          if (after === before) { focusElement(redirectTarget!); return; }
          if (btn === DIR_DOWN && !mount.contains(after)) {
            const afterRect = after.getBoundingClientRect();
            const afterInvisible = !after.offsetParent || afterRect.height < 4;
            if (afterInvisible || afterRect.top <= beforeRect.top + 10) {
              focusElement(redirectTarget!);
            }
          }
        } catch (e) { logInfo("HOME", "vertical bridge rAF failed", String(e)); }
      });
    } catch (e) { logInfo("HOME", "vertical bridge failed", String(e)); }
  };
  doc.addEventListener("vgp_ondirection", handler, true);
  void mountEl;
}
