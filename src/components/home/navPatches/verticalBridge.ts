import { getPreferredSteamDocument } from "../../../runtime/steamHost";
import { logInfo } from "../../../runtime/logger";
import { focusElement } from "../../../core/focusRestore";
import { DIR_DOWN, DIR_UP, DS_BRIDGE_ATTACHED } from "./constants";

/**
 * D-pad DOWN bridge: when focus is in a sibling of our mount (native top
 * section: recents/friends/novidades) and Steam's native nav doesn't move
 * focus into our shelves on DOWN, take focus on our first card. Runs as a
 * post-nav fallback (rAF after the event) so legitimate native moves still
 * win. Mirrors upward bridge on UP when focus is in the first shelf.
 *
 * We never manipulate the nav tree — purely event-level focus redirection.
 */
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
        // Bug B: only bridge from siblings ABOVE our mount, not below (native tabs)
        if (parentChildren.indexOf(sibling) > mountIdx) return;
        // Only bridge when focus is in the lower portion of its sibling
        // (likely the last row). Use BOTTOM, not TOP — the native recents
        // row may sit mid-sibling when the sibling stacks a search bar +
        // tabs + recents (card top would land in the upper half even
        // though the card itself is the last row), so a top-based check
        // false-bails and the user gets stuck pressing Down with no move.
        const sibRect = sibling.getBoundingClientRect();
        if (beforeRect.bottom < sibRect.top + sibRect.height * 0.5) return;
        redirectTarget = mount.querySelector<HTMLElement>(".ds-card");
      } else if (btn === DIR_UP) {
        if (!mount.contains(before)) return;
        // Only bridge when focus is in the first row of our shelves
        if (beforeRect.top > mountRect.top + 120) return;
        // Aim at the last focusable in the nearest sibling above our mount
        let sib = mount.previousElementSibling as HTMLElement | null;
        while (sib) {
          const cls = (sib.className || "").toString();
          const hasHashed = cls.split(/\s+/).some((t) => t.startsWith("_") && t.length > 5);
          if (hasHashed && sib.offsetHeight > 0) break;
          sib = sib.previousElementSibling as HTMLElement | null;
        }
        if (!sib) return;
        const candidates = Array.from(
          sib.querySelectorAll<HTMLElement>('[role="button"], button, a, [tabindex]:not([tabindex="-1"]), .Focusable'),
        ).filter((el) => el.offsetParent !== null);
        redirectTarget = candidates[candidates.length - 1] ?? null;
      }

      if (!redirectTarget) return;

      // Post-nav check: run on next frame. If native nav already moved focus
      // somewhere reasonable, don't interfere.
      requestAnimationFrame(() => {
        try {
          const after = doc.querySelector<HTMLElement>(".gpfocus");
          // Native nav lost focus entirely (active element is <body>, no
          // .gpfocus anywhere) — bridge into the redirect target so the
          // user isn't stuck pressing d-pad with nothing happening.
          if (!after) { focusElement(redirectTarget!); return; }
          if (after === before) {
            // Focus didn't move — bridge
            focusElement(redirectTarget!);
            return;
          }
          // For DOWN: if focus didn't enter our mount, bridge
          if (btn === DIR_DOWN && !mount.contains(after)) {
            const afterRect = after.getBoundingClientRect();
            if (afterRect.top <= beforeRect.top + 10) {
              focusElement(redirectTarget!);
            }
          }
          // For UP: if focus is still in our mount, bridge
          if (btn === DIR_UP && mount.contains(after)) {
            focusElement(redirectTarget!);
          }
        } catch (e) { logInfo("HOME", "vertical bridge rAF failed", String(e)); }
      });
    } catch (e) { logInfo("HOME", "vertical bridge failed", String(e)); }
  };
  doc.addEventListener("vgp_ondirection", handler, true);
  // `mountEl` intentionally unused here — kept in signature for API parity
  // with the rest of the nav-patches family (caller passes the same
  // reference to every patch fn).
  void mountEl;
}
