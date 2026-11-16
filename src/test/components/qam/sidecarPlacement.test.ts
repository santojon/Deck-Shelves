// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { focusedInSidecar, leftPressCloses, placeSidecar, rememberSidecarFocus, resumeTarget, takeSidecarResume } from '../../../components/qam/sidecar/SidecarPanel'
import { DeckQAMStyles } from '../../../components/styles/DeckQAMStyles'

const ruleFor = (css: string, selector: string) => {
  const at = css.indexOf(selector + ' {')
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

// The element reports where it lands: its own style plus the containing block's offset.
function sidecar(offsetX: number, offsetY: number) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => ({ left: parseFloat(el.style.left) + offsetX, top: parseFloat(el.style.top) + offsetY, width: 0, height: 0 } as DOMRect)
  return el
}

describe('sidecar placement', () => {
  const frame = { left: 348, top: 0, width: 506, height: 454 }

  it("lands on the panel's frame inside a menu, past the menu's own offset", () => {
    const el = sidecar(63, 176)
    placeSidecar(el, frame)
    expect([el.style.left, el.style.top, el.style.width, el.style.height]).toEqual(['285px', '-176px', '506px', '454px'])
  })

  it('keeps the frame as is on the window', () => {
    const el = sidecar(0, 0)
    placeSidecar(el, frame)
    expect([el.style.left, el.style.top]).toEqual(['348px', '0px'])
  })
})

describe('the sidecar inside a menu', () => {
  const css = renderToStaticMarkup(createElement(DeckQAMStyles))

  it("is not clipped by the menu's own box", () => {
    expect(css).toContain('.deck-shelves-qam-sidecar {')
    const rule = ruleFor(css, ':has(> [data-ds-sidecar-menu])')
    expect(rule).toContain('overflow: visible !important')
    expect(rule).toContain('transform: none !important')
  })

  it("leaves the panel unblurred under a list opened from inside it", () => {
    const rule = ruleFor(css, '[data-ds-sidecar-list="1"] .ModalOverlayBackground')
    expect(rule).toContain('backdrop-filter: none !important')
    expect(rule).toContain('background: transparent !important')
  })

  it("leaves the panel's main column unblurred while it is open", () => {
    const rule = ruleFor(css, '.ModalOverlayBackground:has(~ .ModalOverlayContent [data-ds-sidecar-menu])')
    expect(rule).toContain('backdrop-filter: none !important')
    expect(rule).toContain('background: transparent !important')
  })
})

describe('a left press inside the sidecar', () => {
  const build = () => {
    const side = document.createElement('div')
    side.className = 'deck-shelves-qam-sidecar'
    const row = document.createElement('div')
    const eye = document.createElement('div')
    const slider = document.createElement('div')
    slider.setAttribute('role', 'slider')
    side.append(row, eye, slider)
    const main = document.createElement('div')
    document.body.append(side, main)
    return { row, eye, slider, main }
  }

  it('closes the sidecar once the focus left it', () => {
    const { row, main } = build()
    expect(leftPressCloses(row, main)).toBe(true)
    expect(leftPressCloses(row, null)).toBe(true)
  })

  it('keeps it open when the focus moved within it', () => {
    const { row, eye } = build()
    expect(leftPressCloses(eye, row)).toBe(false)
  })

  it('closes it at the left edge, where the press moved nothing', () => {
    const { row } = build()
    expect(leftPressCloses(row, row)).toBe(true)
  })

  it('keeps it open while a slider takes the press', () => {
    const { slider } = build()
    expect(leftPressCloses(slider, slider)).toBe(false)
  })
})

describe('the sidecar coming back after a list', () => {
  const body = () => {
    const el = document.createElement('div')
    el.innerHTML = '<div class="row"><span>a</span></div><div class="row"><span>b</span><div class="dropdown"></div></div>'
    return el
  }

  it('resumes once on the control that opened the list, in the body mounted again', () => {
    const before = body()
    rememberSidecarFocus(before, before.querySelector('.dropdown') as HTMLElement)
    const again = body()
    expect(resumeTarget(again, takeSidecarResume())).toBe(again.querySelector('.dropdown'))
    expect(takeSidecarResume()).toBeNull()
  })

  it("reads the focused control from Steam's focus mark, else from the document", () => {
    const b = body()
    document.body.appendChild(b)
    const dropdown = b.querySelector('.dropdown') as HTMLElement
    dropdown.classList.add('gpfocus')
    expect(focusedInSidecar(b)).toBe(dropdown)
    dropdown.classList.remove('gpfocus')
    expect(focusedInSidecar(b)).toBeNull()
    dropdown.tabIndex = 0
    dropdown.focus()
    expect(focusedInSidecar(b)).toBe(dropdown)
    b.remove()
  })

  it('starts from the top when the focus was not in the sidecar', () => {
    rememberSidecarFocus(body(), document.createElement('div'))
    expect(takeSidecarResume()).toBeNull()
    expect(resumeTarget(body(), null)).toBeNull()
  })
})
