import { useRef, type ReactNode } from 'react'
import { Focusable } from '../../../runtime/host/decky'
import { EyeIcon, EyeOffIcon } from '../../icons'
import { takeNavTreeFocus } from '../../../runtime/navFocus'

export type HideableRowMode = 'qam' | 'sidecar'

export function HideableRow({ tk, hidden, setHidden, mode, t, children }: {
  tk: string
  hidden: boolean
  setHidden: (next: boolean) => void
  mode: HideableRowMode
  t: (k: string) => string
  children: ReactNode
}) {
  // Hiding the row in the QAM makes Steam rebuild the nav tree and steal focus, so take it back.
  const eyeRef = useRef<HTMLDivElement>(null)
  const toggle = () => {
    setHidden(!hidden)
    const el = eyeRef.current
    if (el) requestAnimationFrame(() => { try { takeNavTreeFocus(el) } catch {} })
  }
  if (mode === 'qam' && hidden) return null
  if (mode === 'qam') return <>{children}</>
  // flow-children='row' lets the d-pad reach the eye button.
  return (
    <Focusable className='ds-hide-row' flow-children='row' noFocusRing>
      {children}
      <Focusable
        ref={eyeRef as any}
        className='ds-eye-btn'
        onClick={toggle}
        onOKButton={toggle}
        onActivate={toggle}
        data-ds-eye-toggle={tk}
        data-ds-eye-state={hidden ? 'hidden' : 'shown'}
        title={hidden ? t('qam_show') : t('qam_hide')}
      >
        {hidden ? <EyeOffIcon /> : <EyeIcon />}
      </Focusable>
    </Focusable>
  )
}
