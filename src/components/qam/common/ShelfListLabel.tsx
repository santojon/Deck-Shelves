import { icons } from '../icons'

function isOnlineSource(source: any): boolean {
  return source?.type === 'wishlist';
}

export function ShelfListLabel({ shelf }: { shelf: any }) {
  const showOnlineBadge = isOnlineSource(shelf.source);
  return (
    <div className={`deck-shelves-label-cont ${shelf.hidden ? 'deck-shelves-hidden' : ''}`}>
      <span className='deck-shelves-hidden-icon'>{shelf.hidden ? icons.eyeClosed : icons.eyeOpen}</span>
      <span className='deck-shelves-label-text'>{shelf.title}</span>
      {showOnlineBadge && (
        <span title='Online feature' style={{ marginLeft: 4, fontSize: 10, opacity: 0.7, verticalAlign: 'middle' }}>⚑</span>
      )}
    </div>
  )
}
