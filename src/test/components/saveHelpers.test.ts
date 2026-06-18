import { describe, it, expect } from 'vitest';
import {
  buildPrimarySource,
  assembleFinalSource,
  dropEmptyChildFilter,
  buildSortPatchFields,
  shelfSortForPatch,
  sanitizeSyntheticCard,
  primarySortKey,
  isStateManualSort,
} from '../../components/qam/modals/editShelf/saveHelpers';
import type { EditableShelfState } from '../../components/qam/modals/editShelf/types';

const baseState = (overrides: Partial<EditableShelfState> = {}): EditableShelfState => ({
  title: 's',
  sourceType: 'filter',
  collectionId: '',
  tab: '',
  externalSourceId: '',
  filter: { sort: 'alphabetical', sortReverse: false },
  filterGroup: { mode: 'and', items: [] },
  childFilterGroup: { mode: 'and', items: [] },
  additionalSources: [],
  compositeCombine: 'union',
  excludeOwned: false,
  excludeOwnedNonSteam: false,
  hideOwnedNonSteamCloud: false,
  sort: 'alphabetical',
  sortReverse: false,
  manualOrder: [],
  manualBaseSort: 'alphabetical',
  manualBaseSortReverse: false,
  limit: 20,
  matchNativeSize: false,
  highlightFirst: false,
  highlightAll: false,
  highlightRandom: false,
  highlightedAppIds: [],
  enableLogo: false,
  enableIcon: false,
  enableDescription: false,
  descriptionBelowLogo: false,
  logoPosition: 'left',
  descriptionPosition: 'left',
  logoSize: 100,
  logoTopOffset: 20,
  iconVerticalAlign: 'top',
  shelfTitlePosition: 'left',
  gameNamePosition: 'left',
  playtimePosition: 'left',
  descriptionHeight: 2,
  descriptionLogoGap: 8,
  fullPageShelf: false,
  heroEnabled: false,
  hideStatusLine: false,
  hideNewBadge: false,
  hideDiscountBadge: false,
  hideCompatIcons: false,
  hideNonSteamBadge: false,
  hideShelfTitle: false,
  hideGameNames: false,
  hideInstallIndicator: false,
  hideSeeMore: false,
  hideRefreshCard: false,
  syntheticCards: [],
  hiddenAppIds: [],
  dedupeByExactName: false,
  ...overrides,
}) as EditableShelfState;

describe('saveHelpers.buildPrimarySource', () => {
  it('filter source preserves "manual" in filter.sort so the home detects manual-order shelves', () => {
    const state = baseState({
      sourceType: 'filter',
      filter: { sort: 'manual' as any, sortReverse: false },
    });
    const out = buildPrimarySource({ state });
    expect(out.type).toBe('filter');
    expect(out.filter.sort).toBe('manual');
  });

  it('collection source carries the collectionId through', () => {
    const state = baseState({ sourceType: 'collection', collectionId: 'favorites' });
    const out = buildPrimarySource({ state });
    expect(out).toMatchObject({ type: 'collection', collectionId: 'favorites' });
  });

  it('wishlist source carries excludeOwned + excludeOwnedNonSteam when both flags are on', () => {
    const state = baseState({
      sourceType: 'wishlist',
      excludeOwned: true,
      excludeOwnedNonSteam: true,
    });
    const out = buildPrimarySource({ state });
    expect(out).toMatchObject({
      type: 'wishlist',
      excludeOwned: true,
      excludeOwnedNonSteam: true,
    });
  });

  it('wishlist with excludeOwned=false drops both exclusion flags', () => {
    const state = baseState({
      sourceType: 'wishlist',
      excludeOwned: false,
      excludeOwnedNonSteam: true,
    });
    const out = buildPrimarySource({ state });
    expect(out.excludeOwned).toBeUndefined();
    expect(out.excludeOwnedNonSteam).toBeUndefined();
  });
});

describe('saveHelpers.assembleFinalSource', () => {
  it('returns the primary unchanged when there are no additional sources', () => {
    const state = baseState({ sourceType: 'tab' });
    const primary = { type: 'tab', tab: 'installed' };
    expect(assembleFinalSource(primary, state)).toBe(primary);
  });

  it('wraps multiple sources in a composite with the chosen combine mode', () => {
    const state = baseState({
      sourceType: 'collection',
      compositeCombine: 'intersection',
      additionalSources: [
        { type: 'wishlist' } as any,
        { type: 'store' } as any,
      ],
    });
    const primary = { type: 'collection', collectionId: 'fav' };
    const out = assembleFinalSource(primary, state);
    expect(out.type).toBe('composite');
    expect(out.combine).toBe('intersection');
    expect(out.sources.length).toBe(3);
    expect(out.sources[0]).toMatchObject({ type: 'collection' });
  });

  it('filter primary skips composite even when additionalSources are populated', () => {
    const state = baseState({
      sourceType: 'filter',
      additionalSources: [{ type: 'wishlist' } as any],
    });
    const primary = { type: 'filter', filter: {} };
    expect(assembleFinalSource(primary, state)).toBe(primary);
  });
});

describe('saveHelpers.dropEmptyChildFilter', () => {
  it('removes childFilter when items array is empty', () => {
    const out = dropEmptyChildFilter({ type: 'wishlist', childFilter: { mode: 'and', items: [] } });
    expect(out.childFilter).toBeUndefined();
  });

  it('keeps childFilter when items are present', () => {
    const src = {
      type: 'wishlist',
      childFilter: { mode: 'and', items: [{ type: 'discount', params: { minDiscount: 50 } }] },
    };
    expect(dropEmptyChildFilter(src)).toBe(src);
  });
});

describe('saveHelpers.buildSortPatchFields', () => {
  it('returns undefined when not manual sort', () => {
    const out = buildSortPatchFields(baseState({ manualBaseSort: 'recent' as any }), false);
    expect(out.baseSort).toBeUndefined();
    expect(out.baseReverse).toBeUndefined();
  });

  it('omits alphabetical baseSort default', () => {
    const out = buildSortPatchFields(baseState({ manualBaseSort: 'alphabetical' }), true);
    expect(out.baseSort).toBeUndefined();
  });

  it('round-trips a multi-key baseSort array', () => {
    const out = buildSortPatchFields(
      baseState({
        manualBaseSort: ['recent', 'alphabetical'] as any,
        manualBaseSortReverse: [true, false] as any,
      }),
      true,
    );
    expect(out.baseSort).toEqual(['recent', 'alphabetical']);
    expect(out.baseReverse).toEqual([true, false]);
  });

  it('drops a reverse array that has no true entries', () => {
    const out = buildSortPatchFields(
      baseState({
        manualBaseSort: ['recent'] as any,
        manualBaseSortReverse: [false] as any,
      }),
      true,
    );
    expect(out.baseReverse).toBeUndefined();
  });
});

describe('saveHelpers.shelfSortForPatch', () => {
  it('returns undefined for filter sourceType (sort lives on filter)', () => {
    expect(shelfSortForPatch(baseState({ sourceType: 'filter' }))).toBeUndefined();
  });

  it('returns undefined when the shelf is at the alphabetical default', () => {
    expect(shelfSortForPatch(baseState({ sourceType: 'collection', sort: 'alphabetical' }))).toBeUndefined();
  });

  it('returns the user-chosen sort string', () => {
    expect(shelfSortForPatch(baseState({ sourceType: 'collection', sort: 'recent' as any }))).toBe('recent');
  });

  it('returns the multi-key sort array when populated', () => {
    expect(
      shelfSortForPatch(baseState({ sourceType: 'collection', sort: ['recent', 'alphabetical'] as any })),
    ).toEqual(['recent', 'alphabetical']);
  });
});

describe('saveHelpers.sanitizeSyntheticCard', () => {
  it('coerces empty text/image strings to undefined', () => {
    const out = sanitizeSyntheticCard({ kind: 'text', text: '', image: '' });
    expect(out.text).toBeUndefined();
    expect(out.image).toBeUndefined();
  });

  it('drops shadowMode when no link is present', () => {
    const out = sanitizeSyntheticCard({ kind: 'image', image: 'a.png', shadowMode: 'always' });
    expect(out.shadowMode).toBeUndefined();
  });

  it('drops shadowMode === "never" even when link is present', () => {
    const out = sanitizeSyntheticCard({
      kind: 'link',
      text: 'hi',
      link: { type: 'url', value: 'https://example.com' },
      shadowMode: 'never',
    });
    expect(out.shadowMode).toBeUndefined();
  });

  it('prepends https:// to a bare host in url links', () => {
    const out = sanitizeSyntheticCard({
      kind: 'link',
      text: 'go',
      link: { type: 'url', value: 'example.com' },
    });
    expect(out.link.value).toBe('example.com');
  });

  it('drops invalid url links entirely', () => {
    const out = sanitizeSyntheticCard({
      kind: 'link',
      text: 'go',
      link: { type: 'url', value: 'not a url at all <>' },
    });
    expect(out.link).toBeUndefined();
  });
});

describe('saveHelpers.primarySortKey + isStateManualSort', () => {
  it('extracts the first key of a sort array', () => {
    expect(primarySortKey(['manual', 'recent'])).toBe('manual');
    expect(primarySortKey(['recent', 'alphabetical'])).toBe('recent');
  });

  it('returns the string as-is when sort is not an array', () => {
    expect(primarySortKey('manual')).toBe('manual');
    expect(primarySortKey('alphabetical')).toBe('alphabetical');
  });

  it('returns undefined for empty / non-string values', () => {
    expect(primarySortKey([])).toBeUndefined();
    expect(primarySortKey(undefined)).toBeUndefined();
    expect(primarySortKey(null)).toBeUndefined();
    expect(primarySortKey(42)).toBeUndefined();
  });

  it('isStateManualSort detects manual primary in a multi-key filter.sort array', () => {
    const state = baseState({
      sourceType: 'filter',
      filter: { sort: ['manual', 'recent'] as any, sortReverse: [false, false] as any },
    });
    expect(isStateManualSort(state)).toBe(true);
  });

  it('isStateManualSort detects manual primary in a multi-key state.sort array', () => {
    const state = baseState({
      sourceType: 'tab',
      sort: ['manual', 'playtime'] as any,
    });
    expect(isStateManualSort(state)).toBe(true);
  });

  it('isStateManualSort returns false for a non-manual primary', () => {
    const state = baseState({
      sourceType: 'filter',
      filter: { sort: ['recent', 'manual'] as any, sortReverse: false },
    });
    expect(isStateManualSort(state)).toBe(false);
  });
});

describe('saveHelpers.shelfSortForPatch — manual normalization', () => {
  it('collapses `[manual, …]` to the string "manual" so the persisted shape stays clean', () => {
    expect(
      shelfSortForPatch(baseState({ sourceType: 'tab', sort: ['manual', 'recent'] as any })),
    ).toBe('manual');
  });

  it('preserves a real multi-key chain without manual', () => {
    expect(
      shelfSortForPatch(baseState({ sourceType: 'tab', sort: ['recent', 'alphabetical'] as any })),
    ).toEqual(['recent', 'alphabetical']);
  });
});

describe('saveHelpers.buildPrimarySource — manual normalization for filter source', () => {
  it('collapses filter.sort `[manual, …]` to plain "manual" so reopen shows manual primary cleanly', () => {
    const state = baseState({
      sourceType: 'filter',
      filter: { sort: ['manual', 'recent'] as any, sortReverse: false },
    });
    const out = buildPrimarySource({ state });
    expect(out.type).toBe('filter');
    expect(out.filter.sort).toBe('manual');
  });

  it('preserves a real multi-key filter.sort chain without manual', () => {
    const state = baseState({
      sourceType: 'filter',
      filter: { sort: ['recent', 'alphabetical'] as any, sortReverse: [false, false] as any },
    });
    const out = buildPrimarySource({ state });
    expect(out.filter.sort).toEqual(['recent', 'alphabetical']);
  });
});
