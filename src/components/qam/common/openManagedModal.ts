import type { ReactElement } from 'react'
import { showModal } from '../../../runtime/host/decky'
import { logInfo } from '../../../runtime/logger'
import { modalOpened } from '../../../runtime/openModals'

export function openManagedModal(render: (close: () => void) => ReactElement) {
  let handle: any = null
  let markClosed: () => void = () => {}
  const close = () => {
    markClosed()
    try {
      if (typeof handle === 'function') return handle()
      if (handle?.Close) return handle.Close()
      if (handle?.closeModal) return handle.closeModal()
      if (handle?.props?.closeModal) return handle.props.closeModal()
    } catch (e) { logInfo("SETTINGS", "modal close failed", String(e)) }
  }
  markClosed = modalOpened()
  handle = showModal(render(close))
  return close
}
