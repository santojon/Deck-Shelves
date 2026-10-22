import { afterEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any

async function loadShim(lib: Record<string, unknown>) {
  vi.resetModules()
  g.DFL = lib
  return import('../../shims/host-ui')
}

afterEach(() => {
  delete g.DFL
  vi.resetModules()
})

describe('host-ui findModule', () => {
  it('uses the host library\'s findModule when it has one', async () => {
    const findModule = vi.fn()
    const findModuleChild = vi.fn()
    const shim = await loadShim({ findModule, findModuleChild })
    expect(shim.findModule).toBe(findModule)
  })

  it('walks the same variants through findModuleChild otherwise, stopping at the first match', async () => {
    const variants = [undefined, { a: 1 }, { b: 2 }, { c: 3 }]
    const findModuleChild = vi.fn((filter: (variant: unknown) => unknown) => {
      for (const variant of variants) {
        const hit = filter(variant)
        if (hit) return hit
      }
      return undefined
    })
    const shim = await loadShim({ findModuleChild })
    const seen: unknown[] = []
    const found = shim.findModule((variant: any) => { seen.push(variant); return !!variant?.b })
    expect(found).toEqual({ b: 2 })
    expect(seen).toEqual([undefined, { a: 1 }, { b: 2 }])
    expect(shim.findModule(() => false)).toBeUndefined()
  })

  it('finds nothing, without throwing, when the host has neither search', async () => {
    const shim = await loadShim({})
    expect(shim.findModule(() => true)).toBeUndefined()
  })
})
