import { getPreferredSteamDocument } from "../../../runtime/steamHost";
import { logInfo } from "../../../runtime/logger";
import { focusElement } from "../../../core/focusRestore";
import { DIR_DOWN, DIR_UP, DS_BRIDGE_ATTACHED } from "./constants";
import { registerDisposer } from "../../../runtime/runtimeDisposer";

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

function guardLastShelfWrapAround(mount: HTMLElement, doc: Document, before: HTMLElement, beforeRect: DOMRect): void {
  // :last-child fails when Steam appends an empty-state div after the shelves.
  const shelves = mount.querySelectorAll<HTMLElement>(".ds-shelf");
  const lastShelf = shelves[shelves.length - 1] ?? null;
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

function computeDownRedirectTarget(mount: HTMLElement, parent: HTMLElement, before: HTMLElement, beforeRect: DOMRect): HTMLElement | null {
  const parentChildren = Array.from(parent.children);
  const mountIdx = parentChildren.indexOf(mount);
  const sibling = parentChildren.find(
    (c) => c !== mount && (c as Element).contains(before),
  ) as HTMLElement | undefined;
  if (!sibling) return null;
  if (parentChildren.indexOf(sibling) > mountIdx) return null;
  const sibRect = sibling.getBoundingClientRect();
  if (sibRect.height > 0 && beforeRect.bottom < sibRect.top + sibRect.height * 0.5) return null;
  return mount.querySelector<HTMLElement>(".ds-card");
}

function skippedOverMount(mount: HTMLElement, parent: HTMLElement, before: HTMLElement, after: HTMLElement): boolean {
  if (mount.contains(before) || mount.contains(after)) return false;
  const kids = Array.from(parent.children);
  const mountIdx = kids.indexOf(mount);
  const beforeIdx = kids.findIndex((c) => c.contains(before));
  const afterIdx = kids.findIndex((c) => c.contains(after));
  return beforeIdx >= 0 && beforeIdx < mountIdx && afterIdx > mountIdx;
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
        // Focusing BigPicture cards from SharedJSContext uses the wrong nav controller and flickers, so UP stays native.
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
            if (afterInvisible || afterRect.top <= beforeRect.top + 10 || skippedOverMount(mount, parent, before, after)) {
              focusElement(redirectTarget!);
            }
          }
        } catch (e) { logInfo("HOME", "vertical bridge rAF failed", String(e)); }
      });
    } catch (e) { logInfo("HOME", "vertical bridge failed", String(e)); }
  };
  doc.addEventListener("vgp_ondirection", handler, true);
  registerDisposer(() => {
    try { doc.removeEventListener("vgp_ondirection", handler, true); delete (doc as any)[DS_BRIDGE_ATTACHED]; } catch {}
  });
  void mountEl;
}
