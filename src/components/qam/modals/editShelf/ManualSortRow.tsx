import { useEffect, useRef, useState } from 'react'
import { Focusable } from '@decky/ui'
import { computeCenteredScrollLeft } from '../../../../core/scrollUtils'
import { HighlightMiniCard } from './HighlightMiniCard'
import { DIR_LEFT, DIR_RIGHT, HOLD_MS } from './constants'

/**
 * Horizontal row used in the Source tab when sort === "manual". Extends
 * HighlightRow with:
 * - Gamepad grab mode: A to grab, L/R d-pad to shift, A to drop. While
 *   grabbed, `FocusNavController.DispatchVirtualButtonClick` is patched so
 *   directional input is consumed before Steam moves focus away — otherwise
 *   the next A press can land on Save/Cancel instead of releasing the grab.
 * - Pointer-hold grab: hold ~300ms, drag to reorder, release to drop.
 * - Chevron clicks on each card shift by one position.
 * - Re-centers the shifted card after every move (focus-centered scroll
 *   only fires on `focusin`, which doesn't re-fire when the same card
 *   stays focused but moves in the DOM).
 */
export function ManualSortRow({
  order, meta, onReorder, t, highlightFirst, highlightAll, highlightedAppIds, highlightPickerOpen,
}: {
  order: number[];
  meta: Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>;
  onReorder: (nextOrder: number[]) => void;
  t: (k: any, opts?: any) => string;
  highlightFirst: boolean;
  highlightAll: boolean;
  highlightedAppIds: number[];
  highlightPickerOpen: boolean;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  const [grabbedAppid, setGrabbedAppid] = useState<number | null>(null)
  const holdTimerRef = useRef<any>(null)
  const pointerHeldRef = useRef(false)
  const orderRef = useRef(order)
  const grabbedRef = useRef<number | null>(null)
  useEffect(() => { orderRef.current = order }, [order])
  useEffect(() => { grabbedRef.current = grabbedAppid }, [grabbedAppid])

  useEffect(() => {
    const rowEl = rowRef.current
    if (!rowEl) return
    let rafPending: number | null = null
    let throttleTimer: any = null
    let throttled = false
    let lastFocusedCard: HTMLElement | null = null
    const doScroll = (card: HTMLElement) => {
      const final = computeCenteredScrollLeft(
        { width: rowEl.clientWidth, scrollWidth: rowEl.scrollWidth },
        { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight }
      )
      try { rowEl.scrollTo({ left: final, behavior: 'instant' as ScrollBehavior }) } catch { rowEl.scrollLeft = final }
      throttled = true
      if (throttleTimer) clearTimeout(throttleTimer)
      throttleTimer = setTimeout(() => {
        throttled = false
        throttleTimer = null
        if (lastFocusedCard && lastFocusedCard !== card) doScroll(lastFocusedCard)
      }, 100)
    }
    const handle = (card: HTMLElement) => {
      lastFocusedCard = card
      if (throttled) return
      doScroll(card)
    }
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      const card = target?.closest('.ds-highlight-mini') as HTMLElement | null
      if (!card || !rowEl.contains(card)) return
      if (rafPending !== null) cancelAnimationFrame(rafPending)
      rafPending = requestAnimationFrame(() => { rafPending = null; handle(card) })
    }
    rowEl.addEventListener('focusin', onFocusIn)
    return () => {
      rowEl.removeEventListener('focusin', onFocusIn)
      if (rafPending !== null) cancelAnimationFrame(rafPending)
      if (throttleTimer) clearTimeout(throttleTimer)
    }
  }, [])

  const refocusGrabbed = () => {
    const appid = grabbedRef.current
    if (appid === null) return
    const rowEl = rowRef.current
    if (!rowEl) return
    const el = rowEl.querySelector<HTMLElement>(`.ds-highlight-mini[data-appid="${appid}"]`)
    try { el?.focus?.() } catch {}
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
    onReorder(base)
    requestAnimationFrame(refocusGrabbed)
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

  const onCardPointerDown = (appid: number) => (e: React.PointerEvent) => {
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
      const cards = Array.from(rowEl.querySelectorAll<HTMLElement>('.ds-highlight-mini'))
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right) {
          const current = grabbedRef.current
          if (current === null) return
          const base = orderRef.current.slice()
          const from = base.indexOf(current)
          if (from === -1 || from === i) return
          const [picked] = base.splice(from, 1)
          base.splice(i, 0, picked)
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

  const shiftAt = (idx: number, delta: number) => {
    const base = order.slice()
    const to = Math.max(0, Math.min(base.length - 1, idx + delta))
    if (to === idx) return
    const [picked] = base.splice(idx, 1)
    base.splice(to, 0, picked)
    onReorder(base)
    requestAnimationFrame(() => {
      const rowEl = rowRef.current
      if (!rowEl) return
      const target = rowEl.querySelector<HTMLElement>(`.ds-highlight-mini[data-appid="${picked}"]`)
      if (!target) return
      const final = computeCenteredScrollLeft(
        { width: rowEl.clientWidth, scrollWidth: rowEl.scrollWidth },
        { left: target.offsetLeft, top: target.offsetTop, width: target.offsetWidth, height: target.offsetHeight }
      )
      try { rowEl.scrollTo({ left: final, behavior: 'smooth' }) } catch { rowEl.scrollLeft = final }
    })
  }

  return (
    <Focusable
      ref={rowRef}
      style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8,
        // Extend to container outer edges; no internal horizontal padding —
        // first/last card sit flush against the edge. Matches HighlightRow.
        margin: '0 -24px', padding: '12px 0 28px', width: 'auto',
        // 28px bottom padding reserves room for the Decky Focusable focus
        // glow on the mini-card (extends ~24px past the card edge); see
        // HighlightRow for the rationale on keeping overflow-y: hidden.
        overflowX: 'auto', overflowY: 'hidden', boxSizing: 'border-box',
        touchAction: 'pan-x',
        overscrollBehaviorX: 'contain',
        overscrollBehaviorY: 'none',
      }}
    >
      {order.map((id, idx) => {
        const m = meta.get(id)
        const grabbed = grabbedAppid === id
        const inHighlighted = highlightedAppIds.includes(id)
        const selected = highlightPickerOpen && inHighlighted
        const featured = highlightAll || (highlightFirst && idx === 0) || selected
        const h = 100
        const w = featured ? 210 : 68
        return (
          <HighlightMiniCard
            key={id}
            appid={id}
            name={m?.name ?? `App ${id}`}
            portraitUrl={m?.portraitUrl}
            heroUrl={m?.heroUrl}
            featured={featured}
            selected={selected}
            grabbed={grabbed}
            width={w}
            height={h}
            onToggle={() => toggleGrab(id)}
            onShiftLeft={idx > 0 ? () => shiftAt(idx, -1) : null}
            onShiftRight={idx < order.length - 1 ? () => shiftAt(idx, +1) : null}
            onPointerDown={onCardPointerDown(id)}
          />
        )
      })}
      <span aria-hidden='true' style={{ display: 'none' }}>{t('sort_manual')}</span>
    </Focusable>
  )
}
