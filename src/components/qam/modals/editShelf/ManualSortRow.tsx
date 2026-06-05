import { useEffect, useMemo, useRef, useState } from 'react'
import { Focusable } from '../../../../runtime/host/decky'
import { computeCenteredScrollLeft } from '../../../../core/scrollUtils'
import { ShelfRow } from '../../../shelf/ShelfRow'
import type { DeckRowItem } from '../../../shelf/types'
import type { PlatformAppMeta } from '../../../../runtime/platform'
import { DIR_LEFT, DIR_RIGHT, HOLD_MS } from './constants'

// Card sizes used by the preview row. Matches ShelfPreview so the
// manual-sort grid renders at the exact same scale as every other tab.
const PREVIEW_CARD_W = 78
const PREVIEW_ART_H = 110
const FEATURED_CARD_W = Math.round(PREVIEW_CARD_W * 3.21)
const NEW_GAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

type SyntheticCardSpec = {
  position: number;
  image?: string;
  text?: string;
  link?: { type: 'app' | 'url'; value: string };
  size: 'normal' | 'featured';
  alpha?: number;
  placeholder?: boolean;
}

/**
 * Horizontal row used in the Source tab when sort === "manual". Renders
 * through the SAME `ShelfRow` the other preview tabs use so cards (hide
 * flags, synthetics, badges, X-button bindings, sizing) match 1:1
 * across every tab and across both shelf modal types. The only extras
 * here are the manual-sort interaction layer:
 *
 * - Gamepad grab mode: A to grab, L/R d-pad to shift, A to drop. While
 *   grabbed, `FocusNavController.DispatchVirtualButtonClick` is patched so
 *   directional input is consumed before Steam moves focus away — otherwise
 *   the next A press can land on Save/Cancel instead of releasing the grab.
 * - Pointer-hold grab: hold ~300ms, drag to reorder, release to drop.
 * - Re-centers the shifted card after every move (focus-centered scroll
 *   only fires on `focusin`, which doesn't re-fire when the same card
 *   stays focused but moves in the DOM).
 */
export function ManualSortRow({
  order, meta, onReorder, t, highlightFirst, highlightAll, highlightedAppIds, highlightPickerOpen,
  shelfSource,
  hideStatusLine, hideNewBadge, hideDiscountBadge, hideCompatIcons, hideNonSteamBadge,
  hideGameNames, hideInstallIndicator,
  syntheticCards,
  removableSet, onRemoveCard,
}: {
  order: number[];
  meta: Map<number, PlatformAppMeta>;
  onReorder: (nextOrder: number[]) => void;
  t: (k: any, opts?: any) => string;
  highlightFirst: boolean;
  highlightAll: boolean;
  highlightedAppIds: number[];
  highlightPickerOpen: boolean;
  shelfSource?: any;
  hideStatusLine?: boolean;
  hideNewBadge?: boolean;
  hideDiscountBadge?: boolean;
  hideCompatIcons?: boolean;
  hideNonSteamBadge?: boolean;
  hideGameNames?: boolean;
  hideInstallIndicator?: boolean;
  syntheticCards?: SyntheticCardSpec[];
  removableSet?: Set<number>;
  onRemoveCard?: (appid: number) => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const [grabbedAppid, setGrabbedAppid] = useState<number | null>(null)
  const holdTimerRef = useRef<any>(null)
  const pointerHeldRef = useRef(false)
  const orderRef = useRef(order)
  const grabbedRef = useRef<number | null>(null)
  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => { grabbedRef.current = grabbedAppid }, [grabbedAppid])

  // Same discount-source rule ShelfPreview applies — only online shelves
  // (wishlist / store / composite-with-online-child) should ever display
  // the discount badge. On owned/installed/collection shelves the user
  // already has the game so the % off is noise.
  const isOnlineShelfSource = (() => {
    const s: any = shelfSource
    if (!s || typeof s !== 'object') return false
    if (s.type === 'wishlist' || s.type === 'store') return true
    if (s.type === 'composite' && Array.isArray(s.sources)) {
      return s.sources.some((c: any) => c?.type === 'wishlist' || c?.type === 'store')
    }
    return false
  })()

  useEffect(() => {
    const rowEl = rowRef.current
    if (!rowEl) return
    let rafPending: number | null = null
    // Mirror ShelfPreview's focusin behaviour 1:1 — `scrollIntoView({
    // block: nearest, inline: center })` is what every other preview
    // row uses. Selector uses `.ds-card` (GameCard's class), matching
    // every other tab.
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      const card = target?.closest('.ds-card') as HTMLElement | null
      if (!card || !rowEl.contains(card)) return
      if (rafPending !== null) cancelAnimationFrame(rafPending)
      rafPending = requestAnimationFrame(() => {
        rafPending = null
        try {
          card.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest', inline: 'center' })
        } catch {
          try { card.scrollIntoView({ block: 'nearest', inline: 'center' }) } catch {}
        }
      })
    }
    rowEl.addEventListener('focusin', onFocusIn)
    return () => {
      rowEl.removeEventListener('focusin', onFocusIn)
      if (rafPending !== null) cancelAnimationFrame(rafPending)
    }
  }, [])

  // Look up a card's DOM element by its DeckRowItem.id (the value passed
  // through ShelfRow → GameCard → data-appid). For game cards the id is
  // the appid; for synthetic sentinels (negative) we encode it in
  // data-appid too via `__synth_<sentinelKey>` — but the grab system
  // only ever targets positive appids, so the synthetic case isn't
  // reachable here.
  const findCardEl = (appid: number) => {
    const rowEl = rowRef.current
    if (!rowEl || !appid) return null
    return rowEl.querySelector<HTMLElement>(`.ds-card[data-appid="${appid}"]`)
  }

  const refocusGrabbed = () => {
    const appid = grabbedRef.current
    if (appid === null) return
    const el = findCardEl(appid)
    try { el?.focus?.() } catch {}
  }

  const centerCard = (appid: number) => {
    const rowEl = rowRef.current
    if (!rowEl) return
    const target = findCardEl(appid)
    if (!target) return
    const final = computeCenteredScrollLeft(
      { width: rowEl.clientWidth, scrollWidth: rowEl.scrollWidth },
      { left: target.offsetLeft, top: target.offsetTop, width: target.offsetWidth, height: target.offsetHeight }
    )
    try { rowEl.scrollTo({ left: final, behavior: 'instant' as ScrollBehavior }) } catch { rowEl.scrollLeft = final }
  }

  const shiftGrabbed = (delta: number) => {
    const appid = grabbedRef.current
    if (appid === null) return
    const base = orderRef.current.slice()
    const from = base.indexOf(appid)
    if (from === -1) return
    const to = Math.max(0, Math.min(base.length - 1, from + delta))
    if (to === from) return
    const [picked] = base.splice(from, 1)
    base.splice(to, 0, picked)
    // Update orderRef synchronously so successive rapid presses operate
    // on the latest order — without this, every press until React
    // commits computes the same shift against stale state and the
    // visible movement falls behind the keystrokes.
    orderRef.current = base
    onReorder(base)
    // Two rAFs: first lets React commit, second guarantees layout.
    // refocus + center happens AFTER the DOM has the new position so
    // the focus indicator and the scroll position both track the
    // grabbed card precisely — otherwise the card runs off-screen on
    // rapid moves and the user loses track of where they're dragging.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refocusGrabbed()
        if (typeof picked === 'number') centerCard(picked)
      })
    })
  }

  const toggleGrab = (appid: number) => {
    setGrabbedAppid((g) => (g === appid ? null : appid))
  }

  useEffect(() => {
    if (grabbedAppid === null) return
    const rowEl = rowRef.current
    if (!rowEl) return
    const doc = rowEl.ownerDocument ?? document

    const ctrl: any = (globalThis as any).FocusNavController
      ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller
    let origDispatch: ((button: number, ...args: any[]) => any) | null = null
    try {
      if (ctrl && typeof ctrl.DispatchVirtualButtonClick === 'function') {
        const orig = ctrl.DispatchVirtualButtonClick.bind(ctrl)
        origDispatch = orig
        ctrl.DispatchVirtualButtonClick = (button: number, ...args: any[]) => {
          if (button === DIR_LEFT) { shiftGrabbed(-1); return }
          if (button === DIR_RIGHT) { shiftGrabbed(+1); return }
          if (button === 9 /*UP*/ || button === 10 /*DOWN*/) {
            requestAnimationFrame(refocusGrabbed)
            return
          }
          return orig(button, ...args)
        }
      }
    } catch {}

    requestAnimationFrame(refocusGrabbed)
    const onDir = (e: Event) => {
      const btn = (e as CustomEvent<any>).detail?.button
      try { (e as any).stopImmediatePropagation?.(); e.preventDefault?.() } catch {}
      if (btn === DIR_LEFT || btn === DIR_RIGHT) {
        shiftGrabbed(btn === DIR_LEFT ? -1 : +1)
        return
      }
      requestAnimationFrame(refocusGrabbed)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation(); e.preventDefault()
        shiftGrabbed(e.key === 'ArrowLeft' ? -1 : +1)
        return
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.stopPropagation(); e.preventDefault()
        requestAnimationFrame(refocusGrabbed)
      }
    }
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as HTMLElement | null
      if (next && rowEl.contains(next)) return
      requestAnimationFrame(refocusGrabbed)
    }
    doc.addEventListener('vgp_ondirection', onDir, true)
    doc.addEventListener('keydown', onKey, true)
    rowEl.addEventListener('focusout', onFocusOut)
    return () => {
      doc.removeEventListener('vgp_ondirection', onDir, true)
      doc.removeEventListener('keydown', onKey, true)
      rowEl.removeEventListener('focusout', onFocusOut)
      try { if (ctrl && origDispatch) ctrl.DispatchVirtualButtonClick = origDispatch } catch {}
    }
  }, [grabbedAppid])

  // Delegated pointerdown — hits whichever card the user pressed and
  // starts the hold-to-grab + drag-to-reorder flow. Lives on the row
  // wrapper so we don't have to wrap each card individually (which
  // ShelfRow doesn't allow without forking it).
  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const card = (e.target as HTMLElement | null)?.closest('.ds-card[data-appid]') as HTMLElement | null
    if (!card) return
    const appid = Number(card.getAttribute('data-appid')) || 0
    if (!appid) return
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
    pointerHeldRef.current = false
    const startX = e.clientX
    holdTimerRef.current = setTimeout(() => {
      pointerHeldRef.current = true
      setGrabbedAppid(appid)
    }, HOLD_MS)
    const doc = rowRef.current?.ownerDocument ?? document
    const move = (ev: any) => {
      if (!pointerHeldRef.current) {
        if (Math.abs(ev.clientX - startX) > 8) {
          if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
          doc.removeEventListener('pointermove', move)
          doc.removeEventListener('pointerup', up)
        }
        return
      }
      const rowEl = rowRef.current
      if (!rowEl) return
      const cards = Array.from(rowEl.querySelectorAll<HTMLElement>('.ds-card[data-appid]'))
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right) {
          const current = grabbedRef.current
          if (current === null) return
          const cardId = Number(cards[i].getAttribute('data-appid')) || 0
          const base = orderRef.current.slice()
          const from = base.indexOf(current)
          const to = base.indexOf(cardId)
          if (from === -1 || to === -1 || from === to) return
          const [picked] = base.splice(from, 1)
          base.splice(to, 0, picked)
          orderRef.current = base
          onReorder(base)
          return
        }
      }
    }
    const up = () => {
      doc.removeEventListener('pointermove', move)
      doc.removeEventListener('pointerup', up)
      if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
      if (pointerHeldRef.current) {
        pointerHeldRef.current = false
        setGrabbedAppid(null)
      }
    }
    doc.addEventListener('pointermove', move)
    doc.addEventListener('pointerup', up)
  }

  // Build rowItems with the SAME shape ShelfPreview produces so the
  // resulting ShelfRow render is visually identical — hide flags,
  // synthetic interleaving, picker overlays, X-button binding, discount
  // gating. The only differences:
  //   - 'grabbed' selectionMark for the currently held card
  //   - onToggleSelection wired to toggleGrab (click toggles grab)
  //   - Synthetic sentinels in `order` (negative ids) translate to
  //     synthetic DeckRowItems using state.syntheticCards data
  const rowItems = useMemo<DeckRowItem[]>(() => {
    let priceCache: any = null
    if (isOnlineShelfSource) {
      try {
        const raw = (globalThis as any).localStorage?.getItem?.('ds-price-cache-v1')
        if (raw) priceCache = JSON.parse(raw)
      } catch {}
    }
    const readDiscount = (id: number): number | undefined => {
      if (!isOnlineShelfSource) return undefined
      const d = priceCache?.[id]?.data?.discount
      return typeof d === 'number' && d > 0 ? d : undefined
    }
    const out: DeckRowItem[] = []
    for (let idx = 0; idx < order.length; idx++) {
      const id = order[idx]
      if (id < 0) {
        // Synthetic sentinel — decode index back from `-(synthIdx + 1)`
        // (same encoding EditShelfModal uses to interleave decoration
        // cards into the manual order).
        const synthIdx = -id - 1
        const c = syntheticCards?.[synthIdx]
        if (!c) continue
        out.push({
          id: `__synth_manual_${synthIdx}_${idx}`,
          name: c.text ?? '',
          synthetic: {
            image: c.image,
            text: c.text,
            link: c.link,
            size: c.size === 'featured' ? 'featured' : 'normal',
            alpha: c.alpha,
            placeholder: c.placeholder === true,
          },
        })
        continue
      }
      const m = meta.get(id) as any
      if (!m) continue
      const grabbed = grabbedAppid === id
      const inHighlighted = highlightedAppIds.includes(id)
      const isNew = m.addedTimestamp ? (Date.now() - m.addedTimestamp * 1000) < NEW_GAME_WINDOW_MS : false
      // Selection-mark precedence: grab wins (active drag intent);
      // highlight-picker selection second; otherwise none. Matches the
      // prior ManualSortRow logic so the visual overlay rules don't
      // change across the refactor.
      const mark: DeckRowItem['selectionMark'] =
        grabbed ? 'grabbed'
          : (highlightPickerOpen && inHighlighted) ? 'highlight'
          : undefined
      out.push({
        id,
        appid: id,
        name: m.name ?? `App ${id}`,
        portraitUrl: m.portraitUrl,
        heroUrl: m.heroUrl,
        isInstalled: m.installed,
        isSteam: m.isSteam,
        deckCompatCategory: m.deckCompatCategory,
        playtimeMinutes: m.playtimeMinutes,
        updatePending: m.updatePending,
        isNew,
        discountPercent: readDiscount(id),
        selectionMark: mark,
        onToggleSelection: () => toggleGrab(id),
      })
    }
    return out
    // grabbedAppid drives the 'grabbed' overlay — needed in deps.
  }, [order, meta, syntheticCards, grabbedAppid, highlightedAppIds.join(','), highlightPickerOpen, isOnlineShelfSource])

  // featured rules per card (same precedence as ShelfPreview/ShelfRow):
  // highlightAll > highlightFirst (idx 0) > id in highlightedSet.
  const highlightedSet = useMemo(() => new Set(highlightedAppIds), [highlightedAppIds.join(',')])

  return (
    <Focusable
      ref={rowRef}
      onPointerDown={onRowPointerDown}
      data-ds-preview-row='1'
      style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: '12px 0 28px',
        // overflow-y hidden + 28 px bottom padding reserves room for the
        // Focusable glow ring that extends past the card edge.
        overflowX: 'auto', overflowY: 'hidden', boxSizing: 'border-box',
        touchAction: 'pan-x',
        overscrollBehaviorX: 'contain',
        overscrollBehaviorY: 'none',
      }}
    >
      <ShelfRow
        items={rowItems}
        cardW={PREVIEW_CARD_W}
        cardH={PREVIEW_ART_H}
        featuredW={FEATURED_CARD_W}
        featuredH={PREVIEW_ART_H}
        highlightFirst={highlightFirst}
        highlightAll={highlightAll}
        highlightedSet={highlightedSet}
        hideStatusLine={!!hideStatusLine}
        hideNewBadge={!!hideNewBadge}
        hideDiscountBadge={!!hideDiscountBadge}
        hideCompatIcons={!!hideCompatIcons}
        hideNonSteamBadge={!!hideNonSteamBadge}
        hideGameName={!!hideGameNames}
        hideInstallIndicator={!!hideInstallIndicator}
        inlineBadges
        previewMode
        removableSet={removableSet}
        onRemoveCard={onRemoveCard}
      />
      <span aria-hidden='true' style={{ display: 'none' }}>{t('sort_manual')}</span>
    </Focusable>
  )
}
