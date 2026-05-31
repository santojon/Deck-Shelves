import { useState } from 'react'
import { DialogButton, Focusable, TextField, ToggleField, DropdownItem } from '../../../../runtime/host/decky'
import { FieldContainer } from '../../../ui'
import { pickImageFile } from '../../../../core/imagePicker'

// Synthetic-card editor. Per-row rules tracked live so the user can
// see what's available:
//   - text XOR image (radio-style mode switch)
//   - URL link only meaningful when text or image is set (disabled
//     otherwise — schema rejects link without content)
//   - placeholder toggle independent
//   - position is NOT editable here; new cards land at the slot the
//     user has focused in the preview, and the order is owned by the
//     manual-order grid (auto-engaged when the first decoration is
//     added)
type SyntheticCardInput = {
  position: number
  image?: string
  text?: string
  link?: { type: 'app' | 'url'; value: string }
  size: 'normal' | 'featured'
  alpha?: number
  placeholder?: boolean
}

export interface DecorationTabProps {
  t: (k: any) => string
  cards: SyntheticCardInput[]
  setCards: (next: SyntheticCardInput[]) => void
  // Position the next "+ Add decoration" should land at — driven by
  // the preview's focused-slot tracker. Falls back to the end of the
  // row when no slot is focused.
  defaultPosition: number
  // Called once when the user inserts the first decoration so the
  // outer modal can auto-switch the shelf to manual sort + inherit
  // the current resolved order.
  onFirstCardAdded?: () => void
}

function sizeOptions(t: (k: any) => string) {
  return [
    { data: 'normal', label: t('decoration_size_normal') },
    { data: 'featured', label: t('decoration_size_featured') },
  ]
}

export function DecorationTab({ t, cards, setCards, defaultPosition, onFirstCardAdded }: DecorationTabProps) {
  const [pickingImageIdx, setPickingImageIdx] = useState<number | null>(null)
  const updateCard = (idx: number, patch: Partial<SyntheticCardInput>) => {
    const next = cards.slice()
    next[idx] = { ...next[idx], ...patch }
    setCards(next)
  }
  const removeCard = (idx: number) => {
    const next = cards.slice()
    next.splice(idx, 1)
    setCards(next)
  }
  const addCard = () => {
    const wasEmpty = cards.length === 0
    setCards([...cards, { position: defaultPosition, size: 'normal' }])
    if (wasEmpty) onFirstCardAdded?.()
  }
  const onBrowseImage = async (idx: number) => {
    setPickingImageIdx(idx)
    try {
      const path = await pickImageFile()
      if (path) updateCard(idx, { image: path })
    } finally {
      setPickingImageIdx(null)
    }
  }

  return (
    <FieldContainer scrollable>
      <div style={{ padding: '4px 0 12px', fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
        {t('decoration_intro')}
      </div>
      {cards.map((c, idx) => {
        // Mode is derived from which field is DEFINED (not just non-empty).
        // Picking "text" in the dropdown sets `text: ''` initially; checking
        // `length > 0` flipped the mode back to 'none' so the input never
        // mounted. Using `!== undefined` keeps the chosen mode sticky while
        // the user types.
        const hasImage = typeof c.image === 'string'
        const hasText = typeof c.text === 'string'
        const hasContent = (hasImage && (c.image ?? '').length > 0) || (hasText && (c.text ?? '').length > 0)
        const mode: 'text' | 'image' | 'none' = hasImage ? 'image' : hasText ? 'text' : 'none'
        const setMode = (next: 'text' | 'image' | 'none') => {
          if (next === 'image') updateCard(idx, { text: undefined, image: c.image ?? '' })
          else if (next === 'text') updateCard(idx, { image: undefined, text: c.text ?? '' })
          else updateCard(idx, { image: undefined, text: undefined, link: undefined })
        }
        // Link string. URL-only — `type: 'app'` removed from the editor
        // per the latest UX refresh; storage still accepts both for back-
        // compat, but the user-facing editor never produces app-links.
        const linkUrl = c.link?.type === 'url' ? c.link.value : ''
        const setLinkUrl = (v: string) => {
          if (!v) updateCard(idx, { link: undefined })
          else updateCard(idx, { link: { type: 'url', value: v.slice(0, 512) } })
        }
        return (
          <div key={idx} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 10, marginBottom: 10 }}>
            <DropdownItem
              label={t('decoration_mode')}
              rgOptions={[
                { data: 'none', label: t('decoration_mode_none') },
                { data: 'text', label: t('decoration_mode_text') },
                { data: 'image', label: t('decoration_mode_image') },
              ]}
              selectedOption={mode}
              onChange={(opt: any) => setMode((opt?.data ?? opt) as any)}
            />
            {mode === 'text' && (
              <TextField label={t('decoration_text')} value={c.text ?? ''} onChange={(e: any) => updateCard(idx, { text: String(e.target?.value ?? '').slice(0, 64) })} />
            )}
            {mode === 'image' && (
              <>
                <Focusable style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
                  <div style={{ flex: 1, fontSize: 13, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.image ? c.image : t('decoration_image_pick_hint')}
                  </div>
                  <DialogButton onClick={() => onBrowseImage(idx)} style={{ minWidth: 120 }} disabled={pickingImageIdx === idx}>
                    {pickingImageIdx === idx ? t('working') : t('decoration_image_browse')}
                  </DialogButton>
                </Focusable>
              </>
            )}
            <DropdownItem
              label={t('decoration_size')}
              rgOptions={sizeOptions(t)}
              selectedOption={c.size ?? 'normal'}
              onChange={(opt: any) => updateCard(idx, { size: ((opt?.data ?? opt) === 'featured' ? 'featured' : 'normal') })}
            />
            <ToggleField label={t('decoration_placeholder')} checked={c.placeholder === true} onChange={(v: boolean) => updateCard(idx, { placeholder: v })} />
            {/* Link only appears when the card has text or image —
                a non-focusable gap with a link makes no UX sense (the
                user can never reach it) and the schema strips it on
                save anyway. Hiding the field entirely prevents typing
                a URL into a card that would silently lose it. */}
            {hasContent && (
              <TextField label={t('decoration_link_url')} value={linkUrl} onChange={(e: any) => setLinkUrl(String(e.target?.value ?? ''))} />
            )}
            <Focusable style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <DialogButton onClick={() => removeCard(idx)} style={{ minWidth: 100 }}>{t('remove')}</DialogButton>
            </Focusable>
          </div>
        )
      })}
      <Focusable style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <DialogButton onClick={addCard} style={{ minWidth: 180 }}>{t('decoration_add')}</DialogButton>
      </Focusable>
    </FieldContainer>
  )
}
