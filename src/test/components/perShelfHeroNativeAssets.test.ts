// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type SwapModule = typeof import('../../components/shelf/perShelfHeroSwap')

let swap: SwapModule
let imgScans = 0
let slots: Array<string | null>

class NativeAsset {
  props: any
  GetSourcesForAsset() { return [`/native/${this.props.app.appid}_hero.jpg`] }
}

function addNativeImage(): void {
  const img = document.createElement('img')
  ;(img as any)['__reactFiber$test'] = {
    memoizedProps: {},
    stateNode: null,
    return: { memoizedProps: { eAssetType: 1 }, stateNode: new NativeAsset(), return: null },
  }
  document.body.append(img)
}

const setters = {
  setSlot: (_slot: 'A' | 'B', url: string | null) => { slots.push(url) },
  setPending: () => {},
}

function focusApp(hero: ReturnType<SwapModule['freshHeroState']>, appid: number): void {
  hero.currentKey = appid
  swap.swapAppHero(hero, setters, appid)
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  vi.stubGlobal('appStore', { GetAppOverviewByAppID: (appid: number) => ({ appid }) })
  imgScans = 0
  slots = []
  const original = document.querySelectorAll.bind(document)
  vi.spyOn(document, 'querySelectorAll').mockImplementation(((selector: string) => {
    if (selector === 'img') imgScans++
    return original(selector)
  }) as typeof document.querySelectorAll)
  swap = await import('../../components/shelf/perShelfHeroSwap')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('hero native asset discovery', () => {
  it('scans the documents once for a focus change when no native image exists', () => {
    const hero = swap.freshHeroState()
    focusApp(hero, 10)
    expect(imgScans).toBe(1)
    expect(slots[0]).toContain('/customimages/10_hero')
  })

  it('skips the scan for a focus change shortly after a miss and scans again once the window passes', () => {
    const hero = swap.freshHeroState()
    focusApp(hero, 10)
    vi.advanceTimersByTime(100)
    focusApp(hero, 20)
    vi.advanceTimersByTime(30)
    expect(imgScans).toBe(1)
    vi.advanceTimersByTime(470)
    focusApp(hero, 30)
    vi.advanceTimersByTime(30)
    expect(imgScans).toBe(2)
  })

  it('still rescans once when the hero refines its list later', () => {
    const hero = swap.freshHeroState()
    focusApp(hero, 10)
    expect(imgScans).toBe(1)
    vi.advanceTimersByTime(700)
    expect(imgScans).toBe(2)
  })

  it('keeps a found native asset without scanning again', () => {
    addNativeImage()
    const hero = swap.freshHeroState()
    focusApp(hero, 10)
    expect(imgScans).toBe(1)
    expect(slots[0]).toBe('/native/10_hero.jpg')
    vi.advanceTimersByTime(100)
    focusApp(hero, 20)
    vi.advanceTimersByTime(30)
    expect(imgScans).toBe(1)
    expect(slots[1]).toBe('/native/20_hero.jpg')
  })

  it('adopts a native image that appears after a miss at the first focus change past the window', () => {
    const hero = swap.freshHeroState()
    focusApp(hero, 10)
    addNativeImage()
    vi.advanceTimersByTime(100)
    focusApp(hero, 20)
    vi.advanceTimersByTime(30)
    expect(slots[1]).toContain('/customimages/20_hero')
    vi.advanceTimersByTime(470)
    focusApp(hero, 30)
    vi.advanceTimersByTime(30)
    expect(slots[2]).toBe('/native/30_hero.jpg')
  })
})
