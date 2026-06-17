// Pure data transformations for EditShelfModal's save path. Extracted
// to keep the modal under the 1000-line cap. No React, no host APIs.
import type { Shelf, ShelfFilter, FilterGroup } from '../../../../types';
import type { EditableShelfState } from './types';
import { filterGroupToFilter } from '../../../../domain/settings';

const SYNTH_EMPTY_STRING_FIELDS = ['text', 'image', 'heroImage'] as const;

function emptyStringToUndef(out: any): void {
  for (const k of SYNTH_EMPTY_STRING_FIELDS) {
    if (typeof out[k] === 'string' && out[k].length === 0) out[k] = undefined;
  }
}

function resolveSynthLink(out: any, hasContent: boolean): void {
  if (!out.link) return;
  if (!hasContent) { out.link = undefined; return; }
  if (out.link.type === 'url') out.link = sanitizeUrlLink(out.link);
}

function stripDefaultShadow(out: any): void {
  if (!out.link && out.shadowMode) delete out.shadowMode;
  if (out.shadowMode === 'never') delete out.shadowMode;
}

export function sanitizeSyntheticCard(card: any): any {
  const out: any = { ...card };
  emptyStringToUndef(out);
  if (out.text !== undefined && out.image !== undefined) out.text = undefined;
  resolveSynthLink(out, out.text !== undefined || out.image !== undefined);
  stripDefaultShadow(out);
  return out;
}

function sanitizeUrlLink(link: any): any {
  const raw = String(link.value ?? '').trim();
  const url = /^https?:\/\//i.test(raw) ? raw : (raw ? `https://${raw}` : '');
  try { if (url) new URL(url); else throw new Error(); return link; }
  catch { return undefined; }
}

export function buildSortPatchFields(
  state: EditableShelfState,
  isManualSort: boolean,
): { baseSort: string | string[] | undefined; baseReverse: boolean | boolean[] | undefined } {
  if (!isManualSort) return { baseSort: undefined, baseReverse: undefined };
  const baseSortIsArray = Array.isArray(state.manualBaseSort);
  const baseSort: string | string[] | undefined = baseSortIsArray
    ? ((state.manualBaseSort as string[]).length > 0 ? state.manualBaseSort : undefined)
    : (state.manualBaseSort !== 'alphabetical' ? state.manualBaseSort : undefined);
  const baseReverse: boolean | boolean[] | undefined = Array.isArray(state.manualBaseSortReverse)
    ? (state.manualBaseSortReverse.some((b) => b) ? state.manualBaseSortReverse : undefined)
    : (state.manualBaseSortReverse ? true : undefined);
  return { baseSort, baseReverse };
}

type PrimaryBuildCtx = {
  state: EditableShelfState;
  childFilter?: FilterGroup;
  platformTabs?: ReadonlyArray<{ id: string; source?: any }>;
};

type SourceBuilder = (ctx: PrimaryBuildCtx) => any;

const SOURCE_BUILDERS: Record<string, SourceBuilder> = {
  collection: ({ state, childFilter }) => ({ type: 'collection', collectionId: state.collectionId, ...(childFilter ? { childFilter } : {}) }),
  tab: ({ state, childFilter, platformTabs }) => {
    const selectedTab = platformTabs?.find((pt) => pt.id === state.tab);
    const baseSource = selectedTab?.source ?? { type: 'tab', tab: state.tab };
    return childFilter ? { ...baseSource, childFilter } : baseSource;
  },
  external: ({ state }) => ({ type: 'external', sourceId: state.externalSourceId }),
  wishlist: ({ state, childFilter }) => buildOnlineSource('wishlist', state, childFilter),
  store: ({ state, childFilter }) => buildOnlineSource('store', state, childFilter),
};

function buildFilterSource(state: EditableShelfState): any {
  // Preserve `"manual"` in the saved filter.sort so the home recognises
  // the shelf as a manual-order shelf. The resolver swaps in
  // `manualBaseSort` internally at resolve time (see Shelf.tsx — when
  // `primaryEffectiveSort === "manual"` it clones the source with
  // `filter.sort = baseSort` before calling resolveShelfAppIds), so the
  // backend sort pipeline never receives the literal "manual" string.
  return { type: 'filter', filter: filterGroupToFilter(state.filterGroup, state.filter.sort as ShelfFilter['sort'], state.filter.sortReverse) };
}

export function buildPrimarySource(ctx: PrimaryBuildCtx): any {
  const builder = SOURCE_BUILDERS[ctx.state.sourceType];
  return builder ? builder(ctx) : buildFilterSource(ctx.state);
}

function buildOnlineSource(type: 'wishlist' | 'store', state: EditableShelfState, childFilter?: FilterGroup): any {
  return {
    type,
    ...(childFilter ? { childFilter } : {}),
    ...(state.excludeOwned ? { excludeOwned: true } : {}),
    ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}),
    ...(state.excludeOwned && state.excludeOwnedNonSteam && state.hideOwnedNonSteamCloud ? { hideOwnedNonSteamCloud: true } : {}),
  };
}

export function dropEmptyChildFilter(s: any): any {
  if (!s?.childFilter) return s;
  const items = s.childFilter.items;
  if (Array.isArray(items) && items.length > 0) return s;
  const { childFilter: _drop, ...rest } = s;
  return rest;
}

export function assembleFinalSource(primary: any, state: EditableShelfState): any {
  if (state.sourceType === 'filter' || state.additionalSources.length === 0) return primary;
  const allChildren = [primary, ...state.additionalSources].map(dropEmptyChildFilter);
  return { type: 'composite', combine: state.compositeCombine, sources: allChildren };
}

export function shelfSortForPatch(state: EditableShelfState): Partial<Shelf>['sort'] {
  if (state.sourceType === 'filter') return undefined;
  const hasUserSort = Array.isArray(state.sort) ? state.sort.length > 0 : state.sort !== 'alphabetical';
  return hasUserSort ? state.sort : undefined;
}
