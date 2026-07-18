import { describe, it, expect, vi, beforeEach } from 'vitest'

const opened: string[] = []
vi.mock('../../core/updateNotifier', () => ({ openExternalUrl: (u: string) => { opened.push(u) } }))
vi.mock('../../runtime/diagnosticsInfo', () => ({
  collectRuntimeInfo: () => ({ version: '3.0.2', steamOS: '3.9', decky: true, cssLoader: true, theme: 'Default', tabMaster: false, unifiDeck: false, nonSteamBadges: false }),
  collectSystemInfo: async () => ({ steamVersion: '1782861641', osName: 'SteamOS', osVersion: '3.9' }),
  listCoLoadedPlugins: () => ['DeckShelves', 'CSSLoader'],
  summarizeConfig: () => ['enabled=true shelves=5 smart=2'],
}))
vi.mock('../../runtime/diagnostics', () => ({
  getDiagnostics: () => [{ id: '1', time: '2026-07-17T00:00:00Z', level: 'error', scope: 'HOME', message: 'render crashed', context: 'boom' }],
}))
vi.mock('../../store/settingsStore', () => ({ getCurrentSettings: () => ({ betaChannelEnabled: false }) }))

import { openBugReport } from '../../core/issueReport'

describe('openBugReport', () => {
  beforeEach(() => { opened.length = 0 })

  it('opens the bug Issue Form pre-filled with diagnostics + logs', async () => {
    await openBugReport()
    expect(opened.length).toBe(1)
    const q = new URL(opened[0]).searchParams
    expect(q.get('template')).toBe('bug_report.yml')
    expect(q.get('title')).toBe('[BUG] ')
    expect(q.get('os')).toBe('SteamOS (Steam Deck)')
    expect(q.get('os_version')).toBe('SteamOS 3.9')
    expect(q.get('steam_client')).toBe('1782861641')
    expect(q.get('release_channel')).toBe('Stable')
    expect(q.get('steam_mode')).toBe('Game Mode (Steam Deck home / GamepadUI)')
    expect(q.get('version')).toBe('3.0.2')
    const ctx = q.get('context') ?? ''
    expect(ctx).toContain('### Diagnostics')
    expect(ctx).toContain('Version: 3.0.2')
    expect(ctx).toContain('Plugins: DeckShelves, CSSLoader')
    expect(ctx).toContain('### Logs')
    expect(ctx).toContain('render crashed')
  })

  it('stays well under the GitHub URL length limit', async () => {
    await openBugReport()
    expect(opened[0].length).toBeLessThan(8000)
  })
})
