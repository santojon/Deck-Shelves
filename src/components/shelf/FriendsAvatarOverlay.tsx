import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getPreferredSteamDocument, getAllSteamDocuments } from "../../runtime/steamHost";
import { subscribeOverlayActive } from "./overlayState";

function findHomeRootDoc(): { doc: Document; root: HTMLElement } | null {
  for (const d of [getPreferredSteamDocument(), ...getAllSteamDocuments()]) {
    try {
      const root = d?.getElementById?.("deck-shelves-home-root");
      if (root) return { doc: d, root };
    } catch {}
  }
  return null;
}

type AvatarItem = { key: string; left: number; top: number; size: number; avatars: string[] };

/* Single global overlay drawing the native "friend in this game" avatar(s) for
   every friend card, portaled to <body> so they sit above the focus ring and
   adjacent cards (an in-card element is trapped in the focused card's stacking
   context + clipped by the row scroller). Each tracks its card's live
   `.ds-card-art` rect, so size + overhang scale with focus like native. */
export function FriendsAvatarOverlay() {
  const [items, setItems] = useState<AvatarItem[]>([]);
  const [obscured, setObscured] = useState(false);
  const [hostKey, setHostKey] = useState(0);
  useEffect(() => {
    const located = findHomeRootDoc();
    if (!located) {
      const retry = setTimeout(() => setHostKey((k) => k + 1), 150);
      return () => clearTimeout(retry);
    }
    const { doc, root } = located;
    const win = doc.defaultView ?? window;
    // Hide while the home is covered (QAM / a modal) — same as the new/discount
    // badges, which vanish because focus leaves the cards. We track all cards
    // regardless of focus, so detect the obscuring overlay explicitly.
    const unsubOverlay = subscribeOverlayActive(doc, setObscured);
    let raf: number | null = null;
    let lastSig = "";
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    const sync = () => {
      raf = null;
      const next: AvatarItem[] = [];
      root.querySelectorAll<HTMLElement>(".ds-card[data-ds-friend-avatars]").forEach((card, idx) => {
        const avatars = (card.getAttribute("data-ds-friend-avatars") || "").split("|").filter(Boolean);
        if (!avatars.length) return;
        const art = card.querySelector<HTMLElement>(".ds-card-art") ?? card;
        const r = art.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const size = Math.max(14, Math.round(r.height * 0.116));
        next.push({
          key: `${card.getAttribute("data-appid") || idx}:${idx}`,
          left: Math.round(r.right - size - 2),
          top: Math.round(r.bottom - size + Math.round(size * 0.74)),
          size,
          avatars,
        });
      });
      const sig = JSON.stringify(next);
      if (sig === lastSig) return; // skip no-op re-renders (spurious syncs)
      lastSig = sig;
      setItems(next);
    };
    const schedule = () => { if (raf === null) raf = win.requestAnimationFrame(sync); };
    // Focus scales the featured card (transform) → re-measure on focus (cheap),
    // plus a settle pass after the ~160ms lift, instead of observing every
    // `class` mutation in the subtree (which fires on every nav focus change).
    const onFocus = () => { schedule(); if (settleTimer) clearTimeout(settleTimer); settleTimer = win.setTimeout(schedule, 200); };
    const mo = new MutationObserver(schedule);
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-ds-friend-avatars"] });
    root.addEventListener("focusin", onFocus, true);
    root.addEventListener("focusout", onFocus, true);
    win.addEventListener("scroll", schedule, { passive: true, capture: true });
    win.addEventListener("resize", schedule);
    schedule();
    return () => {
      unsubOverlay();
      mo.disconnect();
      root.removeEventListener("focusin", onFocus, true);
      root.removeEventListener("focusout", onFocus, true);
      win.removeEventListener("scroll", schedule, { capture: true } as any);
      win.removeEventListener("resize", schedule);
      if (settleTimer) clearTimeout(settleTimer);
      if (raf !== null) win.cancelAnimationFrame(raf);
    };
  }, [hostKey]);

  if (obscured || items.length === 0) return null;
  const portalDoc = findHomeRootDoc()?.doc ?? document;
  return createPortal(
    <div aria-hidden="true">
      {items.map((it) => (
        <div
          key={it.key}
          className="ds-friend-avatars"
          style={{ position: "fixed", left: it.left, top: it.top, zIndex: 100000, ["--ds-friend-avatar-size" as string]: `${it.size}px` }}
        >
          {it.avatars.slice(0, 3).map((src, i) => (
            <div key={i} className="ds-friend-avatar">
              <img className="ds-friend-avatar-img" src={src} alt="" loading="lazy" onError={(e) => { const h = e.currentTarget.parentElement as HTMLElement | null; if (h) h.style.display = "none"; }} />
              <div className="ds-friend-avatar-status" />
            </div>
          ))}
        </div>
      ))}
    </div>,
    portalDoc.body,
  );
}
