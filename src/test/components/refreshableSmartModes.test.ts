import { describe, it, expect } from 'vitest'
import { REFRESHABLE_SMART_MODES } from '../../components/shelf/types'
import { SmartShelfModeSchema } from '../../types'

describe('REFRESHABLE_SMART_MODES', () => {
  it('only contains modes whose result can change between two clicks', () => {
    expect([...REFRESHABLE_SMART_MODES].sort()).toEqual([
      'random_pick',
      'recently_played',
      'spare_time',
      'time_of_day',
    ])
  })

  it('every entry is a valid SmartShelfMode', () => {
    const modes = SmartShelfModeSchema.options
    for (const m of REFRESHABLE_SMART_MODES) {
      expect(modes).toContain(m)
    }
  })

  it('deterministic modes are NOT included (no trailing card on those)', () => {
    const deterministic = [
      'daily_pick',
      'quick_play',
      'not_started',
      'deck_picks',
      'best_unplayed',
      'interrupted',
      'on_deck',
      'long_session',
      'non_steam',
      'forgotten',
      'rediscover',
    ]
    for (const m of deterministic) {
      expect(REFRESHABLE_SMART_MODES).not.toContain(m)
    }
  })
})
