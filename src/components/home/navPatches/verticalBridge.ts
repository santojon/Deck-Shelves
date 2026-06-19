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
        if (sibling) {
          // DOM order ≠ visual order. Steam's home stacks several siblings
          // around our mount — some (e.g. a hidden Friends container) are
          // declared AFTER the mount in the parent's children list yet
          // render at y=0 with height=0. Compare rects, not indices:
          // when the sibling is visually below the mount (its top is below
          // the mount's top), it's a real tabs-style sibling and we don't
          // bridge. When it's visually above (e.g. hidden recents shell,
          // Friends shell, search), it IS a candidate even if its DOM
          // index is greater than ours.
          const sibRect = sibling.getBoundingClientRect();
          const siblingVisuallyBelow = sibRect.top > mountRect.top + 4 && sibRect.height > 0;
          if (siblingVisuallyBelow) return;
          // For non-zero-height siblings that DO sit above the mount, keep
          // the "focus must be in lower half" guard — it protects against
          // bridging from the search bar before the user has scrolled
          // through the row. Zero-height containers (hidden recents /
          // Friends shells) skip the half-check since there is no row to
          // walk through inside them.
          if (sibRect.height > 0 && beforeRect.bottom < sibRect.top + sibRect.height * 0.5) return;
        } else if (beforeRect.bottom > mountRect.top + 4) {
          // The focused element isn't inside any of mount's direct siblings
          // (typical when the user navigated up to the system search bar in
          // `#header` — that lives several ancestors above our parent). If
          // it's NOT visually above the mount either, this isn't a case we
          // can interpret — bail and let native nav handle it.
          return;
        }
        // Above-mount focus (no in-tree sibling match OR zero-height
        // sibling shell): redirect DOWN into our first card so the user
        // can't get trapped above the mount.
        redirectTarget = mount.querySelector<HTMLElement>(".ds-card");
      } else if (btn === DIR_UP) {
        if (!mount.contains(before)) return;
        // Only bridge when focus is in the first row of our shelves
        if (beforeRect.top > mountRect.top + 120) return;
        // Steam's native nav routes UP through every mount-parent sibling
        // first, even zero-height shells (hidden recents / news / Friends
        // containers) — each one absorbs one UP press before letting focus
        // continue, so the user has to press UP several times to actually
        // reach the visible search bar.
        //
        // Shortcut: find the first VISIBLE focusable anywhere in the
        // document whose rect sits above the mount. That's almost always
        // the system search input in `#header`. Pick the leftmost one in
        // the topmost row so D-pad muscle memory (left to right) matches
        // what users expect. The Steam navigation tree is patched to
        // accept this jump (focusElement() calls into it).
        try {
          const all = Array.from(
            (doc as Document).querySelectorAll<HTMLElement>(
              '[role="button"], button, input, a, [tabindex]:not([tabindex="-1"]), .Focusable',
            ),
          );
          const above = all
            .filter((el) => {
              if (el === before || el.contains(before) || mount.contains(el)) return false;
              if (!el.offsetParent) return false;
              const r = el.getBoundingClientRect();
              return r.width > 4 && r.height > 4 && r.bottom <= mountRect.top + 4;
            })
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { el, top: r.top, left: r.left };
            });
          if (above.length === 0) return;
          // Topmost row first; within that, leftmost.
          above.sort((a, b) => (a.top - b.top) || (a.left - b.left));
          redirectTarget = above[0].el;
        } catch { return; }
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
            // No vertical movement, or focus stayed entirely above the
            // mount (native nav hopped between above-mount siblings
            // instead of descending). Both are traps — bridge into the
            // mount so the user isn't stuck above.
            if (afterRect.top <= beforeRect.top + 10 || afterRect.bottom <= mountRect.top + 4) {
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
