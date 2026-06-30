import { DeckModalStyles } from '../styles/DeckModalStyles'

export function ModalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className='deck-shelves-modal-scope'>
      <DeckModalStyles />
      {children}
    </div>
  )
}
