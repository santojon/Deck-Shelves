/* eslint-disable complexity */
import { useEffect, useState } from 'react'
import { DialogButton, Focusable, TextField, ToggleField, DropdownItem } from '../../../../runtime/host/decky'
import { pickImageFile } from '../../../../core/imagePicker'
import { resolveLocalImage, subscribeLocalImage } from '../../../../core/localImage'

// Synthetic-card editor — horizontal carousel of card configs with a
// master/detail interaction model.
//
// Navigation:
//   - Tabs row (above) ↓ → first card config block focused.
//   - L/R between card blocks; the trailing `[+]` block is the last
//     focusable in the row and creates a new card.
//   - ↓ from any card block → shelf preview (lives below this tab).
//   - A on a card block → "select" the card: the block expands inline,
//     focus moves to the first field inside, ↑/↓ now walks through the
//     card's fields. B collapses the block back to the summary view.
//
// Per-row rules tracked live so the user can see what's available:
//   - text XOR image (radio-style mode switch)
//   - URL link only meaningful when text or image is set (disabled
//     otherwise — schema rejects link without content)
//   - placeholder toggle independent
//   - heroImage only meaningful when there is base content
//   - shadowMode only meaningful when the card is focusable (has link)
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
  heroImage?: string
  shadowMode?: 'never' | 'onFocus' | 'always'
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

function shadowOptions(t: (k: any) => string) {
  return [
    { data: 'never', label: t('decoration_shadow_never') },
    { data: 'onFocus', label: t('decoration_shadow_on_focus') },
    { data: 'always', label: t('decoration_shadow_always') },
  ]
}

// Inline preview thumb — uses the same backend image resolver as the
// home card so local file:// paths render via the base64 cache.
// Subscribes to the cache so the thumbnail appears as soon as the RPC
// returns (first render is null while the read is in flight).
function ImagePreview({ src, label, size = 64 }: { src: string | undefined; label: string; size?: number }) {
  const [, setTick] = useState(0)
  useEffect(() => subscribeLocalImage(() => setTick((n) => n + 1)), [])
  const resolved = src ? resolveLocalImage(src) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <div style={{
        width: size, height: size,
        flexShrink: 0,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {resolved ? (
          <img src={resolved} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        ) : (
          <span style={{ fontSize: 10, opacity: 0.5, textAlign: 'center', padding: 4 }}>{label}</span>
        )}
      </div>
    </div>
  )
}

// Collapsed summary card — single Focusable, no nested fields. Shows
// a compact preview (image thumb / text / "empty"), the card number,
// and a couple of status badges so the user can tell decorations
// apart at a glance. Activate enters edit mode.
function CardSummary({
  t,
  card,
  idx,
  onSelect,
}: {
  t: (k: any) => string
  card: SyntheticCardInput
  idx: number
  onSelect: (idx: number) => void
}) {
  const isLinked = !!(card.link && (card.link.type === 'url' ? card.link.value : ''))
  const hasHero = !!card.heroImage
  const isFeat = card.size === 'featured'
  const isTextOnly = !!card.text && !card.image
  return (
    <Focusable
      className="ds-deco-card-summary"
      focusClassName="gpfocus"
      onActivate={() => onSelect(idx)}
      onOKButton={() => onSelect(idx)}
      onOKActionDescription={t('decoration_card_select')}
      style={{
        flexShrink: 0,
        width: 200,
        scrollSnapAlign: 'start',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 8,
        padding: 10,
        background: 'rgba(255,255,255,0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 600 }}>
          {t('decoration_card_label')} #{idx + 1}
        </span>
        {isFeat && (
          <span style={{ fontSize: 10, opacity: 0.85, padding: '1px 6px', background: 'rgba(255,255,255,0.1)', borderRadius: 3 }}>
            {t('decoration_size_featured')}
          </span>
        )}
      </div>
      {/* Preview body — text-only cards show the text large + centred
          (no empty thumb to waste space); image / mixed / empty cards
          show the thumb with the picked image or an "empty" placeholder. */}
      {isTextOnly ? (
        // Same outer wrapper shape as ImagePreview (4 px vertical
        // padding) so text and image card summaries occupy identical
        // height in the carousel row.
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          <div style={{
            width: 140, height: 140,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 6,
            fontSize: 13,
            lineHeight: 1.3,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            overflow: 'hidden',
            wordBreak: 'break-word',
            boxSizing: 'border-box',
          }}>
            “{card.text}”
          </div>
        </div>
      ) : (
        <ImagePreview
          src={card.image}
          label={t('decoration_image_preview_empty')}
          size={140}
        />
      )}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', fontSize: 10, opacity: 0.7 }}>
        {isLinked && <span>🔗</span>}
        {hasHero && <span>🎨</span>}
        {card.placeholder && <span>▢</span>}
      </div>
    </Focusable>
  )
}

export function DecorationTab({ t, cards, setCards, defaultPosition, onFirstCardAdded }: DecorationTabProps) {
  const [pickingImageIdx, setPickingImageIdx] = useState<number | null>(null)
  const [pickingHeroIdx, setPickingHeroIdx] = useState<number | null>(null)
  // Master/detail state — `null` keeps every card collapsed (summary view,
  // single focusable, L/R nav between them + [+]). Setting it expands
  // the targeted card so its fields become focusable in vertical order;
  // B (cancel) on the expanded card collapses back to summary view.
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const updateCard = (idx: number, patch: Partial<SyntheticCardInput>) => {
    const next = cards.slice()
    next[idx] = { ...next[idx], ...patch }
    setCards(next)
  }
  const removeCard = (idx: number) => {
    const next = cards.slice()
    next.splice(idx, 1)
    setCards(next)
    if (selectedIdx === idx) setSelectedIdx(null)
    else if (selectedIdx != null && selectedIdx > idx) setSelectedIdx(selectedIdx - 1)
  }
  const addCard = () => {
    const wasEmpty = cards.length === 0
    setCards([...cards, { position: defaultPosition, size: 'normal' }])
    if (wasEmpty) onFirstCardAdded?.()
    // Auto-open the new card so the user can configure it immediately.
    setSelectedIdx(cards.length)
  }
  const onBrowseImage = async (idx: number, kind: 'image' | 'hero') => {
    const setter = kind === 'image' ? setPickingImageIdx : setPickingHeroIdx
    setter(idx)
    try {
      const path = await pickImageFile()
      if (path) updateCard(idx, kind === 'image' ? { image: path } : { heroImage: path })
    } finally {
      setter(null)
    }
  }

  return (
    <div style={{ padding: '4px 0 12px' }}>
      {/* Focus visual + horizontal-flow hint scoped to this tab. The
          .gpfocus glow makes selection obvious on dark cards (Steam's
          default ring is suppressed on our DS cards across the rest of
          the modal). Per-row horizontal flow comes from the explicit
          Focusable wrapper below, but inline CSS reinforces it so
          mouse/touch hover also signals reachability. */}
      <style>{`
        .ds-deco-tab-row > .Focusable.gpfocus,
        .ds-deco-tab-row > .Focusable:focus,
        .ds-deco-tab-row > .Focusable:hover {
          outline: 2px solid rgba(116, 168, 255, 0.9) !important;
          outline-offset: 2px !important;
          box-shadow: 0 0 0 4px rgba(116, 168, 255, 0.18) !important;
        }
        .ds-deco-card-summary.gpfocus,
        .ds-deco-card-summary:focus {
          background: rgba(116, 168, 255, 0.12) !important;
          border-color: rgba(116, 168, 255, 0.7) !important;
        }
      `}</style>
      <div style={{ padding: '4px 0 8px', fontSize: 12, opacity: 0.7, lineHeight: 1.4 }}>
        {t('decoration_intro')}
      </div>
      {/* Horizontal carousel. Wrapped in a Focusable so Steam's gamepad
          nav tree recognises the row as a horizontal flow (children laid
          out left-to-right). Without the wrapper, the parent FieldContainer
          treats every nested Focusable as vertical-flow, and D-pad ↑/↓
          (not L/R) ended up walking the cards. */}
      <Focusable
        className="ds-deco-tab-row"
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          overflowY: 'visible',
          padding: '4px 8px 12px 0',
          alignItems: 'stretch',
        }}
      >
        {cards.map((c, idx) => {
          if (selectedIdx !== idx) {
            return <CardSummary key={idx} t={t} card={c} idx={idx} onSelect={setSelectedIdx} />
          }

          // ─── Expanded card (selected): fields are nested focusables ────
          const hasImage = typeof c.image === 'string'
          const hasText = typeof c.text === 'string'
          const hasContent = (hasImage && (c.image ?? '').length > 0) || (hasText && (c.text ?? '').length > 0)
          const mode: 'text' | 'image' | 'none' = hasImage ? 'image' : hasText ? 'text' : 'none'
          const setMode = (next: 'text' | 'image' | 'none') => {
            if (next === 'image') updateCard(idx, { text: undefined, image: c.image ?? '' })
            else if (next === 'text') updateCard(idx, { image: undefined, text: c.text ?? '' })
            else updateCard(idx, { image: undefined, text: undefined, link: undefined })
          }
          const linkUrl = c.link?.type === 'url' ? c.link.value : ''
          const setLinkUrl = (v: string) => {
            if (!v) updateCard(idx, { link: undefined })
            else updateCard(idx, { link: { type: 'url', value: v.slice(0, 512) } })
          }
          const isFocusable = hasContent && !!linkUrl
          const heroEnabled = typeof c.heroImage === 'string'
          return (
            <Focusable
              key={idx}
              focusClassName="gpfocus"
              onCancelButton={() => setSelectedIdx(null)}
              style={{
                flexShrink: 0,
                width: 360,
                scrollSnapAlign: 'start',
                border: '1px solid rgba(116, 168, 255, 0.5)',
                boxShadow: '0 0 0 1px rgba(116, 168, 255, 0.25)',
                borderRadius: 8,
                padding: 12,
                background: 'rgba(116, 168, 255, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 600 }}>
                  {t('decoration_card_label')} #{idx + 1}
                </span>
              </div>
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
                    <div style={{ flex: 1, fontSize: 12, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.image ? c.image : t('decoration_image_pick_hint')}
                    </div>
                    <DialogButton onClick={() => onBrowseImage(idx, 'image')} style={{ minWidth: 90 }} disabled={pickingImageIdx === idx}>
                      {pickingImageIdx === idx ? t('working') : t('decoration_image_browse')}
                    </DialogButton>
                  </Focusable>
                  <ImagePreview src={c.image} label={t('decoration_image_preview_empty')} size={80} />
                </>
              )}
              <DropdownItem
                label={t('decoration_size')}
                rgOptions={sizeOptions(t)}
                selectedOption={c.size ?? 'normal'}
                onChange={(opt: any) => updateCard(idx, { size: ((opt?.data ?? opt) === 'featured' ? 'featured' : 'normal') })}
              />
              <ToggleField label={t('decoration_placeholder')} checked={c.placeholder === true} onChange={(v: boolean) => updateCard(idx, { placeholder: v })} />
              {hasContent && (
                <TextField label={t('decoration_link_url')} value={linkUrl} onChange={(e: any) => setLinkUrl(String(e.target?.value ?? ''))} />
              )}
              {isFocusable && (
                <DropdownItem
                  label={t('decoration_shadow_mode')}
                  rgOptions={shadowOptions(t)}
                  selectedOption={c.shadowMode ?? 'never'}
                  onChange={(opt: any) => {
                    const v = (opt?.data ?? opt) as 'never' | 'onFocus' | 'always'
                    updateCard(idx, { shadowMode: v === 'never' ? undefined : v })
                  }}
                />
              )}
              {hasContent && (
                <>
                  <ToggleField
                    label={t('decoration_hero_enable')}
                    checked={heroEnabled}
                    onChange={(v: boolean) => updateCard(idx, { heroImage: v ? (c.heroImage ?? '') : undefined })}
                  />
                  {heroEnabled && (
                    <>
                      <Focusable style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }}>
                        <div style={{ flex: 1, fontSize: 12, opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.heroImage ? c.heroImage : t('decoration_hero_pick_hint')}
                        </div>
                        <DialogButton onClick={() => onBrowseImage(idx, 'hero')} style={{ minWidth: 90 }} disabled={pickingHeroIdx === idx}>
                          {pickingHeroIdx === idx ? t('working') : t('decoration_image_browse')}
                        </DialogButton>
                      </Focusable>
                      <ImagePreview src={c.heroImage} label={t('decoration_hero_preview_empty')} size={80} />
                    </>
                  )}
                </>
              )}
              <Focusable style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
                <DialogButton onClick={() => setSelectedIdx(null)} style={{ flex: 1 }}>{t('decoration_card_done')}</DialogButton>
                <DialogButton onClick={() => removeCard(idx)} style={{ flex: 1 }}>{t('remove')}</DialogButton>
              </Focusable>
            </Focusable>
          )
        })}
        {/* Compact `[+]` — small square that's reliably reachable as the
            last item in the row. Activating creates + auto-selects a new
            card, which the carousel auto-scrolls into via the surrounding
            flex layout. */}
        <Focusable
          focusClassName="gpfocus"
          onActivate={addCard}
          onOKButton={addCard}
          onOKActionDescription={t('decoration_add')}
          style={{
            flexShrink: 0,
            width: 56,
            alignSelf: 'center',
            scrollSnapAlign: 'end',
            border: '1px dashed rgba(255,255,255,0.3)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 22,
            fontWeight: 400,
            opacity: 0.75,
            height: 56,
            background: 'rgba(255,255,255,0.02)',
          }}
        >
          +
        </Focusable>
      </Focusable>
    </div>
  )
}
