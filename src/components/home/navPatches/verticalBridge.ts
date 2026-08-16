import { getPreferredSteamDocument } from "../../../runtime/steamHost";
import { logInfo } from "../../../runtime/logger";
import { focusElement } from "../../../core/focusRestore";
import { DIR_DOWN, DIR_UP, DS_BRIDGE_ATTACHED } from "./constants";

type VBridgeCtx = { mount: HTMLElement; parent: HTMLElement; before: HTMLElement; beforeRect: DOMRect };

function resolveVerticalBridgeContext(doc: Document): VBridgeCtx | null {
  const mount = doc.getElementById("deck-shelves-home-root") as HTMLElement | null;
  if (!mount || !mount.isConnected) return null;
  const parent = mount.parentElement;
  if (!parent) return null;
  const before = doc.querySelector<HTMLElement>(".gpfocus");
  if (!before) return null;
  return { mount, parent, before, beforeRect: before.getBoundingClientRect() };
}

// Bug A: last-shelf DOWN press must not wrap focus back into the shelf
// itself — schedules a check that un-wraps if Steam's own nav looped.
function guardLastShelfWrapAround(mount: HTMLElement, doc: Document, before: HTMLElement, beforeRect: DOMRect): void {
  const lastShelf = mount.querySelector<HTMLElement>(".ds-shelf:last-child");
  if (!lastShelf?.contains(before)) return;
  requestAnimationFrame(() => {
    try {
      const after = doc.querySelector<HTMLElement>(".gpfocus");
      if (!after || mount.contains(after)) return;
      const afterRect = after.getBoundingClientRect();
      if (afterRect.top < beforeRect.top - 20) focusElement(before);
    } catch (e) { logInfo("HOME", "bug-a rAF failed", String(e)); }
  });
}

// DOWN redirect target when focus is currently on a sibling ABOVE the mount
// and has scrolled to that sibling's bottom row — null means "don't bridge"
// (out of range, still mid-sibling, or no matching sibling at all).
function computeDownRedirectTarget(mount: HTMLElement, parent: HTMLElement, before: HTMLElement, beforeRect: DOMRect): HTMLElement | null {
  const parentChildren = Array.from(parent.children);
  const mountIdx = parentChildren.indexOf(mount);
  const sibling = parentChildren.find(
    (c) => c !== mount && (c as Element).contains(before),
  ) as HTMLElement | undefined;
  if (!sibling) return null;
  if (parentChildren.indexOf(sibling) > mountIdx) return null;
  // Only redirect from lower half of sibling (user has scrolled to bottom row).
  const sibRect = sibling.getBoundingClientRect();
  if (sibRect.height > 0 && beforeRect.bottom < sibRect.top + sibRect.height * 0.5) return null;
  return mount.querySelector<HTMLElement>(".ds-card");
}

export function installVerticalFocusBridge(mountEl: HTMLElement): void {
  const doc = getPreferredSteamDocument();
  if (!doc || (doc as any)[DS_BRIDGE_ATTACHED]) return;
  (doc as any)[DS_BRIDGE_ATTACHED] = true;

  const handler = (evt: Event) => {
    try {
      const btn = (evt as CustomEvent<any>).detail?.button;
      if (btn !== DIR_DOWN && btn !== DIR_UP) return;
      const ctx = resolveVerticalBridgeContext(doc);
      if (!ctx) return;
      const { mount, parent, before, beforeRect } = ctx;

      let redirectTarget: HTMLElement | null = null;

      if (btn === DIR_DOWN) {
        if (mount.contains(before)) {
          guardLastShelfWrapAround(mount, doc, before, beforeRect);
          return;
        }
        redirectTarget = computeDownRedirectTarget(mount, parent, before, beforeRect);
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
