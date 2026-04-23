import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ConfirmModal,
  DialogButton,
  DropdownItem,
  Field,
  Focusable,
  SliderField,
  Tabs,
  TextField,
  ToggleField,
} from '@decky/ui'
import type { SingleDropdownOption } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { FilterGroup, Shelf, ShelfFilter } from '../../../types'
import { filterGroupToFilter, getEffectiveFilterGroup, normalizeFilter } from '../../../domain/settings'
import { FilterPanel } from '../../FilterPanel'
import { DeckModalStyles } from '../../styles/DeckModalStyles'
import { logInfo } from '../../../runtime/logger'
import { resolveShelfAppIds } from '../../../steam'
import { getExternalSources } from '../../../core/pluginApi'
import { isNonSteamBadgesAvailable } from '../../../integrations'
import { usePlatform } from '../../../runtime/platformContext'
import { CheckIcon } from '../../filter/utils'
import { getLandscapeUrls, getPortraitFallbacks } from '../../../core/steamAssets'
import { computeCenteredScrollLeft } from '../../../core/scrollUtils'

type SourceType = 'collection' | 'tab' | 'filter' | 'external'
type EditTab = 'source' | 'filters' | 'visual' | 'display'

const BASE_SOURCE_TYPES: SourceType[] = ['collection', 'tab', 'filter']

const SORT_OPTIONS = [
  { value: 'alphabetical', labelKey: 'sort_alpha' },
  { value: 'recent', labelKey: 'sort_recent' },
  { value: 'playtime', labelKey: 'sort_playtime' },
  { value: 'release_date', labelKey: 'sort_release_date' },
  { value: 'size_on_disk', labelKey: 'sort_size_on_disk' },
  { value: 'metacritic', labelKey: 'sort_metacritic' },
  { value: 'review_score', labelKey: 'sort_review_score' },
  { value: 'added', labelKey: 'sort_added' },
  { value: 'random', labelKey: 'sort_random' },
  { value: 'manual', labelKey: 'sort_manual' },
] as const

type EditableShelfState = {
  title: string
  sourceType: SourceType
  collectionId: string
  tab: string
  externalSourceId: string
  filter: ShelfFilter
  filterGroup: FilterGroup
  sort: string
  limit: number
  matchNativeSize: boolean
  highlightFirst: boolean
  highlightAll: boolean
  highlightedAppIds: number[]
  manualOrder: number[]
  hideStatusLine: boolean
  hideNewBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
}

import { textFromDeckyChange } from './modalUtils'

function optionData(option: unknown) {
  return (option as any)?.data ?? option
}

function HighlightRow({ children }: { children: React.ReactNode }) {
  const rowRef = useRef<HTMLDivElement | null>(null)

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

    const handle = (card: HTMLElement | null) => {
      if (!card) return
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

  return (
    <Focusable
      ref={rowRef}
      style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 0', width: '100%', overflowX: 'auto', overflowY: 'hidden' }}
    >
      {children}
    </Focusable>
  )
}

const DIR_LEFT = 11
const DIR_RIGHT = 12
const HOLD_MS = 300

function ManualSortRow({
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

  // Focus-centered scroll (same pattern as HighlightRow)
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
    // keep focus on the grabbed card after DOM reorders
    requestAnimationFrame(refocusGrabbed)
  }

  const toggleGrab = (appid: number) => {
    setGrabbedAppid((g) => (g === appid ? null : appid))
  }

  // While grabbed: patch FocusNavController to intercept ALL directional buttons BEFORE
  // Steam navigates (vgp_ondirection fires too late — focus has already moved). Also keep
  // vgp_ondirection + keydown capture as defense in depth, and auto-release if focus escapes.
  useEffect(() => {
    if (grabbedAppid === null) return
    const rowEl = rowRef.current
    if (!rowEl) return
    const doc = rowEl.ownerDocument ?? document

    // --- Patch FocusNavController.DispatchVirtualButtonClick ------------
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
      // force refocus to grabbed card — don't release silently
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

  // Pointer-hold grab: start timer on pointerdown, enter grab after HOLD_MS, move shifts, up releases
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
        // if pointer moved before timer, cancel hold
        if (Math.abs(ev.clientX - startX) > 8) {
          if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null }
          doc.removeEventListener('pointermove', move)
          doc.removeEventListener('pointerup', up)
        }
        return
      }
      // While held, hit-test to determine target card
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
  }

  return (
    <Focusable
      ref={rowRef}
      style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, padding: '8px 0', width: '100%', overflowX: 'auto', overflowY: 'hidden' }}
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
      {/* consume t to avoid unused warning; placeholder for future a11y label */}
      <span aria-hidden='true' style={{ display: 'none' }}>{t('sort_manual')}</span>
    </Focusable>
  )
}

function HighlightMiniCard({
  appid, name, portraitUrl, heroUrl, featured, selected, grabbed, width, height, onToggle, onShiftLeft, onShiftRight, onPointerDown,
}: {
  appid: number; name: string; portraitUrl?: string; heroUrl?: string;
  featured: boolean; selected: boolean; grabbed?: boolean;
  width: number; height: number; onToggle: (() => void) | null;
  onShiftLeft?: (() => void) | null; onShiftRight?: (() => void) | null;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const urls = useMemo(() => {
    const list: string[] = []
    if (featured && appid > 0) {
      for (const u of getLandscapeUrls(appid)) list.push(u)
      if (heroUrl && !list.includes(heroUrl)) list.push(heroUrl)
    } else {
      if (appid > 0) {
        list.push(`/customimages/${appid}p.png`)
        list.push(`/customimages/${appid}p.jpg`)
      }
      if (portraitUrl && !list.includes(portraitUrl)) list.push(portraitUrl)
      if (heroUrl && !list.includes(heroUrl)) list.push(heroUrl)
      if (appid > 0) {
        for (const u of getPortraitFallbacks(appid)) if (!list.includes(u)) list.push(u)
      }
    }
    return list
  }, [appid, portraitUrl, heroUrl, featured])

  const imgRef = useRef<HTMLImageElement>(null)
  const idxRef = useRef(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    idxRef.current = 0
    setFailed(false)
    if (imgRef.current && urls[0]) imgRef.current.src = urls[0]
  }, [urls])

  const onErr = () => {
    idxRef.current += 1
    if (imgRef.current && idxRef.current < urls.length) imgRef.current.src = urls[idxRef.current]
    else setFailed(true)
  }

  const interactive = !!onToggle
  const noop = () => {}
  return (
    <Focusable
      className='ds-highlight-mini'
      data-appid={appid}
      onClick={interactive ? onToggle : noop}
      onOKButton={interactive ? onToggle : noop}
      onPointerDown={onPointerDown}
      style={{
        width, minWidth: width, height, flexShrink: 0,
        overflow: 'hidden', cursor: interactive ? 'pointer' : 'default',
        background: 'linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))',
        outline: grabbed ? '2px solid #ffd54f' : (selected ? '2px solid #4caf50' : '1px solid rgba(255,255,255,0.12)'),
        boxShadow: grabbed ? '0 0 0 3px rgba(255, 213, 79, 0.35)' : undefined,
        transition: 'width 0.15s ease, outline 0.1s ease, box-shadow 0.1s ease',
        position: 'relative',
        borderRadius: 0,
      }}
    >
      {failed || !urls[0] ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: featured ? 16 : 6, boxSizing: 'border-box', textAlign: 'center' }}>
          <span style={{ fontSize: featured ? 12 : 10, opacity: 0.6, wordBreak: 'break-word', lineHeight: 1.3 }}>{name}</span>
        </div>
      ) : (
        <img ref={imgRef} src={urls[0]} alt={name} loading='lazy' onError={onErr} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {selected && (
        <div style={{ position: 'absolute', top: 4, left: 4, lineHeight: 0 }} aria-hidden='true'>
          <CheckIcon />
        </div>
      )}
      {(onShiftLeft !== undefined || onShiftRight !== undefined) && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); onShiftLeft?.() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left: 1, top: '50%', transform: 'translateY(-50%)', width: 12, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onShiftLeft ? 'pointer' : 'default', opacity: onShiftLeft ? 1 : 0.35, pointerEvents: onShiftLeft ? 'auto' : 'none', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
            aria-hidden='true'
          >
            <svg width='8' height='14' viewBox='0 0 8 14' fill='none'>
              <path d='M6 1 L1.5 7 L6 13' stroke='#fff' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
          </div>
          <div
            onClick={(e) => { e.stopPropagation(); onShiftRight?.() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', right: 1, top: '50%', transform: 'translateY(-50%)', width: 12, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onShiftRight ? 'pointer' : 'default', opacity: onShiftRight ? 1 : 0.35, pointerEvents: onShiftRight ? 'auto' : 'none', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
            aria-hidden='true'
          >
            <svg width='8' height='14' viewBox='0 0 8 14' fill='none'>
              <path d='M2 1 L6.5 7 L2 13' stroke='#fff' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
          </div>
        </>
      )}
    </Focusable>
  )
}

export function EditShelfModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: Shelf }) {
  const { t, tabs: platformTabs, collections, actions } = controller
  const platform = usePlatform()
  const externalSources = useMemo(() => getExternalSources(), [])
  const initialSourceType = shelf.source.type as SourceType
  const initialFilter = normalizeFilter(shelf.source)
  const initialFilterGroup = getEffectiveFilterGroup(initialFilter)
  const [state, setState] = useState<EditableShelfState>({
    title: shelf.title,
    sourceType: initialSourceType,
    collectionId: shelf.source.type === 'collection' ? shelf.source.collectionId : String(collections[0]?.id ?? ''),
    tab: shelf.source.type === 'tab' ? shelf.source.tab : String(platformTabs[0]?.id ?? 'all'),
    externalSourceId: shelf.source.type === 'external' ? shelf.source.sourceId : (externalSources[0]?.id ?? ''),
    filter: initialFilter,
    filterGroup: initialFilterGroup,
    sort: (shelf as any).sort ?? 'alphabetical',
    limit: shelf.limit,
    matchNativeSize: shelf.matchNativeSize ?? false,
    highlightFirst: shelf.highlightFirst ?? false,
    highlightAll: shelf.highlightAll ?? false,
    highlightedAppIds: shelf.highlightedAppIds ?? [],
    manualOrder: (shelf as any).manualOrder ?? [],
    hideStatusLine: shelf.hideStatusLine ?? false,
    hideNewBadge: shelf.hideNewBadge ?? false,
    hideCompatIcons: shelf.hideCompatIcons ?? false,
    hideNonSteamBadge: shelf.hideNonSteamBadge ?? false,
  })
  const hasNonSteamBadges = useMemo(() => isNonSteamBadgesAvailable(), [])
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<EditTab>('source')
  const [resolvedIds, setResolvedIds] = useState<number[]>([])
  const [resolvedMeta, setResolvedMeta] = useState<Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>>(new Map())
  const [highlightPickerOpen, setHighlightPickerOpen] = useState((shelf.highlightedAppIds?.length ?? 0) > 0)
  const [alternatingMode, setAlternatingMode] = useState<'odd' | 'even' | null>(null)
  const prePatternHighlightsRef = useRef<number[] | null>(null)
  const activeSort = state.sourceType === 'filter' ? (state.filter.sort ?? 'alphabetical') : state.sort
  const isManualSort = activeSort === 'manual'
  const effectiveManualOrder = useMemo(() => {
    if (!isManualSort) return resolvedIds
    const idSet = new Set(resolvedIds)
    const out: number[] = []
    for (const id of state.manualOrder) if (idSet.has(id) && !out.includes(id)) out.push(id)
    for (const id of resolvedIds) if (!out.includes(id)) out.push(id)
    return out
  }, [isManualSort, resolvedIds, state.manualOrder])
  const reorderManual = (nextOrder: number[]) => setState((prev) => ({ ...prev, manualOrder: nextOrder }))

  const previewSource = useMemo(() => {
    if (state.sourceType === 'collection') return { type: 'collection' as const, collectionId: state.collectionId }
    if (state.sourceType === 'tab') return { type: 'tab' as const, tab: state.tab }
    if (state.sourceType === 'external') return { type: 'external' as const, sourceId: state.externalSourceId }
    const effectiveFilter = filterGroupToFilter(state.filterGroup, state.filter.sort)
    return { type: 'filter' as const, filter: effectiveFilter }
  }, [state.sourceType, state.collectionId, state.tab, state.externalSourceId, state.filterGroup, state.filter.sort])

  useEffect(() => {
    let cancelled = false
    setPreviewCount(null)
    const timer = setTimeout(() => {
      resolveShelfAppIds(previewSource, state.limit)
        .then((ids) => {
          if (cancelled) return
          setPreviewCount(ids.length)
          setResolvedIds(ids)
        })
        .catch(() => {
          if (cancelled) return
          setPreviewCount(0)
          setResolvedIds([])
        })
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [previewSource, state.limit])

  useEffect(() => {
    let cancelled = false
    if (!resolvedIds.length) { setResolvedMeta(new Map()); return }
    ;(async () => {
      const next = new Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>()
      for (const id of resolvedIds) {
        try {
          const meta = await platform.getAppMeta(id)
          next.set(id, { name: meta?.name || `App ${id}`, portraitUrl: meta?.portraitUrl, heroUrl: meta?.heroUrl })
        } catch { next.set(id, { name: `App ${id}` }) }
      }
      if (!cancelled) setResolvedMeta(next)
    })()
    return () => { cancelled = true }
  }, [platform, resolvedIds.join(',')])

  const allSourceTypes: SourceType[] = externalSources.length > 0 ? [...BASE_SOURCE_TYPES, 'external'] : BASE_SOURCE_TYPES
  const sourceTypeOptions: SingleDropdownOption[] = allSourceTypes.map((value) => ({
    data: value,
    label: value === 'collection' ? t('source_collection') : value === 'tab' ? t('source_tab') : value === 'external' ? t('source_external') : t('source_filter'),
  }))
  const tabOptions: SingleDropdownOption[] = platformTabs.map((item) => ({ data: item.id, label: item.name }))
  const collectionOptions: SingleDropdownOption[] = collections.map((item) => ({ data: item.id, label: item.name }))
  const externalOptions: SingleDropdownOption[] = externalSources.map((src) => ({ data: src.id, label: src.displayName }))
  const sortOptions = useMemo<SingleDropdownOption[]>(
    () => SORT_OPTIONS.map((item) => ({ data: item.value, label: t(item.labelKey) })),
    [t]
  )

  const changeSourceType = (type: SourceType) => {
    setState((prev) => {
      if (type === 'collection') {
        const first = collectionOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, collectionId: String(first?.data ?? ''), filter: normalizeFilter({ type: 'filter', filter: prev.filter }) }
      }
      if (type === 'tab') {
        const first = tabOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, tab: String(first?.data ?? 'all') }
      }
      if (type === 'external') {
        const first = externalOptions[0]
        const nextTitle = String(first?.label ?? t('newShelf'))
        return { ...prev, sourceType: type, title: nextTitle, externalSourceId: String(first?.data ?? '') }
      }
      return { ...prev, sourceType: type, filter: normalizeFilter({ type: 'filter', filter: prev.filter }) }
    })
    if (type !== 'filter' && activeTab === 'filters') setActiveTab('source')
  }

  const changeFilterGroup = (group: FilterGroup) => {
    setState((prev) => ({ ...prev, filterGroup: group }))
  }

  const setCollection = (value: string) => {
    const selected = collectionOptions.find((item) => String(item.data) === value)
    setState((prev) => ({ ...prev, collectionId: value, title: String(selected?.label ?? prev.title) }))
  }
  const setPlatformTab = (value: string) => {
    const selected = tabOptions.find((item) => String(item.data) === value)
    setState((prev) => ({ ...prev, tab: value, title: String(selected?.label ?? prev.title) }))
  }
  const handleSave = () => {
    closeModal?.();
    (async () => {
      const title = state.title.trim() || t('newShelf');
      const isManualSort = state.sort === 'manual' || state.filter.sort === 'manual'
      const patch: Partial<Shelf> = { title, limit: state.limit, matchNativeSize: state.matchNativeSize, highlightFirst: state.highlightFirst, highlightAll: state.highlightAll, highlightedAppIds: (highlightPickerOpen && state.highlightedAppIds.length) ? state.highlightedAppIds : undefined, manualOrder: (isManualSort && state.manualOrder.length) ? state.manualOrder : undefined, hideStatusLine: state.hideStatusLine, hideNewBadge: state.hideNewBadge, hideCompatIcons: state.hideCompatIcons, hideNonSteamBadge: state.hideNonSteamBadge };
      if (state.sourceType === 'collection') { patch.source = { type: 'collection', collectionId: state.collectionId }; patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined; }
      else if (state.sourceType === 'tab') {
        const selectedTab = platformTabs.find((pt) => pt.id === state.tab)
        patch.source = selectedTab?.source ?? { type: 'tab', tab: state.tab };
        patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined;
      }
      else if (state.sourceType === 'external') { patch.source = { type: 'external', sourceId: state.externalSourceId }; patch.sort = state.sort !== 'alphabetical' ? state.sort : undefined; }
      else patch.source = { type: 'filter', filter: filterGroupToFilter(state.filterGroup, state.filter.sort) };
      const ok = await actions.patchShelf(shelf.id, patch);
      logInfo("SETTINGS", "shelf updated", { shelfId: shelf.id, success: ok });
    })();
  }

  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      <ConfirmModal
        bAllowFullSize
        onCancel={closeModal}
        onEscKeypress={closeModal}
        strTitle={`${t('editing')}: ${shelf.title}`}
        onOK={handleSave}
        strOKButtonText={t('save')}
      >
        <Focusable onMenuButton={handleSave} onMenuActionDescription={t('save')} style={{ paddingBottom: 48 }}>
          <div style={{ padding: '4px 16px 1px' }} className='name-field'>
            <Field
              description={
                <>
                  <div style={{ paddingBottom: '6px' }}>{t('title')}</div>
                  <TextField
                    value={state.title}
                    onChange={(value: unknown) => setState((prev) => ({ ...prev, title: textFromDeckyChange(value) }))}
                  />
                </>
              }
            />
          </div>
          <div style={{ padding: '0 16px 8px', fontSize: '12px', color: previewCount === 0 ? '#f59e0b' : '#8b949e' }}>
            {previewCount === null ? t('preview_loading') : previewCount === 0 ? `⚠️ ${t('preview_empty')}` : t('preview_count', { count: previewCount })}
          </div>
          <div style={{ position: 'relative', height: 440, overflow: 'hidden' }}>
          <Tabs
            activeTab={activeTab}
            onShowTab={(id: string) => setActiveTab(id as EditTab)}
            tabs={[
              {
                id: 'source',
                title: t('edit_tab_source'),
                content: (
                  <div className='field-item-container' style={{ padding: '0 16px', maxHeight: 400, overflowY: 'auto', overflowX: 'hidden' }}>
                    <DropdownItem label={t('source')} rgOptions={sourceTypeOptions} selectedOption={state.sourceType} onChange={(opt: unknown) => changeSourceType(String(optionData(opt)) as SourceType)} bottomSeparator='thick' />
                    {state.sourceType === 'collection' && (
                      <DropdownItem label={t('source_collection')} rgOptions={collectionOptions} selectedOption={state.collectionId} onChange={(opt: unknown) => setCollection(String(optionData(opt)))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'tab' && (
                      <DropdownItem label={t('source_tab')} rgOptions={tabOptions} selectedOption={state.tab} onChange={(opt: unknown) => setPlatformTab(String(optionData(opt)))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'external' && externalOptions.length > 0 && (
                      <DropdownItem label={t('source_external')} rgOptions={externalOptions} selectedOption={state.externalSourceId} onChange={(opt: unknown) => setState((prev) => ({ ...prev, externalSourceId: String(optionData(opt)) }))} bottomSeparator='thick' />
                    )}
                    {state.sourceType === 'filter'
                      ? <DropdownItem label={t('filter_mode')} rgOptions={sortOptions} selectedOption={state.filter.sort ?? 'alphabetical'} onChange={(opt: unknown) => setState((prev) => ({ ...prev, filter: { ...prev.filter, sort: String(optionData(opt)) as ShelfFilter['sort'] } }))} bottomSeparator='thick' />
                      : <DropdownItem label={t('filter_mode')} rgOptions={sortOptions} selectedOption={state.sort} onChange={(opt: unknown) => setState((prev) => ({ ...prev, sort: String(optionData(opt)) }))} bottomSeparator='thick' />
                    }
                    <Field label={`${t('limit')} (${state.limit})`}>
                      <SliderField label='' value={state.limit} min={1} max={40} step={1} onChange={(value: number) => setState((prev) => ({ ...prev, limit: value }))} />
                    </Field>
                    {isManualSort && (
                      resolvedIds.length === 0
                        ? <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
                        : <ManualSortRow
                            order={effectiveManualOrder}
                            meta={resolvedMeta}
                            onReorder={reorderManual}
                            t={t}
                            highlightFirst={state.highlightFirst}
                            highlightAll={state.highlightAll}
                            highlightedAppIds={state.highlightedAppIds}
                            highlightPickerOpen={highlightPickerOpen}
                          />
                    )}
                  </div>
                ),
              },
              ...(state.sourceType === 'filter' ? [{
                id: 'filters',
                title: t('edit_tab_filters'),
                content: (
                  <div className='field-item-container' style={{ padding: '0 16px' }}>
                    <FilterPanel group={state.filterGroup} onChange={changeFilterGroup} />
                  </div>
                ),
              }] : []),
              {
                id: 'visual',
                title: t('edit_tab_visual'),
                content: (
                  <div className='field-item-container' style={{ padding: '0 16px', maxHeight: 400, overflowY: 'auto', overflowX: 'hidden' }}>
                    <ToggleField label={t('match_native_size')} checked={state.matchNativeSize} onChange={(value: boolean) => setState((prev) => ({ ...prev, matchNativeSize: value }))} />
                    <ToggleField label={t('highlight_first')} checked={state.highlightFirst} onChange={(value: boolean) => setState((prev) => ({ ...prev, highlightFirst: value }))} />
                    <ToggleField label={t('highlight_all')} checked={state.highlightAll} onChange={(value: boolean) => setState((prev) => ({ ...prev, highlightAll: value }))} />
                    <ToggleField
                      label={t('highlight_specific_games')}
                      checked={highlightPickerOpen}
                      onChange={(value: boolean) => {
                        setHighlightPickerOpen(value)
                        if (!value) setAlternatingMode(null)
                      }}
                    />
                    {highlightPickerOpen && (
                      <Focusable style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 0', width: '100%' }}>
                        {(['odd', 'even'] as const).map((mode) => {
                          const checked = alternatingMode === mode
                          const labelKey = mode === 'odd' ? 'highlight_pattern_odd_even' : 'highlight_pattern_even_odd'
                          const apply = () => {
                            if (alternatingMode === mode) {
                              // toggle off: restore snapshot from before the first pattern activation
                              const restore = prePatternHighlightsRef.current ?? []
                              prePatternHighlightsRef.current = null
                              setAlternatingMode(null)
                              setState((prev) => ({ ...prev, highlightedAppIds: restore }))
                              return
                            }
                            if (alternatingMode === null) {
                              // entering pattern mode for the first time — snapshot current picks
                              prePatternHighlightsRef.current = state.highlightedAppIds.slice()
                            }
                            setAlternatingMode(mode)
                            const startIdx = mode === 'odd' ? 0 : 1
                            const picks: number[] = []
                            for (let i = startIdx; i < effectiveManualOrder.length; i += 2) picks.push(effectiveManualOrder[i])
                            setState((prev) => ({ ...prev, highlightedAppIds: picks }))
                          }
                          return (
                            <DialogButton
                              key={mode}
                              onClick={apply}
                              onOKButton={apply}
                              style={{ width: '100%', minHeight: 44, padding: '8px 6px', fontSize: 13, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '18px' }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ width: 14, textAlign: 'center', flexShrink: 0, color: checked ? '#4caf50' : 'rgba(255,255,255,0.3)' }}>{checked ? '✓' : '·'}</span>
                                <span>{t(labelKey as any)}</span>
                              </span>
                            </DialogButton>
                          )
                        })}
                      </Focusable>
                    )}
                    {resolvedIds.length === 0 ? (
                      <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
                    ) : (
                      <HighlightRow>
                        {effectiveManualOrder.map((id, idx) => {
                          const inHighlighted = state.highlightedAppIds.includes(id)
                          const selected = highlightPickerOpen && inHighlighted
                          const featured = state.highlightAll
                            || (state.highlightFirst && idx === 0)
                            || selected
                          const h = 80
                          const w = featured ? 168 : 54
                          const meta = resolvedMeta.get(id)
                          const toggle = highlightPickerOpen
                            ? () => {
                                setAlternatingMode(null)
                                prePatternHighlightsRef.current = null
                                setState((prev) => ({
                                  ...prev,
                                  highlightedAppIds: prev.highlightedAppIds.includes(id)
                                    ? prev.highlightedAppIds.filter((x) => x !== id)
                                    : [...prev.highlightedAppIds, id],
                                }))
                              }
                            : null
                          return (
                            <HighlightMiniCard
                              key={id}
                              appid={id}
                              name={meta?.name ?? `App ${id}`}
                              portraitUrl={meta?.portraitUrl}
                              heroUrl={meta?.heroUrl}
                              featured={featured}
                              selected={selected}
                              width={w}
                              height={h}
                              onToggle={toggle}
                            />
                          )
                        })}
                      </HighlightRow>
                    )}
                  </div>
                ),
              },
              {
                id: 'display',
                title: t('edit_tab_display'),
                content: (
                  <div className='field-item-container' style={{ padding: '0 16px' }}>
                    <ToggleField label={t('hide_status_line')} checked={state.hideStatusLine} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideStatusLine: value }))} />
                    <ToggleField label={t('hide_new_badge')} checked={state.hideNewBadge} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideNewBadge: value }))} />
                    <ToggleField label={t('hide_compat_icons')} checked={state.hideCompatIcons} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideCompatIcons: value }))} />
                    {hasNonSteamBadges && (
                      <ToggleField label={t('hide_non_steam_badge')} checked={state.hideNonSteamBadge} onChange={(value: boolean) => setState((prev) => ({ ...prev, hideNonSteamBadge: value }))} />
                    )}
                  </div>
                ),
              },
            ]}
          />
          </div>
        </Focusable>
      </ConfirmModal>
    </div>
  )
}
