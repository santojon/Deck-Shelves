// Initial form-state derivation for EditShelfModal. Extracted from
// the component body to keep the file under 1000 lines and to make
// the shape inspectable independently of React.
import type { Shelf, FilterGroup } from '../../../../types';
import { normalizeFilter, getEffectiveFilterGroup } from '../../../../domain/settings';
import type { EditableShelfState } from './types';
import type { SourceType } from './constants';

type Ctx = {
  shelf: Shelf;
  mode: 'create' | 'edit';
  collections: ReadonlyArray<{ id: string }>;
  platformTabs: ReadonlyArray<{ id: string }>;
  externalSources: ReadonlyArray<{ id: string }>;
};

/* Composite shelves load by promoting `sources[0]` into the primary
   fields; remaining children populate `additionalSources`. Older saves
   carried a single composite-level childFilter slot — when present,
   propagate it onto each online child so the per-child editor matches
   what the resolver actually applies. */
function hydrateCompositeChildren(shelf: Shelf): any[] {
  if (shelf.source.type !== 'composite') return [];
  const compositeChildren: any[] = Array.isArray((shelf.source as any).sources)
    ? (shelf.source as any).sources : [];
  const legacyChildFilter = (shelf.source as any).childFilter;
  const hasLegacy = legacyChildFilter && Array.isArray(legacyChildFilter.items) && legacyChildFilter.items.length > 0;
  if (!hasLegacy) return compositeChildren;
  return compositeChildren.map((c: any) => {
    if (c?.type !== 'wishlist' && c?.type !== 'store') return c;
    const existing = c.childFilter;
    if (existing && Array.isArray(existing.items) && existing.items.length > 0) return c;
    return { ...c, childFilter: legacyChildFilter };
  });
}

function deriveInitialTab(shelf: Shelf, mode: 'create' | 'edit', primarySource: any, platformTabs: ReadonlyArray<{ id: string }>): string {
  if (mode === 'create') return '';
  if (primarySource?.type === 'tab') return String(primarySource.tab);
  return String(platformTabs[0]?.id ?? 'all');
}

function deriveInitialChildFilterGroup(shelf: Shelf, primarySource: any): FilterGroup {
  const empty: FilterGroup = { mode: 'and', items: [] };
  if (shelf.source.type === 'collection' || shelf.source.type === 'tab'
      || shelf.source.type === 'wishlist' || shelf.source.type === 'store') {
    return (shelf.source as any).childFilter ?? empty;
  }
  if (shelf.source.type === 'composite') {
    return (primarySource as any)?.childFilter ?? empty;
  }
  return empty;
}

const VALID_SHADOW_MODES = new Set(['always', 'onFocus', 'never']);

function pickSize(v: any): 'featured' | 'normal' {
  return v === 'featured' ? 'featured' : 'normal';
}

function pickShadowMode(v: any): string | undefined {
  return typeof v === 'string' && VALID_SHADOW_MODES.has(v) ? v : undefined;
}

function pickNumber(v: any): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function pickString(v: any): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function sanitizeSyntheticForState(c: any): any {
  const src = c ?? {};
  return {
    position: Number(src.position ?? 0),
    image: src.image,
    text: src.text,
    link: src.link,
    size: pickSize(src.size),
    alpha: pickNumber(src.alpha),
    placeholder: src.placeholder === true,
    heroImage: pickString(src.heroImage),
    shadowMode: pickShadowMode(src.shadowMode),
  };
}

const HIDE_FLAG_KEYS = [
  'hideStatusLine', 'hideNewBadge', 'hideDiscountBadge', 'hideCompatIcons',
  'hideNonSteamBadge', 'hideShelfTitle', 'hideGameNames', 'hideInstallIndicator',
  'hideSeeMore', 'hideRefreshCard',
] as const;

function readHideFlags(shelf: Shelf): Record<typeof HIDE_FLAG_KEYS[number], boolean> {
  const out: any = {};
  for (const k of HIDE_FLAG_KEYS) out[k] = (shelf as any)[k] === true;
  return out;
}

function readSortFields(shelf: Shelf) {
  const s = shelf as any;
  return {
    sort: s.sort ?? 'alphabetical',
    sortReverse: s.sortReverse ?? false,
    manualBaseSort: s.manualBaseSort ?? 'alphabetical',
    manualBaseSortReverse: s.manualBaseSortReverse ?? false,
  };
}

function readOwnedToggles(primarySource: any) {
  const p: any = primarySource;
  return {
    excludeOwned: p?.excludeOwned === true,
    excludeOwnedNonSteam: p?.excludeOwnedNonSteam === true,
    hideOwnedNonSteamCloud: p?.hideOwnedNonSteamCloud === true,
  };
}

function readVisualFlags(shelf: Shelf) {
  const s = shelf as any;
  return {
    matchNativeSize: shelf.matchNativeSize ?? false,
    highlightFirst: shelf.highlightFirst ?? false,
    highlightAll: shelf.highlightAll ?? false,
    highlightRandom: (s.highlightRandom ?? false) === true,
    enableLogo: s.enableLogo === true,
    enableIcon: s.enableIcon === true,
    enableDescription: s.enableDescription === true,
    descriptionBelowLogo: (s as any).descriptionBelowLogo === true,
    logoPosition: (((s as any).logoPosition === 'center' || (s as any).logoPosition === 'right') ? (s as any).logoPosition : 'left') as 'left' | 'center' | 'right',
    descriptionPosition: (((s as any).descriptionPosition === 'center' || (s as any).descriptionPosition === 'right') ? (s as any).descriptionPosition : 'left') as 'left' | 'center' | 'right',
    logoSize: typeof (s as any).logoSize === 'number' ? Math.max(50, Math.min(200, (s as any).logoSize)) : 100,
    logoTopOffset: typeof (s as any).logoTopOffset === 'number' ? Math.max(0, Math.min(100, (s as any).logoTopOffset)) : 20,
    iconVerticalAlign: (((s as any).iconVerticalAlign === 'center' || (s as any).iconVerticalAlign === 'bottom') ? (s as any).iconVerticalAlign : 'top') as 'top' | 'center' | 'bottom',
    shelfTitlePosition: (((s as any).shelfTitlePosition === 'center' || (s as any).shelfTitlePosition === 'right') ? (s as any).shelfTitlePosition : 'left') as 'left' | 'center' | 'right',
    gameNamePosition: (((s as any).gameNamePosition === 'center' || (s as any).gameNamePosition === 'right') ? (s as any).gameNamePosition : 'left') as 'left' | 'center' | 'right',
    playtimePosition: (((s as any).playtimePosition === 'center' || (s as any).playtimePosition === 'right') ? (s as any).playtimePosition : 'left') as 'left' | 'center' | 'right',
    descriptionHeight: typeof (s as any).descriptionHeight === 'number' ? Math.max(1, Math.min(3, (s as any).descriptionHeight)) : 2,
    descriptionLogoGap: typeof (s as any).descriptionLogoGap === 'number' ? Math.max(-40, Math.min(80, (s as any).descriptionLogoGap)) : 10,
    fullPageShelf: (s as any).fullPageShelf === true,
    highlightedAppIds: shelf.highlightedAppIds ?? [],
    manualOrder: s.manualOrder ?? [],
    heroEnabled: s.heroEnabled === true,
    gameInfoAbove: (s as any).gameInfoAbove === true,
    friendsPlayingOverlay: (s as any).friendsPlayingOverlay === true,
    friendsPlayingOverlayRecent: (s as any).friendsPlayingOverlayRecent === true,
    dedupeByExactName: s.dedupeByExactName === true,
    hiddenAppIds: s.hiddenAppIds ?? [],
  };
}

function deriveCollectionId(primarySource: any, collections: ReadonlyArray<{ id: string }>): string {
  if (primarySource?.type === 'collection') return primarySource.collectionId;
  return String(collections[0]?.id ?? '');
}

function deriveExternalSourceId(primarySource: any, externalSources: ReadonlyArray<{ id: string }>): string {
  if (primarySource?.type === 'external') return primarySource.sourceId;
  return externalSources[0]?.id ?? '';
}

function readCompositeCombine(shelf: Shelf): 'union' | 'intersection' {
  if (shelf.source.type !== 'composite') return 'union';
  return (shelf.source as any).combine === 'intersection' ? 'intersection' : 'union';
}

function readSyntheticCards(shelf: Shelf): any[] {
  const list = (shelf as any).syntheticCards as any[] | undefined;
  return list?.map(sanitizeSyntheticForState) ?? [];
}

export function buildInitialShelfState(ctx: Ctx): EditableShelfState {
  const { shelf, mode, collections, platformTabs, externalSources } = ctx;
  const hydratedCompositeChildren = hydrateCompositeChildren(shelf);
  const primarySource: any = shelf.source.type === 'composite'
    ? (hydratedCompositeChildren[0] ?? { type: 'tab', tab: 'all' })
    : shelf.source;
  const initialFilter = normalizeFilter(primarySource);
  return {
    title: shelf.title,
    sourceType: (primarySource?.type ?? 'tab') as SourceType,
    collectionId: deriveCollectionId(primarySource, collections),
    tab: deriveInitialTab(shelf, mode, primarySource, platformTabs),
    externalSourceId: deriveExternalSourceId(primarySource, externalSources),
    filter: initialFilter,
    filterGroup: getEffectiveFilterGroup(initialFilter),
    ...readSortFields(shelf),
    limit: shelf.limit,
    ...readVisualFlags(shelf),
    ...readHideFlags(shelf),
    ...readOwnedToggles(primarySource),
    childFilterGroup: deriveInitialChildFilterGroup(shelf, primarySource),
    compositeCombine: readCompositeCombine(shelf),
    additionalSources: hydratedCompositeChildren.slice(1) as any[],
    syntheticCards: readSyntheticCards(shelf),
  };
}
