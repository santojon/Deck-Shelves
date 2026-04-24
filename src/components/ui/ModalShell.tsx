import { DeckModalStyles } from '../styles/DeckModalStyles'

/**
 * Wrapper used by every `ConfirmModal`-based modal in the project.
 *
 * Provides:
 * - The `.deck-shelves-modal-scope` class, which `DeckModalStyles` targets
 *   to restyle Decky's BottomButtons, field paddings, and text inputs so
 *   they match the plugin's visual pattern.
 * - A single `<DeckModalStyles />` instance so every modal gets consistent
 *   styling without each one importing and rendering it.
 *
 * Use like:
 *   <ModalShell>
 *     <ConfirmModal ...>...</ConfirmModal>
 *   </ModalShell>
 */
export function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      {children}
    </div>
  )
}
