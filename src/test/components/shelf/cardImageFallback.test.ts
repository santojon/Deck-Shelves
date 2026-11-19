// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('../../../i18n', () => ({ default: { t: (key: string) => key } }))
const warmed: string[] = []
vi.mock('../../../core/imageCache', () => ({
  getHotCachedImageSrc: () => null,
  warmCacheBackground: (url: string) => { warmed.push(url) },
  firstCacheableUrl: (urls: string[]) => urls.find((u) => /^https:\/\//.test(u) && !u.includes('steamloopback.host')) ?? null,
}))

const { useCardImageFallback } = await import('../../../components/shelf/gameCardHooks')

type Result = ReturnType<typeof useCardImageFallback>
type Props = { item: any; featured?: boolean; isNearViewport?: boolean }

const CDN = /steamstatic\.com/
let container: HTMLDivElement
let root: Root
let result: Result
const img = { current: { src: '' } as HTMLImageElement }

function Harness(props: Props) {
  result = useCardImageFallback({
    imgRef: img, appid: props.item.appid, featured: !!props.featured, item: props.item, assetKey: '1',
    isNearViewport: props.isNearViewport ?? true,
  })
  return null
}

function mount(props: Props): void {
  act(() => { root.render(createElement(Harness, props)) })
}

function walkChain(): string[] {
  const seen = [result.firstUrl]
  img.current.src = result.firstUrl
  for (let i = 0; i < 40 && !result.imgFailed; i++) {
    act(() => { result.onImgError() })
    if (!result.imgFailed) seen.push(img.current.src)
  }
  return seen
}

beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  ;(globalThis as any).appStore = { GetAppOverviewByAppID: () => ({ local_cache_version: 7 }) }
  warmed.length = 0
  img.current = { src: '' } as HTMLImageElement
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(() => {
  act(() => { root.unmount() })
  delete (globalThis as any).appStore
})

describe('card art fallback chain', () => {
  it('a non-Steam shortcut walks only its custom and local art, never the store CDN', () => {
    mount({ item: { appid: 3000000001, name: 'Shortcut', isSteam: false } })
    const chain = walkChain()
    expect(chain[0]).toMatch(/^\/customimages\/3000000001p\.png/)
    expect(chain.some((u) => u.includes('steamloopback.host'))).toBe(true)
    expect(chain.filter((u) => CDN.test(u))).toEqual([])
    expect(warmed.filter((u) => CDN.test(u))).toEqual([])
    expect(result.imgFailed).toBe(true)
  })

  it('a featured non-Steam shortcut walks no store CDN entry either', () => {
    mount({ item: { appid: 3000000002, name: 'Shortcut', isSteam: false }, featured: true })
    const chain = walkChain()
    expect(chain[0]).toMatch(/^\/customimages\/3000000002\.png/)
    expect(chain.filter((u) => CDN.test(u))).toEqual([])
  })

  it('a card near the viewport warms nothing until its image loads or fails', () => {
    const portrait = 'https://cdn.akamai.steamstatic.com/steam/apps/570/library_600x900.jpg'
    mount({ item: { appid: 570, name: 'Online', portraitUrl: portrait } })
    mount({ item: { appid: 570, name: 'Online', portraitUrl: portrait }, isNearViewport: false })
    mount({ item: { appid: 570, name: 'Online', portraitUrl: portrait }, isNearViewport: true })
    expect(warmed).toEqual([])

    img.current.src = result.firstUrl
    act(() => { result.onImgError() })
    expect(warmed).toEqual([img.current.src])
    act(() => { result.onImgError() })
    act(() => { result.onImgLoad() })
    expect(img.current.src).toBe(portrait)
    expect(warmed[warmed.length - 1]).toBe(portrait)
  })

  it('a Steam game, or an item of unknown kind, falls back to the store CDN after its local art, and drops it once known as a shortcut', () => {
    for (const item of [{ appid: 620, name: 'Portal 2', isSteam: true }, { appid: 440, name: 'Store item' }]) {
      mount({ item })
      const chain = walkChain()
      const firstCdn = chain.findIndex((u) => CDN.test(u))
      expect(firstCdn).toBeGreaterThan(chain.findIndex((u) => u.includes('steamloopback.host')))
      expect(chain[0]).toMatch(/^\/customimages\//)
    }

    mount({ item: { appid: 440, name: 'Store item', isSteam: false } })
    const chain = walkChain()
    expect(chain.some((u) => u.includes('steamloopback.host'))).toBe(true)
    expect(chain.filter((u) => CDN.test(u))).toEqual([])
  })
})
