import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getPreferredSteamDocument, getAllSteamDocuments } from '../../runtime/steamHost';
import { subscribeFocusedCard, getFocusedCard } from '../../runtime/focusedCardTracker';
import { subscribeOverlayActive } from './overlayState';
import { subscribeSessionState, getSessionState } from '../../runtime/sessionState';
import i18n from '../../i18n';
import { getCurrentSettings } from '../../store/settingsStore';
import { resolveDiscountBadgeModes, type DiscountBadgeMode } from './discountBadge';
import { DiscountBadgePill } from './DiscountBadgePill';

function findHomeRootDoc(): { doc: Document; root: HTMLElement } | null {
  // The effect can mount before the preferred window is set, so search every Steam document.
  for (const d of [getPreferredSteamDocument(), ...getAllSteamDocuments()]) {
    try {
      const root = d?.getElementById?.('deck-shelves-home-root');
      if (root) return { doc: d, root };
    } catch {}
  }
  return null;
}

type OverlayState = {
  left: number;
  top: number;
  width: number;
  isNew: boolean;
  discount: number;
  priceText?: string;
  mode: DiscountBadgeMode;
};

const READ_TARGET_DELAY_MS = 0;

// The selected card's mode comes from its shelf (a global value first); a card of no saved shelf takes the global one.
function readBadgeData(card: HTMLElement): { isNew: boolean; discount: number; priceText?: string; mode: DiscountBadgeMode } {
  const isNew = card.getAttribute('data-isnew') === 'true';
  const discount = Number(card.getAttribute('data-discount') || '0');
  const settings = getCurrentSettings() as any;
  const shelfId = card.getAttribute('data-shelfid');
  const shelf = settings?.shelves?.find?.((s: any) => s?.id === shelfId);
  return { isNew, discount, priceText: card.getAttribute('data-price') || undefined, mode: resolveDiscountBadgeModes(settings, shelf).focused };
}

export function overlayStateFor(card: HTMLElement, rect: { left: number; top: number; width: number }): OverlayState | null {
  const badge = readBadgeData(card);
  if (!badge.isNew && badge.discount <= 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, ...badge };
}

export function BadgeFocusOverlay() {
  const [state, setState] = useState<OverlayState | null>(null);
  const [obscured, setObscured] = useState(false);
  const [hostKey, setHostKey] = useState(0);
  const [gameRunning, setGameRunning] = useState(() => getSessionState().gameRunning);
  useEffect(() => subscribeSessionState(() => setGameRunning(getSessionState().gameRunning)), []);
  useEffect(() => {
    if (gameRunning) { setState(null); return; }
    const located = findHomeRootDoc();
    if (!located) {
      const t = setTimeout(() => setHostKey((k) => k + 1), 150);
      return () => clearTimeout(t);
    }
    const { doc, root } = located;
    const win = doc.defaultView ?? window;
    const unsubOverlay = subscribeOverlayActive(doc, setObscured);
    let current: HTMLElement | null = null;
    let raf: number | null = null;
    const sync = () => {
      raf = null;
      if (!current || !root.contains(current)) { setState(null); return; }
      const r = current.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { setState(null); return; }
      setState(overlayStateFor(current, r));
    };
    const schedule = () => {
      if (raf !== null) return;
      raf = win.requestAnimationFrame(sync);
    };
    const attrObserver = new MutationObserver(schedule);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    const attachAttrObserver = (card: HTMLElement | null) => {
      attrObserver.disconnect();
      try { resizeObserver?.disconnect(); } catch {}
      if (card) {
        attrObserver.observe(card, { attributes: true, attributeFilter: ['data-isnew', 'data-discount', 'data-price', 'class'] });
        try { resizeObserver?.observe(card); } catch {}
      }
    };
    // Re-measure after the 160ms focus lift; an immediate read lands mid-animation.
    const setCurrent = (card: HTMLElement | null) => {
      if (card === current) return;
      current = card;
      attachAttrObserver(card);
      setTimeout(schedule, READ_TARGET_DELAY_MS);
      setTimeout(schedule, 200);
    };
    // BTakeFocus navigation fires neither focusin nor gpfocus, so follow the shared tracker.
    const resolveFocusedCard = (): HTMLElement | null => {
      try {
        const shared = getFocusedCard();
        const c = shared && root.contains(shared) ? shared : null;
        if (c) return c;
      } catch {}
      return root.querySelector('.ds-card.gpfocus') as HTMLElement | null;
    };
    const onFocusIn = (e: Event) => {
      const card = (e.target as HTMLElement | null)?.closest?.('.ds-card') as HTMLElement | null;
      if (card) setCurrent(card);
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (!next || !root.contains(next)) setCurrent(resolveFocusedCard());
    };
    setCurrent(resolveFocusedCard());
    const unsubFocusTracker = subscribeFocusedCard(() => setCurrent(resolveFocusedCard()));
    root.addEventListener('focusin', onFocusIn, true);
    root.addEventListener('focusout', onFocusOut, true);
    win.addEventListener('scroll', schedule, { passive: true, capture: true });
    win.addEventListener('resize', schedule);
    return () => {
      unsubOverlay();
      unsubFocusTracker();
      root.removeEventListener('focusin', onFocusIn, true);
      root.removeEventListener('focusout', onFocusOut, true);
      win.removeEventListener('scroll', schedule, { capture: true } as any);
      win.removeEventListener('resize', schedule);
      attrObserver.disconnect();
      try { resizeObserver?.disconnect(); } catch {}
      if (raf !== null) win.cancelAnimationFrame(raf);
    };
  }, [hostKey, gameRunning]);

  if (obscured || !state) return null;
  const portalDoc = findHomeRootDoc()?.doc ?? document;
  return createPortal(
    <div
      className="ds-card-badge-host ds-card-badge-host--overlay"
      aria-hidden="true"
      style={{
        position: 'fixed',
        left: state.left,
        top: state.top - 8,
        width: state.width,
        height: 24,
        pointerEvents: 'none',
        zIndex: 100000,
      }}
    >
      {state.discount > 0 && (
        <div className="ds-new-badge-band">
          <DiscountBadgePill mode={state.mode} discount={state.discount} priceText={state.priceText} percentText={i18n.t('badge_discount', { count: state.discount }) ?? `${state.discount}% off`} />
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
