import { useEffect, useMemo, useRef, useState } from 'react'
import { Focusable } from '../../../../runtime/host/decky'
import { ShelfRow } from '../../../shelf/ShelfRow'
import type { DeckRowItem } from '../../../shelf/types'
import { shouldShowMoreCard, shouldShowRefreshCard } from '../../../shelf/trailingCards'
import type { PlatformAppMeta } from '../../../../runtime/platform'
import { computeCenteredScrollLeft } from '../../../../core/scrollUtils'
import { getAllAppOverviews, getLocalLibraryAppIds } from '../../../../steam'
import { normalizeTitleForMatch } from '../../../../steam/dedupe'
import { getCurrentSettings } from '../../../../store/settingsStore'
import { DIR_LEFT, DIR_RIGHT, HOLD_MS } from './constants'
import { findCardIndexAtX, reorderIds, readPriceCache } from './dragReorder'

const NEW_GAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
// Featured cards are 3.21× wider, the ratio the home shelf uses for hero art.
const PREVIEW_CARD_W = 78
const PREVIEW_ART_H = 110
const FEATURED_CARD_W = Math.round(PREVIEW_CARD_W * 3.21)

function grabbedDir(button: number): number {
  if (button === DIR_LEFT) return -1
  if (button === DIR_RIGHT) return 1
  return 0
}
function grabbedKeyAction(key: string): 'left' | 'right' | 'refocus' | null {
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  if (key === 'ArrowUp' || key === 'ArrowDown') return 'refocus'
  return null
}

// Directional presses shift the grabbed card instead of moving focus.
function patchGrabbedDispatch(
  ctrl: any,
  shiftGrabbed: (d: number) => void,
  refocusGrabbed: () => void,
): (() => void) | null {
  try {
    if (!ctrl || typeof ctrl.DispatchVirtualButtonClick !== 'function') return null
    const orig = ctrl.DispatchVirtualButtonClick.bind(ctrl)
    ctrl.DispatchVirtualButtonClick = (button: number, ...args: any[]) => {
      const dir = grabbedDir(button)
      if (dir) { shiftGrabbed(dir); return }
      if (button === 9 || button === 10) { requestAnimationFrame(refocusGrabbed); return }
      return orig(button, ...args)
    }
    return () => { try { ctrl.DispatchVirtualButtonClick = orig } catch {} }
  } catch { return null }
}

function nameFromStore(as: any, id: number): string | null {
  try {
    const ov = as?.GetAppOverviewByAppID?.(id)
    const n = (ov as any)?.display_name ?? (ov as any)?.name
    return typeof n === 'string' && n ? n : null
  } catch { return null }
}
function lookupOwnedName(id: number): string | null {
  const opener: any = (globalThis as any).opener
  const candidates = [(globalThis as any).appStore, opener?.appStore, opener?.AppStore].filter(Boolean)
  for (const as of candidates) {
    const n = nameFromStore(as, id)
    if (n) return n
  }
  return null
}

function findOnlineToggleSource(s: any): any {
  if (s.type === 'wishlist' || s.type === 'store') return s
  if (s.type === 'composite' && Array.isArray(s.sources)) {
    return s.sources.find((c: any) => c?.type === 'wishlist' || c?.type === 'store') ?? null
  }
  return null
}

function readGlobalHideFlags(cur: any): { hideOwned: boolean; hideOwnedNonSteam: boolean; hideOwnedCloud: boolean } {
  return {
    hideOwned: cur?.onlineHideOwnedGames === true,
    hideOwnedNonSteam: cur?.onlineHideOwnedNonSteam === true,
    hideOwnedCloud: cur?.onlineHideOwnedNonSteamCloud === true,
  }
}

function resolveEffectiveNonSteamHide(excludeOwned: boolean, tgls: any, global: ReturnType<typeof readGlobalHideFlags>): boolean {
  const shelfNonSteam = excludeOwned && tgls?.excludeOwnedNonSteam === true
  return (global.hideOwned && global.hideOwnedNonSteam) || shelfNonSteam
}

function resolveEffectiveCloudHide(effectiveNonSteam: boolean, tgls: any, globalHideOwnedCloud: boolean): boolean {
  if (!effectiveNonSteam) return false
  const perShelf = tgls?.hideOwnedNonSteamCloud
  return perShelf === true || (perShelf === undefined && globalHideOwnedCloud)
}

function namesFromOwnedSet(ownedSet: Set<number>): Set<string> {
  const names = new Set<string>()
  for (const id of ownedSet) {
    const n = lookupOwnedName(id)
    if (!n) continue
    const k = normalizeTitleForMatch(n)
    if (k) names.add(k)
  }
  return names
}

function appOverviewIdAndName(a: unknown): { id: number; name: string } {
  const rec = a as { appid?: unknown; display_name?: unknown; name?: unknown } | null
  const n = rec?.display_name ?? rec?.name
  return { id: Number(rec?.appid), name: typeof n === 'string' ? n : '' }
}

async function mergeAppOverviewNames(names: Set<string>, ownedSet: Set<number>): Promise<void> {
  try {
    const apps = await getAllAppOverviews()
    for (const a of apps) {
      const { id, name } = appOverviewIdAndName(a)
      if (!ownedSet.has(id) || !name) continue
      const k = normalizeTitleForMatch(name)
      if (k) names.add(k)
    }
  } catch {}
}

type OwnedHideState = { isCompositeShelf: boolean; effectiveNonSteam: boolean; effectiveCloud: boolean } | null

function computeOwnedHideState(shelfSource: unknown): OwnedHideState {
  const s: any = shelfSource
  if (!s || typeof s !== 'object') return null
  const tgls = findOnlineToggleSource(s)
  if (!tgls) return null
  const excludeOwned = tgls?.excludeOwned === true
  const cur = (() => { try { return getCurrentSettings() } catch { return null } })()
  const global = readGlobalHideFlags(cur)
  if (!global.hideOwned && !excludeOwned) return null
  const effectiveNonSteam = resolveEffectiveNonSteamHide(excludeOwned, tgls, global)
  const effectiveCloud = resolveEffectiveCloudHide(effectiveNonSteam, tgls, global.hideOwnedCloud)
  return { isCompositeShelf: s.type === 'composite', effectiveNonSteam, effectiveCloud }
}

function buildHiddenSet(hiddenAppIds: number[] | undefined): Set<number> | null {
  return hiddenAppIds && hiddenAppIds.length ? new Set(hiddenAppIds) : null
}

function shouldHideOwnedCard(
  id: number,
  ctx: {
    ownedHideState: OwnedHideState
    ownedAppIds: Set<number> | null
    ownedNames: Set<string> | null
    meta: Map<number, PlatformAppMeta>
    hasLocalOverview: (id: number) => boolean
  },
): boolean {
  const { ownedHideState, ownedAppIds, ownedNames, meta, hasLocalOverview } = ctx
  if (!ownedHideState || !(ownedAppIds || ownedNames)) return false
  const eligible = ownedHideState.isCompositeShelf ? !hasLocalOverview(id) : true
  if (!eligible) return false
  if (ownedAppIds?.has(id)) return true
  return matchesOwnedName(meta, id, ownedNames)
}

function matchesOwnedName(meta: Map<number, PlatformAppMeta>, id: number, ownedNames: Set<string> | null): boolean {
  if (!ownedNames) return false
  const name = meta.get(id)?.name
  const isFallback = !name || /^App \d+$/.test(name) || /^#\d+$/.test(name)
  if (isFallback) return false
  const key = normalizeTitleForMatch(name)
  return !!key && ownedNames.has(key)
}

// Mark precedence: grabbed, hidden, highlight, added.
function resolveCardFlags(ctx: {
  m: PlatformAppMeta
  id: number
  cardIdx: number
  manualSortMode: boolean
  grabbedAppid: number | null
  hiddenSet: Set<number> | null
  removableSet: Set<number> | null | undefined
  highlightAll: boolean
  highlightFirst: boolean
  highlightedSet: Set<number>
}): { isNew: boolean; mark: DeckRowItem['selectionMark'] } {
  const { m, id, cardIdx, manualSortMode, grabbedAppid, hiddenSet, removableSet, highlightAll, highlightFirst, highlightedSet } = ctx
  const isNew = m.addedTimestamp ? (Date.now() - m.addedTimestamp * 1000) < NEW_GAME_WINDOW_MS : false
  const isGrabbed = manualSortMode && grabbedAppid === id
  const isHidden = !!hiddenSet?.has(id)
  const isAdded = !!removableSet?.has(id)
  const isHighlighted = highlightAll || (highlightFirst && cardIdx === 0) || highlightedSet.has(id)
  return { isNew, mark: resolveSelectionMark({ isGrabbed, isHidden, isHighlighted, isAdded }) }
}

function resolveSelectionMark(flags: { isGrabbed: boolean; isHidden: boolean; isHighlighted: boolean; isAdded: boolean }): DeckRowItem['selectionMark'] {
  if (flags.isGrabbed) return 'grabbed'
  if (flags.isHidden) return 'hidden'
  if (flags.isHighlighted) return 'highlight'
  if (flags.isAdded) return 'added'
  return undefined
}

function makeToggleHandler(
  id: number,
  manualSortMode: boolean,
  selectionMode: unknown,
  setGrabbedAppid: (fn: (g: number | null) => number | null) => void,
  onToggleSelection: ((id: number) => void) | undefined,
): (() => void) | undefined {
  if (manualSortMode) return () => setGrabbedAppid((g) => (g === id ? null : id))
  return selectionMode ? () => onToggleSelection?.(id) : undefined
}

type SyntheticCardInput = {
  position: number
  image?: string
  text?: string
  link?: { type: 'app' | 'url'; value: string }
  size: 'normal' | 'featured'
  alpha?: number
  placeholder?: boolean
  heroImage?: string
  shadowMode?: 'never' | 'onFocus' | 'always'
}

function spliceSyntheticCards(out: DeckRowItem[], syntheticCards: SyntheticCardInput[] | undefined): void {
  if (!syntheticCards?.length) return
  const indexed = syntheticCards.map((c, origIdx) => ({ c, origIdx }))
  indexed.sort((a, b) => (a.c.position ?? 0) - (b.c.position ?? 0))
  for (const { c, origIdx } of indexed) {
    const pos = Math.max(0, Math.min(out.length, Number(c.position) || 0))
    out.splice(pos, 0, {
      id: -origIdx - 1,
      name: c.text ?? '',
      synthetic: {
        image: c.image,
        text: c.text,
        link: c.link,
        size: c.size === 'featured' ? 'featured' : 'normal',
        alpha: c.alpha,
        placeholder: c.placeholder === true,
        heroImage: (c as any).heroImage,
        shadowMode: (c as any).shadowMode,
      },
    })
  }
}

const PREVIEW_STYLE_TAG = `
[data-ds-preview-row="1"] .ds-card-art:has(> .ds-more-card-text) { padding: 6px !important; }
[data-ds-preview-row="1"] .ds-more-card-text { font-size: 10px !important; line-height: 1.2 !important; }
[data-ds-preview-row="1"] .ds-refresh-card svg { width: 22px !important; height: 22px !important; }
[data-ds-preview-row="1"] .ds-card-status-icon svg { width: 11px !important; height: 11px !important; }
[data-ds-preview-row="1"] .ds-card-status { font-size: 11px !important; }
[data-ds-preview-row="1"] .ds-card-label-name { font-size: 12px !important; line-height: 1.2 !important; }
[data-ds-preview-row="1"] .ds-card,
[data-ds-preview-row="1"] .ds-card *,
[data-ds-preview-row="1"] .ds-card.ds-card--featured,
[data-ds-preview-row="1"] .ds-card.ds-card--featured *,
[data-ds-preview-row="1"] .ds-card.is-selected,
[data-ds-preview-row="1"] .ds-card:hover,
[data-ds-preview-row="1"] .ds-card:focus,
[data-ds-preview-row="1"] .ds-card.gpfocus {
  outline: 0 !important;
  outline-color: transparent !important;
  border: 0 !important;
  border-color: transparent !important;
  transform: none !important;
}
[data-ds-preview-row="1"] .ds-card:hover,
[data-ds-preview-row="1"] .ds-card:focus,
[data-ds-preview-row="1"] .ds-card.gpfocus { box-shadow: rgba(0, 0, 0, 0.5) 0px 8px 16px 0px !important; filter: brightness(1) !important; z-index: 12; }
[data-ds-preview-row="1"] .ds-card::after,
[data-ds-preview-row="1"] .ds-card:hover::after,
[data-ds-preview-row="1"] .ds-card:focus::after,
[data-ds-preview-row="1"] .ds-card.gpfocus::after { animation: none !important; opacity: 0 !important; }
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-noshadow,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-noshadow:hover,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-noshadow:focus,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-noshadow.gpfocus { box-shadow: none !important; }
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-shadow-focus-only { box-shadow: none !important; }
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-shadow-focus-only:hover,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-shadow-focus-only:focus,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-shadow-focus-only.gpfocus { box-shadow: rgba(0, 0, 0, 0.5) 0px 8px 16px 0px !important; }
[data-ds-preview-row="1"] .ds-new-badge { font: 700 8px/13px "Motiva Sans", Helvetica, Arial, sans-serif !important; padding: 1px 6px !important; letter-spacing: 0.3px !important; }
[data-ds-preview-row="1"] .ds-new-badge-band { height: 16px !important; }
[data-ds-preview-row="1"] .ds-card-badge-host--inline { top: 0 !important; height: 16px !important; z-index: 9999 !important; }
[data-ds-preview-row="1"] .ds-card-badge-host--inline .ds-new-badge-band,
[data-ds-preview-row="1"] .ds-card-badge-host--inline .ds-new-badge { z-index: 9999 !important; position: relative !important; }
`

export interface ShelfPreviewProps {
  t: (...args: any[]) => any
  ids: number[]
  meta: Map<number, PlatformAppMeta>
  limit?: number
  shelfSource?: any
  shelfSort?: string | string[]
  hideStatusLine: boolean
  hideNewBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
  hideGameNames: boolean
  hideInstallIndicator: boolean
  hideSeeMore: boolean
  hideRefreshCard: boolean
  highlightFirst: boolean
  highlightAll: boolean
  highlightedAppIds: number[]
  hiddenAppIds?: number[]
  onRefresh?: () => void
  onFocusedIndexChange?: (idx: number) => void
  syntheticCards?: Array<{
    position: number;
    image?: string;
    text?: string;
    link?: { type: 'app' | 'url'; value: string };
    size: 'normal' | 'featured';
    alpha?: number;
    placeholder?: boolean;
    heroImage?: string;
    shadowMode?: 'never' | 'onFocus' | 'always';
  }>
  selectionMode?: 'highlight' | 'hidden'
  selectionSet?: Set<number>
  onToggleSelection?: (appid: number) => void
  removableSet?: Set<number>
  onRemoveCard?: (appid: number) => void
  manualSortMode?: boolean
  onReorder?: (next: number[]) => void
}

export function ShelfPreview({
  t, ids, meta, limit, shelfSource, shelfSort,
  hideStatusLine, hideNewBadge, hideCompatIcons, hideNonSteamBadge,
  hideGameNames, hideInstallIndicator, hideSeeMore, hideRefreshCard,
  highlightFirst, highlightAll, highlightedAppIds, hiddenAppIds, onRefresh, onFocusedIndexChange,
  syntheticCards, selectionMode, selectionSet, onToggleSelection,
  removableSet, onRemoveCard,
  manualSortMode = false, onReorder,
}: ShelfPreviewProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const highlightedSet = useMemo(() => new Set(highlightedAppIds), [highlightedAppIds.join(',')])
  const [grabbedAppid, setGrabbedAppid] = useState<number | null>(null)
  const grabbedRef = useRef<number | null>(null)
  const cappedOrderRef = useRef<number[]>([])
  useEffect(() => { grabbedRef.current = grabbedAppid }, [grabbedAppid])
  const gameOnlyIds = useMemo(() => ids.filter((id) => id >= 0), [ids])
  // Menu-added games are never cut by the limit.
  const cappedIds = useMemo(() => {
    if (typeof limit !== 'number' || limit < 0) return gameOnlyIds
    if (!removableSet?.size) return gameOnlyIds.slice(0, limit)
    const sourceSide: number[] = []
    const removableSide: number[] = []
    for (const id of gameOnlyIds) {
      if (removableSet.has(id)) removableSide.push(id)
      else sourceSide.push(id)
    }
    return [...sourceSide.slice(0, limit), ...removableSide]
  }, [gameOnlyIds, limit, removableSet])
  const trailingInput = { source: shelfSource, sort: shelfSort, hideSeeMore, hideRefreshCard }
  const showRefresh = shelfSource ? shouldShowRefreshCard(trailingInput) : !hideRefreshCard
  const showMore = shelfSource ? shouldShowMoreCard(trailingInput) : !hideSeeMore

  // Discount badges only on online shelves; elsewhere the game is already owned.
  const isOnlineShelfSource = (() => {
    const s: any = shelfSource
    if (!s || typeof s !== 'object') return false
    if (s.type === 'wishlist' || s.type === 'store') return true
    if (s.type === 'composite' && Array.isArray(s.sources)) {
      return s.sources.some((c: any) => c?.type === 'wishlist' || c?.type === 'store')
    }
    return false
  })()
  const ownedHideState = useMemo(() => computeOwnedHideState(shelfSource), [shelfSource])
  const [ownedAppIds, setOwnedAppIds] = useState<Set<number> | null>(null)
  const [ownedNames, setOwnedNames] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!ownedHideState) { setOwnedAppIds(null); setOwnedNames(null); return }
    const { effectiveNonSteam, effectiveCloud } = ownedHideState
    const ownedSet = getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud)
    setOwnedAppIds(ownedSet)
    // Per-id lookup: getAllAppOverviews() can drop non-Steam shortcuts, which breaks the name dedup.
    let cancelled = false
    void (async () => {
      const names = namesFromOwnedSet(ownedSet)
      await mergeAppOverviewNames(names, ownedSet)
      if (cancelled) return
      setOwnedNames(names)
    })()
    return () => { cancelled = true }
  }, [ownedHideState])
  const rowItems = useMemo<DeckRowItem[]>(() => {
    const priceCache = readPriceCache(isOnlineShelfSource)
    const readDiscount = (id: number): number | undefined => {
      if (!isOnlineShelfSource) return undefined
      const d = priceCache?.[id]?.data?.discount
      return typeof d === 'number' && d > 0 ? d : undefined
    }
    const hiddenSet = buildHiddenSet(hiddenAppIds)
    const out: DeckRowItem[] = []
    let cardIdx = -1
    const hasLocalOverview = (id: number): boolean => {
      try { return !!(globalThis as any).appStore?.GetAppOverviewByAppID?.(id) }
      catch { return false }
    }
    for (const id of cappedIds) {
      if (shouldHideOwnedCard(id, { ownedHideState, ownedAppIds, ownedNames, meta, hasLocalOverview })) continue
      // Render a placeholder while meta loads so menu-added games show at once.
      const m = meta.get(id) ?? { appid: id, name: `#${id}` } as PlatformAppMeta
      cardIdx++
      const { isNew, mark } = resolveCardFlags({ m, id, cardIdx, manualSortMode, grabbedAppid, hiddenSet, removableSet, highlightAll, highlightFirst, highlightedSet })
      out.push({
        id,
        appid: id,
        name: m.name,
        portraitUrl: m.portraitUrl,
        heroUrl: m.heroUrl,
        isInstalled: m.installed,
        isSteam: m.isSteam,
        deckCompatCategory: m.deckCompatCategory,
        controllerSupport: m.controllerSupport,
        playtimeMinutes: m.playtimeMinutes,
        updatePending: m.updatePending,
        isNew,
        discountPercent: readDiscount(id),
        selectionMark: mark,
        onToggleSelection: makeToggleHandler(id, manualSortMode, selectionMode, setGrabbedAppid, onToggleSelection),
      })
    }
    if (showRefresh) out.push({ id: '__refresh', name: t('refresh'), isRefresh: true, onActivate: onRefresh })
    if (showMore) out.push({ id: '__more', name: t('view_more'), isMoreLink: true })
    spliceSyntheticCards(out, syntheticCards)
    return out
  }, [cappedIds.join(','), meta, showRefresh, showMore, onRefresh, t, JSON.stringify(syntheticCards ?? null), selectionMode, selectionSet, onToggleSelection, isOnlineShelfSource, manualSortMode, grabbedAppid, hiddenAppIds?.join(','), removableSet, highlightedSet, highlightAll, highlightFirst, ownedHideState, ownedAppIds, ownedNames])

  // Instant scroll keeps the focused card in view; fast L/R input loses it otherwise.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    let raf: number | null = null
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      const card = target?.closest('.ds-card') as HTMLElement | null
      if (!card || !row.contains(card)) return
      try {
        const cards = Array.from(row.querySelectorAll('.ds-card'))
        const idx = cards.indexOf(card)
        if (idx >= 0) onFocusedIndexChange?.(idx)
      } catch {}
      if (raf !== null) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = null
        try {
          card.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest', inline: 'center' })
        } catch {
          try { card.scrollIntoView({ block: 'nearest', inline: 'center' }) } catch {}
        }
      })
    }
    row.addEventListener('focusin', onFocusIn)
    return () => {
      row.removeEventListener('focusin', onFocusIn)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [onFocusedIndexChange])

  const orderableIds = useMemo(() => {
    const out: number[] = []
    for (const it of rowItems) {
      if (it.isRefresh || it.isMoreLink) continue
      if (typeof it.id === 'number') out.push(it.id)
    }
    return out
  }, [rowItems])
  useEffect(() => { cappedOrderRef.current = orderableIds }, [orderableIds])

  const findCardEl = (appid: number) => {
    const rowEl = rowRef.current
    if (!rowEl || !appid) return null
    return rowEl.querySelector<HTMLElement>(`.ds-card[data-appid="${appid}"]`)
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
  const refocusGrabbed = () => {
    const id = grabbedRef.current
    if (id === null) return
    const el = findCardEl(id)
    try { el?.focus?.() } catch {}
  }
  const shiftGrabbed = (delta: number) => {
    if (!manualSortMode || !onReorder) return
    const id = grabbedRef.current
    if (id === null) return
    const base = cappedOrderRef.current.slice()
    const from = base.indexOf(id)
    if (from === -1) return
    const to = Math.max(0, Math.min(base.length - 1, from + delta))
    if (to === from) return
    const [picked] = base.splice(from, 1)
    base.splice(to, 0, picked)
    cappedOrderRef.current = base
    onReorder(base)
    // Two frames: one for React to commit, one for layout to settle before focus follows.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        refocusGrabbed()
        if (typeof picked === 'number') centerCard(picked)
      })
    })
  }

  useEffect(() => {
    if (!manualSortMode || grabbedAppid === null) return
    const rowEl = rowRef.current
    if (!rowEl) return
    const doc = rowEl.ownerDocument ?? document
    const ctrl: any = (globalThis as any).FocusNavController
      ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller
    const restoreDispatch = patchGrabbedDispatch(ctrl, shiftGrabbed, refocusGrabbed)
    requestAnimationFrame(refocusGrabbed)
    const onDir = (e: Event) => {
      const btn = (e as CustomEvent<any>).detail?.button
      try { (e as any).stopImmediatePropagation?.(); e.preventDefault?.() } catch {}
      const dir = grabbedDir(btn)
      if (dir) { shiftGrabbed(dir); return }
      requestAnimationFrame(refocusGrabbed)
    }
    const onKey = (e: KeyboardEvent) => {
      const action = grabbedKeyAction(e.key)
      if (!action) return
      e.stopPropagation(); e.preventDefault()
      if (action === 'refocus') { requestAnimationFrame(refocusGrabbed); return }
      shiftGrabbed(action === 'left' ? -1 : +1)
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
      restoreDispatch?.()
    }
  }, [manualSortMode, grabbedAppid])

  const holdTimerRef = useRef<any>(null)
  const pointerHeldRef = useRef(false)
  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!manualSortMode || !onReorder) return
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
      const idx = findCardIndexAtX(cards, ev.clientX)
      if (idx === -1) return
      const current = grabbedRef.current
      if (current === null) return
      const cardId = Number(cards[idx].getAttribute('data-appid')) || 0
      const next = reorderIds(cappedOrderRef.current, current, cardId)
      if (!next) return
      cappedOrderRef.current = next
      onReorder(next)
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

  return (
    <div data-ds-shelf-preview="1">
      <style>{PREVIEW_STYLE_TAG}</style>
      <Focusable
        ref={rowRef}
        data-ds-preview-row="1"
        noFocusRing
        onPointerDown={onRowPointerDown}
        onFocus={(e: any) => {
          if (e.target === e.currentTarget) {
            requestAnimationFrame(() => {
              const first = rowRef.current?.querySelector<HTMLElement>('.ds-card')
              if (first) first.focus()
            })
          }
        }}
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          overflowX: 'auto',
          overflowY: 'visible',
          scrollbarWidth: 'none',
          // Bottom padding keeps the labels from clipping; side padding fits the widest selection ring.
          padding: '8px 6px 56px',
          alignItems: 'flex-start',
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
          hideStatusLine={hideStatusLine}
          hideNewBadge={hideNewBadge}
          hideCompatIcons={hideCompatIcons}
          hideNonSteamBadge={hideNonSteamBadge}
          hideGameName={hideGameNames}
          hideInstallIndicator={hideInstallIndicator}
          refreshInteractive={!!onRefresh}
          moreInteractive={false}
          inlineBadges
          previewMode
          removableSet={removableSet}
          onRemoveCard={onRemoveCard}
        />
      </Focusable>
    </div>
  )
}
