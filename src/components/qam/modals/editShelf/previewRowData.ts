import type { DeckRowItem } from '../../../shelf/types'
import type { PlatformAppMeta } from '../../../../runtime/platform'
import { getAllAppOverviews } from '../../../../steam'
import { normalizeTitleForMatch } from '../../../../steam/dedupe'
import { getCurrentSettings } from '../../../../store/settingsStore'

const NEW_GAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

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

export function namesFromOwnedSet(ownedSet: Set<number>): Set<string> {
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

export async function mergeAppOverviewNames(names: Set<string>, ownedSet: Set<number>): Promise<void> {
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

export function computeOwnedHideState(shelfSource: unknown): OwnedHideState {
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

export function buildHiddenSet(hiddenAppIds: number[] | undefined): Set<number> | null {
  return hiddenAppIds && hiddenAppIds.length ? new Set(hiddenAppIds) : null
}

export function shouldHideOwnedCard(
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
export function resolveCardFlags(ctx: {
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

export function makeToggleHandler(
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

export function spliceSyntheticCards(out: DeckRowItem[], syntheticCards: SyntheticCardInput[] | undefined): void {
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
