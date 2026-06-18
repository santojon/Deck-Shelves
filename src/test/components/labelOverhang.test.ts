import { describe, it, expect } from 'vitest';
import { _labelOverhangPx } from '../../components/DeckRow';

describe('_labelOverhangPx — row paddingBottom budget', () => {
  it('clamps to a 60 px minimum so existing shelves keep their gap', () => {
    expect(_labelOverhangPx({ hideStatusLine: true, hideGameNames: true })).toBeGreaterThanOrEqual(60);
  });

  it('reserves more space when status line is visible', () => {
    const off = _labelOverhangPx({ hideStatusLine: true });
    const on = _labelOverhangPx({ hideStatusLine: false });
    expect(on).toBeGreaterThan(off);
  });

  it('reserves more space when per-card description is visible (not below logo)', () => {
    const off = _labelOverhangPx({ enableDescription: false });
    const on = _labelOverhangPx({ enableDescription: true, descriptionBelowLogo: false });
    expect(on).toBeGreaterThan(off);
  });

  it('does NOT add description slot when descriptionBelowLogo is true (description renders in the hero overlay, not below the card)', () => {
    const inHero = _labelOverhangPx({ enableDescription: true, descriptionBelowLogo: true });
    const off = _labelOverhangPx({ enableDescription: false });
    expect(inHero).toBe(off);
  });

  it('combined status line + per-card description is more than either alone — regression for the binary 60/84 split that under-counted this case', () => {
    const statusOnly = _labelOverhangPx({ hideStatusLine: false, enableDescription: false });
    const descOnly = _labelOverhangPx({ hideStatusLine: true, enableDescription: true });
    const both = _labelOverhangPx({ hideStatusLine: false, enableDescription: true });
    expect(both).toBeGreaterThan(statusOnly);
    expect(both).toBeGreaterThan(descOnly);
  });
});
