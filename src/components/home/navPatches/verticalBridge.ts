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
          // Bug A: block Steam's wrap-around on last shelf, but let downward nav (tabs) through.
          const lastShelf = mount.querySelector<HTMLElement>(".ds-shelf:last-child");
          if (lastShelf?.contains(before)) {
            requestAnimationFrame(() => {
              try {
                const after = doc.querySelector<HTMLElement>(".gpfocus");
                if (!after || mount.contains(after)) return;
                // Only intercept if focus wrapped UP — ignore downward nav to tabs.
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
        // Only bridge from siblings ABOVE our mount, not below (native tabs)
        if (parentChildren.indexOf(sibling) > mountIdx) return;
        // Only bridge when focus is in the lower portion of its sibling.
        // Use bottom-of-card, not top: native recents may sit mid-sibling
        // (e.g. search-bar + tabs + recents stack), so a top-based check
        // false-bails and the user gets stuck pressing Down with no effect.
        const sibRect = sibling.getBoundingClientRect();
        if (sibRect.height > 0 && beforeRect.bottom < sibRect.top + sibRect.height * 0.5) return;
        redirectTarget = mount.querySelector<HTMLElement>(".ds-card");

      } else if (btn === DIR_UP) {
        if (!mount.contains(before)) return;
        // Only bridge when focus is in the first DS shelf.
        // Using firstShelf.contains() is reliable regardless of scroll
        // position (the old 120px rect-based guard failed when native
        // recents pushed the first shelf 200px+ below mount top).
        const firstShelf = mount.querySelector<HTMLElement>(".ds-shelf");
        if (!firstShelf || !firstShelf.contains(before)) return;
        // Aim at the last visible focusable in the nearest above sibling.
        // When native is visible this resolves to the bottommost native card;
        // when native is hidden the sibling has 0 height and sib stays null
        // so the bridge returns early (Steam handles UP through zero-height shells).
        let sib = mount.previousElementSibling as HTMLElement | null;
        while (sib) {
          const cls = (sib.className || "").toString();
          const hasHashed = cls.split(/\s+/).some((t) => t.startsWith("_") && t.length > 5);
          if (hasHashed && sib.offsetHeight > 0) break;
          sib = sib.previousElementSibling as HTMLElement | null;
        }
        if (!sib) return;
        const candidates = Array.from(
          sib.querySelectorAll<HTMLElement>('[role="button"], [role="link"], button, a, [tabindex]:not([tabindex="-1"]), .Focusable'),
        ).filter((el) => el.offsetParent !== null);
        redirectTarget = candidates[candidates.length - 1] ?? null;
      }

      if (!redirectTarget) return;

      // Post-nav check: run on next frame. If native nav already moved focus
      // somewhere reasonable, don't interfere.
      requestAnimationFrame(() => {
        try {
          const after = doc.querySelector<HTMLElement>(".gpfocus");
          if (!after) { focusElement(redirectTarget!); return; }
          if (after === before) { focusElement(redirectTarget!); return; }

          // For DOWN: redirect if focus didn't enter our mount AND either:
          //   a) focus didn't move vertically (stuck in same area), or
          //   b) after is invisible/zero-height (zero-height hidden shell).
          // Don't redirect when Steam correctly moved to a visible element
          // (e.g. native card at top=267 after DOWN from search at top=30).
          if (btn === DIR_DOWN && !mount.contains(after)) {
            const afterRect = after.getBoundingClientRect();
            const afterInvisible = !after.offsetParent || afterRect.height < 4;
            if (afterInvisible || afterRect.top <= beforeRect.top + 10) {
              focusElement(redirectTarget!);
            }
          }

          // For UP: redirect if focus stayed in our mount (Steam didn't move it out)
          // OR if it landed on a zero-height/invisible hidden shell above mount.
          if (btn === DIR_UP) {
            if (mount.contains(after)) {
              focusElement(redirectTarget!);
            } else {
              const afterRect = after.getBoundingClientRect();
              const afterInvisible = !after.offsetParent || afterRect.height < 4;
              if (afterInvisible) focusElement(redirectTarget!);
            }
          }
        } catch (e) { logInfo("HOME", "vertical bridge rAF failed", String(e)); }
      });
    } catch (e) { logInfo("HOME", "vertical bridge failed", String(e)); }
  };
  doc.addEventListener("vgp_ondirection", handler, true);
  void mountEl;
}
