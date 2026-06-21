import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPreferredSteamDocument, getAllSteamDocuments } from '../../runtime/steamHost';
import i18n from '../../i18n';

function findHomeRootDoc(): { doc: Document; root: HTMLElement } | null {
  /* Plugin runs in SharedJSContext; the home root lives in the BP doc.
     getPreferredSteamDocument() returns the right one once homePatch has
     run setPreferredSteamWindow, but the effect below mounts before the
     patch finishes — so we walk every known Steam document and pick the
     one that actually contains the home root. */
  for (const d of [getPreferredSteamDocument(), ...getAllSteamDocuments()]) {
    try {
      const root = d?.getElementById?.('deck-shelves-home-root');
      if (root) return { doc: d, root };
    } catch {}
  }
  return null;
}

/* Single global badge overlay. One delegated focusin listener at the
   home root tracks the focused card and renders one fixed-position
   badge above the focus ring. Replaces per-card portals (N observers,
   N listeners, N React renders per focus change). */

type OverlayState = {
  left: number;
  top: number;
  width: number;
  isNew: boolean;
  discount: number;
};

const READ_TARGET_DELAY_MS = 0;

function readBadgeData(card: HTMLElement): { isNew: boolean; discount: number } {
  const isNew = card.getAttribute('data-isnew') === 'true';
  const discount = Number(card.getAttribute('data-discount') || '0');
  return { isNew, discount };
}

export function BadgeFocusOverlay() {
  const [state, setState] = useState<OverlayState | null>(null);
  /* Re-runs every render so a late-arriving preferred window doesn't strand
     the listeners on the wrong document. The cleanup tears down the prior
     listeners before the new ones attach, so duplicate handlers can't
     accumulate. */
  const [hostKey, setHostKey] = useState(0);
  useEffect(() => {
    const located = findHomeRootDoc();
    if (!located) {
      // Home root not yet in any known doc — retry on next animation
      // frame until it appears. Once mounted, the effect re-runs via the
      // bumped hostKey.
      const t = setTimeout(() => setHostKey((k) => k + 1), 150);
      return () => clearTimeout(t);
    }
    const { doc, root } = located;
    const win = doc.defaultView ?? window;
    let current: HTMLElement | null = null;
    let raf: number | null = null;
    const sync = () => {
      raf = null;
      if (!current || !root.contains(current)) { setState(null); return; }
      const r = current.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { setState(null); return; }
      const { isNew, discount } = readBadgeData(current);
      if (!isNew && discount <= 0) { setState(null); return; }
      setState({ left: r.left, top: r.top, width: r.width, isNew, discount });
    };
    const schedule = () => {
      if (raf !== null) return;
      raf = win.requestAnimationFrame(sync);
    };
    // Re-sync when the focused card's badge attrs land late — happens with
    // async name resolution / store metadata where `data-isnew` /
    /* `data-discount` flip after the focus event already fired. Also
       watch `class` so Y-button highlight toggles (which add/remove
       `ds-card--featured` and change the card's width) re-measure the
       band, otherwise the badge keeps the pre-resize width and floats
       offset from the new card edge. */
    const attrObserver = new MutationObserver(schedule);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    const attachAttrObserver = (card: HTMLElement | null) => {
      attrObserver.disconnect();
      try { resizeObserver?.disconnect(); } catch {}
      if (card) {
        attrObserver.observe(card, { attributes: true, attributeFilter: ['data-isnew', 'data-discount', 'class'] });
        try { resizeObserver?.observe(card); } catch {}
      }
    };
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const card = t?.closest?.('.ds-card') as HTMLElement | null;
      if (card) {
        current = card;
        attachAttrObserver(card);
        /* The card gains a `transform: translateY(-2px)` on focus via a
           160ms CSS transition; reading the rect immediately captures a
           mid-transition position, leaving the overlay 1-2 px above the
           settled card. Re-sync after the transition window so the
           overlay matches the card's final rect. */
        setTimeout(schedule, READ_TARGET_DELAY_MS);
        setTimeout(schedule, 200);
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (!next || !root.contains(next)) { current = null; attachAttrObserver(null); schedule(); }
    };
    root.addEventListener('focusin', onFocusIn, true);
    root.addEventListener('focusout', onFocusOut, true);
    win.addEventListener('scroll', schedule, { passive: true, capture: true });
    win.addEventListener('resize', schedule);
    return () => {
      root.removeEventListener('focusin', onFocusIn, true);
      root.removeEventListener('focusout', onFocusOut, true);
      win.removeEventListener('scroll', schedule, { capture: true } as any);
      win.removeEventListener('resize', schedule);
      attrObserver.disconnect();
      try { resizeObserver?.disconnect(); } catch {}
      if (raf !== null) win.cancelAnimationFrame(raf);
    };
  }, [hostKey]);

  if (!state) return null;
  const portalDoc = findHomeRootDoc()?.doc ?? document;
  return createPortal(
    <div
      className="ds-card-badge-host ds-card-badge-host--overlay"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: state.left,
        // 8 px above the focused card's (post-transform) top — 2 px
        /* higher than the unfocused inline badge (which sits at -6 from
           the card edge) so the on-focus lift visibly raises the badge
           a touch more than the unfocused state. The delayed re-sync on
           focusIn captures the rect after the 160ms lift transition
           settles so the overlay never strands mid-animation. */
        top: state.top - 8,
        width: state.width,
        height: 24,
        pointerEvents: 'none',
        zIndex: 100000,
      }}
    >
      {state.discount > 0 && (
        <div className="ds-new-badge-band">
          <div className="ds-new-badge" style={{ background: '#2a7f2a' }}>
            {i18n.t('badge_discount', { count: state.discount }) ?? `${state.discount}% off`}
          </div>
        </div>
      )}
      {state.isNew && state.discount <= 0 && (
        <div className="ds-new-badge-band">
          <div className="ds-new-badge">{i18n.t('badge_new')}</div>
        </div>
      )}
    </div>,
    portalDoc.body,
  );
}
