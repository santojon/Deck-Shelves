import { icons } from '../icons'
import { OnlineIcon } from '../../icons'

function isOnlineSource(source: any): boolean {
  return source?.type === 'wishlist' || source?.type === 'store';
}

export function ShelfListLabel({ shelf }: { shelf: any }) {
  const showOnlineBadge = isOnlineSource(shelf.source);
  return (
    <div className={`deck-shelves-label-cont ${shelf.hidden ? 'deck-shelves-hidden' : ''}`}>
      {showOnlineBadge && (
        <span title='Online feature — data cached from Steam Store' style={{ marginRight: 6, opacity: 0.75, display: 'inline-flex', verticalAlign: 'middle' }}>
          <OnlineIcon size={14} />
        </span>
      )}
      <span className='deck-shelves-hidden-icon'>{shelf.hidden ? icons.eyeClosed : icons.eyeOpen}</span>
      <span className='deck-shelves-label-text'>{shelf.title}</span>
    </div>
  )
}
