import { vi, describe, it, expect, beforeEach } from 'vitest'

// The coupling helper shows a confirmation via confirmAction when a transition
// needs it; mock that so we can assert the branch + run the onConfirm callback.
vi.mock('../../components/qam/modals/ConfirmActionModal', () => ({
  confirmAction: vi.fn(),
}))

import { confirmAction } from '../../components/qam/modals/ConfirmActionModal'
import { applyGameInfoAboveToggle, applyHideTitleToggle } from '../../components/qam/common/gameInfoCoupling'

const t = (k: string) => k
const mockedConfirm = confirmAction as unknown as ReturnType<typeof vi.fn>

beforeEach(() => mockedConfirm.mockReset())

describe('applyGameInfoAboveToggle', () => {
  it('turning OFF just sets the value, no confirm', () => {
    const setGameInfoAbove = vi.fn(), setHideTitle = vi.fn()
    applyGameInfoAboveToggle({ next: false, hideTitle: true, t, setGameInfoAbove, setHideTitle })
    expect(setGameInfoAbove).toHaveBeenCalledWith(false)
    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('turning ON when title already hidden sets the value, no confirm', () => {
    const setGameInfoAbove = vi.fn(), setHideTitle = vi.fn()
    applyGameInfoAboveToggle({ next: true, hideTitle: true, t, setGameInfoAbove, setHideTitle })
    expect(setGameInfoAbove).toHaveBeenCalledWith(true)
    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('turning ON while title visible confirms, then sets both on confirm', () => {
    const setGameInfoAbove = vi.fn(), setHideTitle = vi.fn()
    applyGameInfoAboveToggle({ next: true, hideTitle: false, t, setGameInfoAbove, setHideTitle })
    // nothing applied until the user confirms
    expect(setGameInfoAbove).not.toHaveBeenCalled()
    expect(mockedConfirm).toHaveBeenCalledTimes(1)
    mockedConfirm.mock.calls[0][0].onConfirm()
    expect(setGameInfoAbove).toHaveBeenCalledWith(true)
    expect(setHideTitle).toHaveBeenCalledWith(true)
  })
})

describe('applyHideTitleToggle', () => {
  it('turning hide ON just sets the value, no confirm', () => {
    const setHideTitle = vi.fn(), setGameInfoAbove = vi.fn()
    applyHideTitleToggle({ next: true, infoAbove: true, t, setHideTitle, setGameInfoAbove })
    expect(setHideTitle).toHaveBeenCalledWith(true)
    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('showing the title (hide OFF) when info-above off sets the value, no confirm', () => {
    const setHideTitle = vi.fn(), setGameInfoAbove = vi.fn()
    applyHideTitleToggle({ next: false, infoAbove: false, t, setHideTitle, setGameInfoAbove })
    expect(setHideTitle).toHaveBeenCalledWith(false)
    expect(mockedConfirm).not.toHaveBeenCalled()
  })

  it('showing the title while info-above on confirms, then disables both on confirm', () => {
    const setHideTitle = vi.fn(), setGameInfoAbove = vi.fn()
    applyHideTitleToggle({ next: false, infoAbove: true, t, setHideTitle, setGameInfoAbove })
    expect(setHideTitle).not.toHaveBeenCalled()
    expect(mockedConfirm).toHaveBeenCalledTimes(1)
    mockedConfirm.mock.calls[0][0].onConfirm()
    expect(setHideTitle).toHaveBeenCalledWith(false)
    expect(setGameInfoAbove).toHaveBeenCalledWith(false)
  })
})
