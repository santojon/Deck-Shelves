import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelf } from '../../../types'
import { DeleteShelfConfirm } from './DeleteConfirmModal'

export function DeleteConfirmSmartModal({ closeModal, controller, shelf }: { closeModal?: () => void; controller: SettingsController; shelf: SmartShelf }) {
  return <DeleteShelfConfirm closeModal={closeModal} controller={controller} title={shelf.title} onConfirm={() => controller.actions.removeSmartShelf(shelf.id)} />
}
