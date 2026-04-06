import { it, expect, describe } from 'vitest';
import { computeCenteredScrollLeft } from '../core/scrollUtils';

describe('computeCenteredScrollLeft', () => {
  it('centers item within container and clamps to max scroll', () => {
    const container = { width: 400, scrollWidth: 1200 };
    const item = { left: 300, top: 0, width: 133, height: 200 };
    const expected = item.left - (container.width / 2) + (item.width / 2);
    const maxScroll = Math.max(0, container.scrollWidth - container.width);
    const final = Math.max(0, Math.min(expected, maxScroll));
    expect(computeCenteredScrollLeft(container as any, item as any)).toBe(final);
  });

  it('returns 0 when target would be negative', () => {
    const container = { width: 800, scrollWidth: 1000 };
    const item = { left: 10, top: 0, width: 100, height: 100 };
    expect(computeCenteredScrollLeft(container as any, item as any)).toBe(0);
  });
});
