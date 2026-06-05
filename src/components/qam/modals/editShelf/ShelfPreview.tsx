/* eslint-disable complexity */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Focusable } from '@decky/ui'
import { ShelfRow } from '../../../shelf/ShelfRow'
import type { DeckRowItem } from '../../../shelf/types'
import { shouldShowMoreCard, shouldShowRefreshCard } from '../../../shelf/trailingCards'
import type { PlatformAppMeta } from '../../../../runtime/platform'
import { computeCenteredScrollLeft } from '../../../../core/scrollUtils'
import { getAllAppOverviews, getLocalLibraryAppIds } from '../../../../steam'
import { normalizeTitleForMatch } from '../../../../steam/dedupe'
import { getCurrentSettings } from '../../../../store/settingsStore'
import { DIR_LEFT, DIR_RIGHT, HOLD_MS } from './constants'

const NEW_GAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
// Portrait card. Featured cards are 3.21× wider — same ratio the home shelf
// uses to keep landscape hero art at the right ~2.14:1 aspect.
const PREVIEW_CARD_W = 78
const PREVIEW_ART_H = 110
const FEATURED_CARD_W = Math.round(PREVIEW_CARD_W * 3.21)

// Scoped overrides — keep the modal preview visually flat (no native scale,
// no theme accent ring, no animated glow) while preserving the focus drop
// shadow + label fade behaviour the home shelf uses. Padding is gated to the
// text-only cards (More/Refresh share the `ds-more-card-text` child); game
// cards stay at zero padding so the image fills the focus area edge-to-edge.
const PREVIEW_STYLE_TAG = `
[data-ds-preview-row="1"] .ds-card-art:has(> .ds-more-card-text) { padding: 6px !important; }
[data-ds-preview-row="1"] .ds-more-card-text { font-size: 10px !important; line-height: 1.2 !important; }
[data-ds-preview-row="1"] .ds-refresh-card svg { width: 22px !important; height: 22px !important; }
[data-ds-preview-row="1"] .ds-card-status-icon svg { width: 11px !important; height: 11px !important; }
[data-ds-preview-row="1"] .ds-card-status { font-size: 11px !important; }
[data-ds-preview-row="1"] .ds-card-label-name { font-size: 12px !important; line-height: 1.2 !important; }
/* Strip every native/theme border + outline + scale on every state, on the
   card itself AND any nested element (the native landscape class draws its
   accent border on a child of the focused card, so the parent-only selector
   wasn't reaching it). */
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
/* Synthetic cards with placeholder=false: kill the drop-shadow in every
   state so transparent decoration images don't have a phantom card-shape
   shadow around them in the preview. Home shelf does the same via the
   .ds-card--synthetic-noshadow rule in shelfStyles.ts. */
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-noshadow,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-noshadow:hover,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-noshadow:focus,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-noshadow.gpfocus { box-shadow: none !important; }
/* "Shadow only on focus" mode in preview: suppress at idle, keep the
   preview focus shadow on focus/hover. */
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-shadow-focus-only { box-shadow: none !important; }
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-shadow-focus-only:hover,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-shadow-focus-only:focus,
[data-ds-preview-row="1"] .ds-card.ds-card--synthetic-shadow-focus-only.gpfocus { box-shadow: rgba(0, 0, 0, 0.5) 0px 8px 16px 0px !important; }
/* Badge sizing — the home defaults to 10 px / 24 px band assuming
   200+ px cards; the preview cards are 78 px wide, so the same
   band looks chunky and eats roughly 1/3 of the card height.
   Scale font + padding + band height down proportionally. */
[data-ds-preview-row="1"] .ds-new-badge { font: 700 8px/13px "Motiva Sans", Helvetica, Arial, sans-serif !important; padding: 1px 6px !important; letter-spacing: 0.3px !important; }
[data-ds-preview-row="1"] .ds-new-badge-band { height: 16px !important; }
/* Preview badge — kept inside the card top edge (top:0) so the modal
   stays bounded (the earlier overflow:visible cascade let the focus
   scale leak past the modal). z:9999 on the host AND on every descendant
   so it wins inside the focused card's z:12 stacking context against
   the position:absolute .ds-card-art fill that otherwise covers it. */
[data-ds-preview-row="1"] .ds-card-badge-host--inline { top: 0 !important; height: 16px !important; z-index: 9999 !important; }
[data-ds-preview-row="1"] .ds-card-badge-host--inline .ds-new-badge-band,
[data-ds-preview-row="1"] .ds-card-badge-host--inline .ds-new-badge { z-index: 9999 !important; position: relative !important; }
/* The band absolutely-positions itself at top:0 of the host. With the
   host at top:0 (no overhang), the band sits at the card's top edge
   and the bottom-of-card art is fully visible. */`

export interface ShelfPreviewProps {
  t: (k: any, opts?: any) => string
  ids: number[]
  meta: Map<number, PlatformAppMeta>
  // Cap shown cards to the configured shelf limit. Without it the preview
  // outpaces the resolver on `state.limit` changes between tabs.
  limit?: number
  // Source + sort drive whether the trailing MoreCard / RefreshCard render
  // (refreshable smart, random non-smart, etc.) — same rules as Shelf.tsx.
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
  // Hidden ids drive the always-on 'hidden' overlay (red ring + dark
  // tint + ✕). Even when the hidden picker is CLOSED, hidden cards
  // appear in the preview with this overlay so the user can see which
  // games are hidden across every tab. Home shelf still filters them
  // out (Shelf.tsx applies the filter at the resolver level).
  hiddenAppIds?: number[]
  // When provided, the trailing RefreshCard is focusable + clickable and
  // invokes this callback to re-resolve the preview's app ids (matches the
  // behaviour the home shelf gives the user).
  onRefresh?: () => void
  // Emitted whenever focus moves between cards in the preview row.
  // Drives the Decoration tab's "insert at currently focused slot"
  // behaviour without coupling that tab to the preview's DOM.
  onFocusedIndexChange?: (idx: number) => void
  // Synthetic decoration cards to interleave at their `position` slots.
  // Same shape Shelf.tsx splices on the home — kept identical here so the
  // preview matches the real shelf 1:1.
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
  // Editor picker mode: when set, every card carries an overlay marker
  // (`highlight` blue tint + ★ / `hidden` dark tint + ✕) and its
  // activate handler toggles membership in the selection set instead of
  // opening the game. Lets the highlight + hidden picker tabs render
  // through the same ShelfPreview as everywhere else, only adding the
  // overlay + click rebinding for their specific affordance.
  selectionMode?: 'highlight' | 'hidden'
  selectionSet?: Set<number>
  onToggleSelection?: (appid: number) => void
  // X-button "Remove from shelf": appids in this set are the menu-added
  // games (manualOrder entries NOT in the resolved source). They get
  // the remove action AND are always kept by the limit cap below so
  // they appear in every preview tab — not just the Source tab whose
  // ManualSortRow renders with no cap. Modal owns the callback so the
  // removal updates local state (Save/Cancel semantics preserved).
  removableSet?: Set<number>
  onRemoveCard?: (appid: number) => void
  // Manual-sort drag mode. When enabled, the preview gains:
  //   - Hold-to-grab (long-press) and chevron-shift interactions for
  //     reordering cards via gamepad / pointer.
  //   - A 'grabbed' overlay on the currently held card.
  //   - Emits the new sentinel-bearing order via `onReorder` (synth
  //     cards encoded as `-(synthIdx + 1)` so the modal's reorderManual
  //     can split the result back into manualOrder + syntheticCards
  //     positions).
  // Off by default — non-source / non-manual tabs stay view-only,
  // exactly like before. The visible card set and rendering are the
  // SAME whether drag is on or off (cap, trailing, synth, X buttons,
  // discount gating, focus behaviour) — drag is purely additive.
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
  // Manual-sort drag state — used only when `manualSortMode` is true.
  // Lifted here so the rowItems builder can paint the 'grabbed' mark on
  // the right card. `cappedOrder` is computed AFTER rowItems so drag
  // operations have the visible sentinel-bearing order to work with.
  const [grabbedAppid, setGrabbedAppid] = useState<number | null>(null)
  const grabbedRef = useRef<number | null>(null)
  const cappedOrderRef = useRef<number[]>([])
  useEffect(() => { grabbedRef.current = grabbedAppid }, [grabbedAppid])
  // Filter out synthetic sentinels (negative ids) the modal injects into
  // `effectiveManualOrder` for the manual-sort drag grid. The preview
  // splices its own synthetic items below from `syntheticCards[].position`
  // so they appear regardless of the sort mode.
  const gameOnlyIds = useMemo(() => ids.filter((id) => id >= 0), [ids])
  // Limit cap — always keep `removableSet` entries (menu-added games at
  // the manualOrder tail) so they appear in every tab, matching the
  // Source tab's ManualSortRow which renders without a cap. Without
  // this carve-out, limit would slice them off and the user's added
  // games would only be visible while editing the source tab.
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

  // Build the items list (game cards + trailing refresh/more) so the
  // shared <ShelfRow> can drive the entire row. Featured sizing comes
  // from the per-game-card branch (preview uses 3.21× cardW for
  // highlighted items, art height stays constant).
  //
  // `discountPercent` is pulled from the same localStorage price cache
  // the home shelf consults — without it the preview's cards would
  // never have discount data, so the green discount badge wouldn't
  // render even when `inlineBadges` is on.
  // Discount badges only make sense on online (wishlist/store) shelves
  // — they advertise "this game is on sale, buy it". On non-online
  // shelves (collection / tab / filter / installed) the user already
  // owns the game so the badge is noise. Mirrors what Shelf.tsx does
  // on the home (it only sets `discountPercent` for online sources).
  const isOnlineShelfSource = (() => {
    const s: any = shelfSource
    if (!s || typeof s !== 'object') return false
    if (s.type === 'wishlist' || s.type === 'store') return true
    if (s.type === 'composite' && Array.isArray(s.sources)) {
      return s.sources.some((c: any) => c?.type === 'wishlist' || c?.type === 'store')
    }
    return false
  })()
  // Mirror Shelf.tsx render-time owned-hide: when an online source has
  // the "exclude owned" toggle on (per-shelf or global), drop ids that
  // match the local library by appid OR by normalized name. For composite
  // shelves the toggle lives on the first online child (editor propagates
  // it uniformly), so read from there. For direct online shelves read
  // from the source itself. Owned-locally cards (overview present in
  // appStore) only get dropped when they came from an online child —
  // detected here via the same `appStore.GetAppOverviewByAppID` lookup
  // Shelf.tsx uses (offline-origin cards have a local overview → kept).
  const ownedHideState = useMemo(() => {
    const s: any = shelfSource
    if (!s || typeof s !== 'object') return null
    const directOnline = s.type === 'wishlist' || s.type === 'store'
    const compositeOnlineChild = s.type === 'composite' && Array.isArray(s.sources)
      ? s.sources.find((c: any) => c?.type === 'wishlist' || c?.type === 'store')
      : null
    if (!directOnline && !compositeOnlineChild) return null
    const tgls = directOnline ? s : compositeOnlineChild
    const excludeOwned = !!tgls?.excludeOwned
    const excludeOwnedNonSteam = excludeOwned && !!tgls?.excludeOwnedNonSteam
    const perShelfCloud = tgls?.hideOwnedNonSteamCloud
    const cur = (() => { try { return getCurrentSettings() } catch { return null } })()
    const globalHideOwned = cur?.onlineHideOwnedGames === true
    const globalHideOwnedNonSteam = cur?.onlineHideOwnedNonSteam === true
    const globalHideOwnedCloud = cur?.onlineHideOwnedNonSteamCloud === true
    const shouldHide = globalHideOwned || excludeOwned
    if (!shouldHide) return null
    const effectiveNonSteam = (globalHideOwned && globalHideOwnedNonSteam) || (excludeOwned && excludeOwnedNonSteam)
    const effectiveCloud = effectiveNonSteam && (perShelfCloud === true || (perShelfCloud === undefined && globalHideOwnedCloud))
    return { isCompositeShelf: s.type === 'composite', effectiveNonSteam, effectiveCloud }
  }, [shelfSource])
  const [ownedAppIds, setOwnedAppIds] = useState<Set<number> | null>(null)
  const [ownedNames, setOwnedNames] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!ownedHideState) { setOwnedAppIds(null); setOwnedNames(null); return }
    const { effectiveNonSteam, effectiveCloud } = ownedHideState
    const ownedSet = getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud)
    setOwnedAppIds(ownedSet)
    // Build ownedNames via PER-ID raw `appStore.GetAppOverviewByAppID`
    // lookup across every Steam window — `getAllAppOverviews()` falls
    // through `normalizeAppOverview` for many users which strips entries
    // whose display_name ends up as the "App {id}" fallback, so the
    // resulting `apps` array doesn't include every non-Steam shortcut
    // (Epic / Amazon / GOG titles the user owns there). Without those,
    // the wishlist row's name-dedup misses items like "Kingdom Come:
    // Deliverance II". Iterating `ownedSet` directly + a raw per-id
    // lookup guarantees every owned entry contributes its name.
    let cancelled = false
    ;(async () => {
      const names = new Set<string>()
      const lookups = (id: number): string | null => {
        try {
          const opener: any = (globalThis as any).opener
          const candidates = [
            (globalThis as any).appStore,
            opener?.appStore,
            opener?.AppStore,
          ].filter(Boolean)
          for (const as of candidates) {
            try {
              const ov = as?.GetAppOverviewByAppID?.(id)
              const n = (ov as any)?.display_name ?? (ov as any)?.name
              if (typeof n === "string" && n) return n
            } catch {}
          }
        } catch {}
        return null
      }
      for (const id of ownedSet) {
        const n = lookups(id)
        if (!n) continue
        const k = normalizeTitleForMatch(n)
        if (k) names.add(k)
      }
      // Backstop: still merge whatever `getAllAppOverviews()` returns
      // for the rare case where the raw appStore lookup misses an entry
      // a fallback path captured.
      try {
        const apps = await getAllAppOverviews()
        if (cancelled) return
        for (const a of apps) {
          const id = Number((a as any)?.appid)
          if (!ownedSet.has(id)) continue
          const n = (a as any)?.display_name ?? (a as any)?.name
          if (typeof n === 'string' && n) {
            const k = normalizeTitleForMatch(n)
            if (k) names.add(k)
          }
        }
      } catch {}
      if (cancelled) return
      setOwnedNames(names)
    })()
    return () => { cancelled = true }
  }, [ownedHideState])
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
    const hiddenSet = hiddenAppIds && hiddenAppIds.length ? new Set(hiddenAppIds) : null
    const out: DeckRowItem[] = []
    let cardIdx = -1
    // Per-id owned-overview lookup used to mirror Shelf.tsx's
    // `isStoreFallback` proxy: cards from offline children have a local
    // overview; cards from online children don't. For composite shelves,
    // hide-owned only applies to online-origin cards so collection items
    // the user owns aren't filtered out by their own ownership.
    const hasLocalOverview = (id: number): boolean => {
      try { return !!(globalThis as any).appStore?.GetAppOverviewByAppID?.(id) }
      catch { return false }
    }
    for (const id of cappedIds) {
      // Owned-hide gate: skip ids matching the local library by appid
      // OR by normalized name. Composite shelves restrict the gate to
      // online-origin cards (no local overview); direct online shelves
      // apply it to every card (they're all online by definition).
      if (ownedHideState && (ownedAppIds || ownedNames)) {
        const eligible = ownedHideState.isCompositeShelf ? !hasLocalOverview(id) : true
        if (eligible) {
          if (ownedAppIds?.has(id)) continue
          if (ownedNames) {
            const m0 = meta.get(id)
            const nm = m0?.name && !/^App \d+$/.test(m0.name) && !/^#\d+$/.test(m0.name) ? m0.name : ''
            const key = nm ? normalizeTitleForMatch(nm) : ''
            if (key && ownedNames.has(key)) continue
          }
        }
      }
      // Don't skip on missing meta — render a placeholder so menu-added
      // games appear immediately, even before their meta fetch lands
      // (the home shelf does this too via the `App {id}` fallback).
      const m = meta.get(id) ?? { appid: id, name: `#${id}` } as PlatformAppMeta
      cardIdx++
      const isNew = m.addedTimestamp ? (Date.now() - m.addedTimestamp * 1000) < NEW_GAME_WINDOW_MS : false
      // Always-on intrinsic marks. Precedence (top → bottom): grabbed
      // beats everything (active interaction); hidden beats highlight/
      // added (the dark overlay signals "off"); highlight beats added
      // (the user explicitly featured this card); added is the
      // baseline marker for menu-added games. Pickers don't override
      // these — they just enable click-to-toggle via `selectionMode`.
      const isGrabbed = manualSortMode && grabbedAppid === id
      const isHidden = !!hiddenSet?.has(id)
      const isAdded = !!removableSet?.has(id)
      const isHighlighted = highlightAll || (highlightFirst && cardIdx === 0) || highlightedSet.has(id)
      let mark: DeckRowItem['selectionMark']
      if (isGrabbed) mark = 'grabbed'
      else if (isHidden) mark = 'hidden'
      else if (isHighlighted) mark = 'highlight'
      else if (isAdded) mark = 'added'
      else mark = undefined
      out.push({
        id,
        appid: id,
        name: m.name,
        portraitUrl: m.portraitUrl,
        heroUrl: m.heroUrl,
        isInstalled: m.installed,
        isSteam: m.isSteam,
        deckCompatCategory: m.deckCompatCategory,
        playtimeMinutes: m.playtimeMinutes,
        updatePending: m.updatePending,
        isNew,
        discountPercent: readDiscount(id),
        // Picker mode: paint the overlay when this id is currently
        // selected. The toggle handler always fires (lets the user
        // both ADD and REMOVE selection by clicking the same card).
        // In manualSortMode, clicking toggles grab instead.
        selectionMark: mark,
        onToggleSelection: manualSortMode
          ? () => setGrabbedAppid((g) => (g === id ? null : id))
          : (selectionMode ? () => onToggleSelection?.(id) : undefined),
      })
    }
    if (showRefresh) out.push({ id: '__refresh', name: t('refresh'), isRefresh: true, onActivate: onRefresh })
    if (showMore) out.push({ id: '__more', name: t('view_more'), isMoreLink: true })
    // Splice synthetic decoration cards at their persisted `position`
    // slots. Sorted asc so earlier slots splice before later ones (later
    // splice positions stay valid as the array grows). Same logic as
    // Shelf.tsx's home rowItems builder — keeps the preview 1:1 with
    // what the user will see on the home shelf.
    //
    // Synth `id` is the sentinel `-(origIdx + 1)` so the manual-sort
    // drag flow can reorder them as first-class citizens (same encoding
    // the modal's `reorderManual` already understands). Even in
    // non-drag mode this is harmless — ShelfRow keys on item.id and
    // routes to SyntheticCard via item.synthetic.
    if (syntheticCards && syntheticCards.length) {
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
    return out
  }, [cappedIds.join(','), meta, showRefresh, showMore, onRefresh, t, JSON.stringify(syntheticCards ?? null), selectionMode, selectionSet, onToggleSelection, isOnlineShelfSource, manualSortMode, grabbedAppid, hiddenAppIds?.join(','), removableSet, highlightedSet, highlightAll, highlightFirst, ownedHideState, ownedAppIds, ownedNames])

  // Keep the focused card in view as the user navigates horizontally — same
  // pattern HighlightRow uses on the home shelf. Without this, fast L/R input
  // scrolls focus past the visible window and Steam's nav loses the card.
  // Instant scroll keeps focus and view in sync at every direction press.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    let raf: number | null = null
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      const card = target?.closest('.ds-card') as HTMLElement | null
      if (!card || !row.contains(card)) return
      // Emit the focused card's index (sibling position among .ds-card
      // children of the row). Used by EditShelfModal's Decoration tab
      // to decide where to insert the next synthetic card.
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

  // Orderable id list (positive appids + negative synth sentinels, no
  // trailing). Drag operates on this; reorder emits the new sequence.
  const orderableIds = useMemo(() => {
    const out: number[] = []
    for (const it of rowItems) {
      if (it.isRefresh || it.isMoreLink) continue
      if (typeof it.id === 'number') out.push(it.id)
    }
    return out
  }, [rowItems])
  useEffect(() => { cappedOrderRef.current = orderableIds }, [orderableIds])

  // Drag interaction — only wires when manualSortMode is true. Mirrors
  // the old ManualSortRow logic (long-press hold-to-grab, d-pad / arrow
  // shift, pointer-drag for desktop). The reorder emit format is the
  // same sentinel-bearing array the modal's `reorderManual` already
  // accepts, so the modal needs zero changes.
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
    // Two rAFs — first to let React commit, second so layout is settled
    // before focus + scroll follow the moved card. Without this, the
    // focus stays on the previous DOM index and the row over-scrolls.
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
    // Capture directional input while grabbed: native gamepad nav would
    // move focus to a sibling row; we want it to shift the grabbed
    // card instead. Patches DispatchVirtualButtonClick (gamepad) and
    // listens for keyboard arrows as a desktop fallback.
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
          if (button === 9 || button === 10) {
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
  }, [manualSortMode, grabbedAppid])

  // Delegated pointerdown — hits whichever .ds-card the user pressed
  // and starts the hold-to-grab + drag-to-reorder flow. Lives on the
  // row wrapper so we don't have to wrap each card individually (which
  // would fork ShelfRow). Only active in manualSortMode.
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
      for (let i = 0; i < cards.length; i++) {
        const r = cards[i].getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right) {
          const current = grabbedRef.current
          if (current === null) return
          const cardId = Number(cards[i].getAttribute('data-appid')) || 0
          const base = cappedOrderRef.current.slice()
          const from = base.indexOf(current)
          const to = base.indexOf(cardId)
          if (from === -1 || to === -1 || from === to) return
          const [picked] = base.splice(from, 1)
          base.splice(to, 0, picked)
          cappedOrderRef.current = base
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

  return (
    <div data-ds-shelf-preview="1">
      <style>{PREVIEW_STYLE_TAG}</style>
      <Focusable
        ref={rowRef}
        data-ds-preview-row="1"
        noFocusRing
        onPointerDown={onRowPointerDown}
        onFocus={(e: any) => {
          // When Steam's nav lands on the wrapper, delegate to the first card —
          // same pattern as DeckRow on the home screen.
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
          // Extra padding-bottom so labels (which sit absolutely below each
          // 110px-tall wrapper at top:100%) aren't clipped by the modal.
          padding: '8px 0 56px',
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
