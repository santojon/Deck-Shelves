import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPreferredSteamDocument } from '../../runtime/steamHost';
import i18n from '../../i18n';

// Single global badge overlay. One delegated focusin listener at the
// home root tracks the focused card and renders one fixed-position
// badge above the focus ring. Replaces per-card portals (N observers,
// N listeners, N React renders per focus change).

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
  useEffect(() => {
    const doc = getPreferredSteamDocument() ?? document;
    const root = doc.getElementById('deck-shelves-home-root');
    if (!root) return;
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
    const onFocusIn = (e: Event) => {
      const t = e.target as HTMLElement | null;
      const card = t?.closest?.('.ds-card') as HTMLElement | null;
      if (card) {
        current = card;
        setTimeout(schedule, READ_TARGET_DELAY_MS);
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (!next || !root.contains(next)) { current = null; schedule(); }
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
      if (raf !== null) win.cancelAnimationFrame(raf);
    };
  }, []);

  if (!state) return null;
  const portalDoc = getPreferredSteamDocument() ?? document;
  return createPortal(
    <div
      className="ds-card-badge-host ds-card-badge-host--overlay"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: state.left,
        top: state.top - 14,
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
