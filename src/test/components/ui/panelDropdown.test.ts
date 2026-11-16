// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({ props: [] as any[] }))
vi.mock('../../../runtime/host/decky', () => ({
  Dropdown: (p: any) => { seen.props.push(p); return p.renderButton ? createElement(p.renderButton, { disabled: p.disabled, children: 'Left' }) : createElement('div', { 'data-plain': '1' }) },
  DialogButton: (p: any) => createElement('button', { onClick: p.onClick, disabled: p.disabled }, p.children),
}))

import { ListOpenerContext, PanelDropdown } from '../../../components/ui/PanelDropdown'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let root: Root
let mount: HTMLElement
const options = [{ data: 'left', label: 'Left' }, { data: 'right', label: 'Right' }]

describe('the panel dropdown', () => {
  beforeEach(() => {
    seen.props = []
    mount = document.createElement('div')
    document.body.appendChild(mount)
    root = createRoot(mount)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    mount.remove()
  })

  it("is Steam's own dropdown outside the sidecar", async () => {
    await act(async () => root.render(createElement(PanelDropdown, { rgOptions: options, selectedOption: 'left', onChange: vi.fn(), menuLabel: 'Position' })))
    expect(seen.props.at(-1).renderButton).toBeUndefined()
    expect(mount.querySelector('[data-plain]')).not.toBeNull()
  })

  it('sends a press to the list opener inside the sidecar, with its options, value and label', async () => {
    const open = vi.fn()
    const onChange = vi.fn()
    const tree = createElement(ListOpenerContext.Provider, { value: open }, createElement(PanelDropdown, { rgOptions: options, selectedOption: 'left', onChange, menuLabel: 'Position' }))
    await act(async () => root.render(tree))
    const button = mount.querySelector('button') as HTMLButtonElement
    await act(async () => button.click())
    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0][0]).toMatchObject({ options, selected: 'left', label: 'Position', choose: onChange, anchor: button })
  })

  it('ignores a press while disabled', async () => {
    const open = vi.fn()
    const tree = createElement(ListOpenerContext.Provider, { value: open }, createElement(PanelDropdown, { rgOptions: options, selectedOption: 'left', onChange: vi.fn(), disabled: true }))
    await act(async () => root.render(tree))
    await act(async () => (mount.querySelector('button') as HTMLButtonElement).click())
    expect(open).not.toHaveBeenCalled()
  })
})
