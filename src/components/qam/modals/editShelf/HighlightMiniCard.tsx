import { useEffect, useMemo, useRef, useState } from 'react'
import { Focusable } from '@decky/ui'
import { CheckIcon } from '../../../filter/utils'
import { getLandscapeUrls, getPortraitFallbacks } from '../../../../core/steamAssets'

/**
 * Mini art card rendered in the shelf preview rows. Handles:
 * - Portrait vs landscape (featured) art with fallback chain through
 *   customimages, hero/portrait URLs, and Steam CDN variants.
 * - Name-only placeholder when no image resolves.
 * - Selected indicator (green outline + CheckIcon) for highlight picker.
 * - Grabbed indicator (amber outline + glow) for manual-sort grab mode.
 * - Optional left/right shift chevrons (Source tab only).
 */
export function HighlightMiniCard({
  appid, name, portraitUrl, heroUrl, featured, selected, grabbed, width, height, onToggle, onShiftLeft, onShiftRight, onPointerDown,
}: {
  appid: number; name: string; portraitUrl?: string; heroUrl?: string;
  featured: boolean; selected: boolean; grabbed?: boolean;
  width: number; height: number; onToggle: (() => void) | null;
  onShiftLeft?: (() => void) | null; onShiftRight?: (() => void) | null;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const urls = useMemo(() => {
    const list: string[] = []
    if (featured && appid > 0) {
      for (const u of getLandscapeUrls(appid)) list.push(u)
      if (heroUrl && !list.includes(heroUrl)) list.push(heroUrl)
    } else {
      if (appid > 0) {
        list.push(`/customimages/${appid}p.png`)
        list.push(`/customimages/${appid}p.jpg`)
      }
      if (portraitUrl && !list.includes(portraitUrl)) list.push(portraitUrl)
      if (heroUrl && !list.includes(heroUrl)) list.push(heroUrl)
      if (appid > 0) {
        for (const u of getPortraitFallbacks(appid)) if (!list.includes(u)) list.push(u)
      }
    }
    return list
  }, [appid, portraitUrl, heroUrl, featured])

  const imgRef = useRef<HTMLImageElement>(null)
  const idxRef = useRef(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    idxRef.current = 0
    setFailed(false)
    if (imgRef.current && urls[0]) imgRef.current.src = urls[0]
  }, [urls])

  const onErr = () => {
    idxRef.current += 1
    if (imgRef.current && idxRef.current < urls.length) imgRef.current.src = urls[idxRef.current]
    else setFailed(true)
  }

  const interactive = !!onToggle
  const noop = () => {}
  return (
    <Focusable
      className='ds-highlight-mini'
      data-appid={appid}
      onClick={interactive ? onToggle : noop}
      onOKButton={interactive ? onToggle : noop}
      onPointerDown={onPointerDown}
      style={{
        width, minWidth: width, height, flexShrink: 0,
        overflow: 'hidden', cursor: interactive ? 'pointer' : 'default',
        background: 'linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))',
        outline: grabbed ? '2px solid #ffd54f' : (selected ? '2px solid #4caf50' : '1px solid rgba(255,255,255,0.12)'),
        boxShadow: grabbed ? '0 0 0 3px rgba(255, 213, 79, 0.35)' : undefined,
        transition: 'width 0.15s ease, outline 0.1s ease, box-shadow 0.1s ease',
        position: 'relative',
        borderRadius: 0,
      }}
    >
      {failed || !urls[0] ? (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: featured ? 16 : 6, boxSizing: 'border-box', textAlign: 'center' }}>
          <span style={{ fontSize: featured ? 12 : 10, opacity: 0.6, wordBreak: 'break-word', lineHeight: 1.3 }}>{name}</span>
        </div>
      ) : (
        <img ref={imgRef} src={urls[0]} alt={name} loading='lazy' onError={onErr} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      )}
      {selected && (
        <div style={{ position: 'absolute', top: 4, left: 4, lineHeight: 0 }} aria-hidden='true'>
          <CheckIcon />
        </div>
      )}
      {(onShiftLeft !== undefined || onShiftRight !== undefined) && (
        <>
          <div
            onClick={(e) => { e.stopPropagation(); onShiftLeft?.() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', left: 1, top: '50%', transform: 'translateY(-50%)', width: 12, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onShiftLeft ? 'pointer' : 'default', opacity: onShiftLeft ? 1 : 0.35, pointerEvents: onShiftLeft ? 'auto' : 'none', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
            aria-hidden='true'
          >
            <svg width='8' height='14' viewBox='0 0 8 14' fill='none'>
              <path d='M6 1 L1.5 7 L6 13' stroke='#fff' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
          </div>
          <div
            onClick={(e) => { e.stopPropagation(); onShiftRight?.() }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{ position: 'absolute', right: 1, top: '50%', transform: 'translateY(-50%)', width: 12, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: onShiftRight ? 'pointer' : 'default', opacity: onShiftRight ? 1 : 0.35, pointerEvents: onShiftRight ? 'auto' : 'none', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.9))' }}
            aria-hidden='true'
          >
            <svg width='8' height='14' viewBox='0 0 8 14' fill='none'>
              <path d='M2 1 L6.5 7 L2 13' stroke='#fff' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
          </div>
        </>
      )}
    </Focusable>
  )
}
