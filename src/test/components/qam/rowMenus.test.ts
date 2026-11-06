// @vitest-environment jsdom
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  opened: [] as Array<{ menu: unknown; anchor: unknown }>,
  textChange: null as null | ((change: unknown) => void),
  confirmAction: vi.fn(),
  openManagedModal: vi.fn(),
}))

vi.mock('../../../runtime/host/decky', () => ({
  Menu: ({ label, children }: any) => h('div', { 'data-menu': label }, children),
  MenuGroup: ({ label, children }: any) => h('div', { 'data-group': label }, children),
  MenuItem: ({ disabled, onSelected, children }: any) => h('button', { className: 'item', disabled: !!disabled, onClick: onSelected }, children),
  MenuSeparator: () => h('hr', { className: 'separator' }),
  DialogButton: ({ onClick, onOKActionDescription, children, ...rest }: any) => {
    const data = Object.fromEntries(Object.entries(rest).filter(([key]) => key.startsWith('data-')))
    return h('button', { ...data, className: 'row-button', 'data-hint': onOKActionDescription, onClick }, children)
  },
  showContextMenu: (menu: unknown, anchor: unknown) => { host.opened.push({ menu, anchor }) },
  Focusable: ({ className, children }: any) => h('div', { className }, children),
  TextField: ({ label, value, onChange }: any) => {
    host.textChange = onChange
    return h('input', { 'data-label': label, value, readOnly: true })
  },
}))
vi.mock('../../../components/qam/modals/ConfirmActionModal', () => ({ confirmAction: host.confirmAction }))
vi.mock('../../../components/qam/common/openManagedModal', () => ({ openManagedModal: host.openManagedModal }))
vi.mock('../../../components/qam/modals/EditShelfModal', () => ({ EditShelfModal: () => null }))
vi.mock('../../../components/qam/modals/DeleteConfirmModal', () => ({ DeleteConfirmModal: () => null }))
vi.mock('../../../components/qam/modals/EditSmartShelfModal', () => ({ EditSmartShelfModal: () => null }))
vi.mock('../../../components/qam/modals/DeleteConfirmSmartModal', () => ({ DeleteConfirmSmartModal: () => null }))
vi.mock('../../../components/qam/modals/SetProfileTriggerModal', () => ({ SetProfileTriggerModal: () => null }))
vi.mock('../../../features/profiles/RenameProfileModal', () => ({ RenameProfileModal: () => null }))
vi.mock('../../../core/shelfActions', () => ({ clearOnlineShelfCache: vi.fn() }))
vi.mock('../../../steam', () => ({ invalidateRandomSortCache: vi.fn() }))
vi.mock('../../../steam/smartShelves', () => ({ invalidateSmartShelfCache: vi.fn() }))
vi.mock('../../../core/shelfRefresh', () => ({ triggerShelfRefresh: vi.fn() }))
vi.mock('../../../core/userPaths', () => ({ joinDownloads: (name: string) => `/downloads/${name}` }))
// The list only needs to hand each item to renderActions here.
vi.mock('../../../components/qam/common/ReorderableShelfList', () => ({
  ReorderableShelfList: ({ items, renderActions }: any) => h('div', null, items.map((item: any) => h('div', { key: item.id }, renderActions(item)))),
}))

import { ShelfRowMenu, ShelfRowMenuButton } from '../../../components/qam/list/ShelfActions'
import { SmartShelfRowMenu } from '../../../components/qam/list/SmartShelfRowMenu'
import { UnifiedShelfList } from '../../../components/qam/list/UnifiedShelfList'
import { SavedPresetRow } from '../../../components/qam/list/SavedPresetRow'
import { ProfileRowMenu } from '../../../features/profiles/ProfileRowMenu'
import { QamToolbar, ToolbarButton } from '../../../components/qam/common/QamToolbar'
import { TitleField } from '../../../components/ui/TitleField'

const shelf = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Shelf ${id}`, hidden: false, source: { type: 'collection', id: 'c' }, ...extra }) as any

function controllerOf({ shelves = [] as any[], settings = {} as any } = {}) {
  const actions = {
    toggleShelfHidden: vi.fn(async () => {}),
    setAllShelvesOrder: vi.fn(async () => {}),
    setProfileLinkShelves: vi.fn(async () => true),
    exportProfiles: vi.fn(async () => true),
    deleteProfile: vi.fn(async () => true),
  }
  return { controller: { t: (key: string) => key, shelves, settings, actions } as any, actions }
}

let root: Root
let mount: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host.opened.length = 0
  host.confirmAction.mockReset()
  host.openManagedModal.mockReset()
  mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function show(element: ReactElement) {
  act(() => root.render(element))
  return mount
}

const items = (scope: ParentNode) => Array.from(scope.querySelectorAll<HTMLButtonElement>('.item'))
const labels = (scope: ParentNode) => items(scope).map((item) => item.textContent)
const itemOf = (scope: ParentNode, label: string) => items(scope).find((item) => item.textContent === label) as HTMLButtonElement

describe('shelf row menu', () => {
  it('lists the actions of a plain shelf, titled with its name', () => {
    const { controller } = controllerOf({ shelves: [shelf('a')] })
    const view = show(h(ShelfRowMenu, { controller, shelf: controller.shelves[0], index: 0, count: 1, onMove: vi.fn() }))
    expect(view.querySelector('[data-menu]')?.getAttribute('data-menu')).toBe('Shelf a')
    expect(labels(view)).toEqual(['edit_shelf', 'move_up', 'move_down', 'hide_shelf', 'duplicate_shelf', 'delete_shelf'])
    expect(view.querySelectorAll('hr.separator')).toHaveLength(3)
  })

  it('offers compose with each other shelf behind a confirmation', () => {
    const { controller } = controllerOf({ shelves: [shelf('a'), shelf('b'), shelf('c')] })
    const view = show(h(ShelfRowMenu, { controller, shelf: controller.shelves[0], index: 0, count: 3, onMove: vi.fn() }))
    const group = view.querySelector('[data-group="compose_with"]') as HTMLElement
    expect(labels(group)).toEqual(['Shelf b', 'Shelf c'])
    act(() => itemOf(group, 'Shelf c').click())
    expect(host.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'compose_with_confirm_title', okText: 'compose_with' }))
  })

  it('refreshes only online, shuffled and smart-source shelves', () => {
    const { controller } = controllerOf()
    const menuFor = (s: any) => show(h(ShelfRowMenu, { controller, shelf: s, index: 0, count: 1, onMove: vi.fn() }))
    expect(labels(menuFor(shelf('w', { source: { type: 'wishlist' } })))).toContain('refresh_cache')
    expect(labels(menuFor(shelf('r', { sort: 'random' })))).toContain('refresh')
    expect(labels(menuFor(shelf('s', { source: { type: 'smart' } })))).toContain('refresh')
    const plain = labels(menuFor(shelf('p')))
    expect(plain).not.toContain('refresh')
    expect(plain).not.toContain('refresh_cache')
  })

  it('keeps move up and down unavailable at the ends and moves one place', () => {
    const { controller } = controllerOf()
    const onMove = vi.fn()
    const top = show(h(ShelfRowMenu, { controller, shelf: shelf('a'), index: 0, count: 2, onMove }))
    expect(itemOf(top, 'move_up').disabled).toBe(true)
    expect(itemOf(top, 'move_down').disabled).toBe(false)
    act(() => itemOf(top, 'move_down').click())
    expect(onMove).toHaveBeenCalledWith(1)
    const bottom = show(h(ShelfRowMenu, { controller, shelf: shelf('b'), index: 1, count: 2, onMove }))
    expect(itemOf(bottom, 'move_down').disabled).toBe(true)
  })

  it('offers show for a hidden shelf', () => {
    const { controller, actions } = controllerOf()
    const view = show(h(ShelfRowMenu, { controller, shelf: shelf('a', { hidden: true }), index: 0, count: 1, onMove: vi.fn() }))
    act(() => itemOf(view, 'show_shelf').click())
    expect(actions.toggleShelfHidden).toHaveBeenCalledWith('a')
  })

  it('opens from its row button, next to the button, with the actions hint', () => {
    const { controller } = controllerOf({ shelves: [shelf('a')] })
    const view = show(h(ShelfRowMenuButton, { controller, shelf: controller.shelves[0], index: 0, count: 1, onMove: vi.fn() }))
    const button = view.querySelector('.row-button') as HTMLButtonElement
    expect(button.getAttribute('data-ds-shelf-actions')).toBe('a')
    expect(button.getAttribute('data-hint')).toBe('actions')
    act(() => button.click())
    expect(host.opened).toHaveLength(1)
    expect(host.opened[0].anchor).toBe(button)
  })
})

describe('smart shelf row menu', () => {
  it('has no duplicate, compose or refresh', () => {
    const { controller } = controllerOf({ shelves: [shelf('a'), shelf('b')] })
    const view = show(h(SmartShelfRowMenu, { controller, shelf: shelf('s', { source: { type: 'smart' } }), index: 0, count: 1, onMove: vi.fn() }))
    expect(labels(view)).toEqual(['edit_shelf', 'hide_shelf', 'move_up', 'move_down', 'delete_shelf'])
  })
})

describe('unified shelf list', () => {
  it('moves a shelf within the unified order from the row menu', () => {
    const { controller, actions } = controllerOf({
      shelves: [shelf('a'), shelf('b')],
      settings: { smartShelves: [shelf('s')], allShelvesOrder: ['s', 'a', 'b'] },
    })
    const view = show(h(UnifiedShelfList, { controller }))
    const buttons = Array.from(view.querySelectorAll<HTMLButtonElement>('.row-button'))
    expect(buttons[0].getAttribute('data-ds-smart-actions')).toBe('s')
    act(() => buttons[1].click())
    const menu = show(host.opened[0].menu as ReactElement)
    act(() => itemOf(menu, 'move_up').click())
    expect(actions.setAllShelvesOrder).toHaveBeenCalledWith(['a', 's', 'b'])
  })
})

describe('profile row menu', () => {
  const profile = { id: 'p1', name: 'Night Mode', createdAt: '', snapshot: {}, linkShelves: true }

  it('offers set trigger only while profile triggers are on', () => {
    const off = controllerOf({ settings: { profileTriggersEnabled: false } })
    expect(labels(show(h(ProfileRowMenu, { controller: off.controller, profile })))).not.toContain('settings_profiles_set_trigger')
    const on = controllerOf({ settings: { profileTriggersEnabled: true } })
    expect(labels(show(h(ProfileRowMenu, { controller: on.controller, profile })))).toContain('settings_profiles_set_trigger')
  })

  it('names the shelf link by its state and exports the profile to Downloads', () => {
    const { controller, actions } = controllerOf()
    const view = show(h(ProfileRowMenu, { controller, profile }))
    expect(view.querySelector('[data-menu]')?.getAttribute('data-menu')).toBe('Night Mode')
    act(() => itemOf(view, 'profile_unlink_shelves_action').click())
    expect(actions.setProfileLinkShelves).toHaveBeenCalledWith('p1', false)
    act(() => itemOf(view, 'settings_profiles_export').click())
    expect(actions.exportProfiles).toHaveBeenCalledWith('/downloads/profile-night-mode.json', 'p1')
  })

  it('deletes only after the confirmation', () => {
    const { controller, actions } = controllerOf()
    const view = show(h(ProfileRowMenu, { controller, profile }))
    act(() => itemOf(view, 'settings_profiles_delete').click())
    expect(actions.deleteProfile).not.toHaveBeenCalled()
    const options = host.confirmAction.mock.calls[0][0]
    expect(options).toMatchObject({ title: 'settings_profiles_delete_confirm_title', okText: 'settings_profiles_delete' })
    options.onConfirm(false)
    expect(actions.deleteProfile).toHaveBeenCalledWith('p1')
  })
})

describe('saved preset row', () => {
  it('shows the name and a menu with the texts the list passes', () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const view = show(h(SavedPresetRow, { t: (key: string) => key, name: 'Indies', renameLabel: 'Rename it', deleteLabel: 'Drop it', onRename, onDelete }))
    expect(view.querySelector('.deck-shelves-nameplate-text')?.textContent).toBe('Indies')
    act(() => (view.querySelector('.row-button') as HTMLButtonElement).click())
    const menu = show(host.opened[0].menu as ReactElement)
    expect(menu.querySelector('[data-menu]')?.getAttribute('data-menu')).toBe('actions')
    act(() => itemOf(menu, 'Drop it').click())
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onRename).not.toHaveBeenCalled()
  })
})

describe('toolbar and title field', () => {
  it('wraps each toolbar button for the device scenarios and names it in the hint', () => {
    const onActivate = vi.fn()
    const view = show(h(QamToolbar, null, h(ToolbarButton, { icon: 'icon', label: 'Import shelves', onActivate })))
    const button = view.querySelector('.deck-shelves-bare-row > .deck-shelves-action-btn button') as HTMLButtonElement
    expect(button.getAttribute('data-hint')).toBe('Import shelves')
    act(() => button.click())
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('labels the client text field and hands back plain text', () => {
    const onChange = vi.fn()
    const view = show(h(TitleField, { label: 'File name', value: 'old.json', onChange }))
    expect(view.querySelector('.deck-shelves-title-input input')?.getAttribute('data-label')).toBe('File name')
    host.textChange?.({ target: { value: 'new.json' } })
    expect(onChange).toHaveBeenCalledWith('new.json')
  })
})
