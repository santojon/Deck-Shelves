import { describe, it, expect } from 'vitest';
import { shouldShowMoreCard, shouldShowRefreshCard } from '../../components/shelf/trailingCards';

describe('shouldShowRefreshCard', () => {
  it('refreshable smart mode → true', () => {
    expect(shouldShowRefreshCard({ source: { type: 'smart', mode: 'random_pick' } })).toBe(true);
    expect(shouldShowRefreshCard({ source: { type: 'smart', mode: 'time_of_day' } })).toBe(true);
    expect(shouldShowRefreshCard({ source: { type: 'smart', mode: 'spare_time' } })).toBe(true);
    expect(shouldShowRefreshCard({ source: { type: 'smart', mode: 'recently_played' } })).toBe(true);
  });

  it('deterministic smart mode → false', () => {
    expect(shouldShowRefreshCard({ source: { type: 'smart', mode: 'most_played' } })).toBe(false);
    expect(shouldShowRefreshCard({ source: { type: 'smart', mode: 'unplayed' } })).toBe(false);
  });

  it('non-smart shelf with sort=random → true', () => {
    expect(shouldShowRefreshCard({ source: { type: 'collection', collectionId: 'x' }, sort: 'random' })).toBe(true);
  });

  it('non-smart filter source with filter.sort=random → true', () => {
    expect(shouldShowRefreshCard({ source: { type: 'filter', filter: { sort: 'random' } } })).toBe(true);
  });

  it('non-smart non-random → false', () => {
    expect(shouldShowRefreshCard({ source: { type: 'collection', collectionId: 'x' }, sort: 'alphabetical' })).toBe(false);
    expect(shouldShowRefreshCard({ source: { type: 'tab', tab: 'installed' } })).toBe(false);
  });

  it('per-shelf hideRefreshCard suppresses', () => {
    expect(shouldShowRefreshCard({ source: { type: 'smart', mode: 'random_pick' }, hideRefreshCard: true })).toBe(false);
  });

  it('global hideRefreshCard suppresses', () => {
    expect(shouldShowRefreshCard({ source: { type: 'smart', mode: 'random_pick' }, globalHideRefreshCard: true })).toBe(false);
  });
});

describe('shouldShowMoreCard', () => {
  it('non-smart → true', () => {
    expect(shouldShowMoreCard({ source: { type: 'collection', collectionId: 'x' } })).toBe(true);
    expect(shouldShowMoreCard({ source: { type: 'tab', tab: 'installed' } })).toBe(true);
    expect(shouldShowMoreCard({ source: { type: 'filter', filter: {} } })).toBe(true);
    expect(shouldShowMoreCard({ source: { type: 'external', sourceId: 'p' } })).toBe(true);
  });

  it('smart (any mode) → false', () => {
    expect(shouldShowMoreCard({ source: { type: 'smart', mode: 'random_pick' } })).toBe(false);
    expect(shouldShowMoreCard({ source: { type: 'smart', mode: 'most_played' } })).toBe(false);
  });

  it('per-shelf hideSeeMore suppresses', () => {
    expect(shouldShowMoreCard({ source: { type: 'collection', collectionId: 'x' }, hideSeeMore: true })).toBe(false);
  });

  it('global hideSeeMore suppresses', () => {
    expect(shouldShowMoreCard({ source: { type: 'collection', collectionId: 'x' }, globalHideSeeMore: true })).toBe(false);
  });
});
