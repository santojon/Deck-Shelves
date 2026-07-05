import { useRef, type ReactNode } from 'react'
import { Focusable } from '../../../runtime/host/decky'
import { EyeIcon, EyeOffIcon } from '../../icons'
import { takeNavTreeFocus } from '../../../runtime/navFocus'

export type HideableRowMode = 'qam' | 'sidecar'

// Wraps a control so it can be hidden from the QAM: in the sidecar it renders
// with an eye toggle; in the QAM it renders the control (or nothing when
// hidden). Shared by the sidecar GeneralTab and the profiles section.
export function HideableRow({ tk, hidden, setHidden, mode, t, children }: {
  tk: string
  hidden: boolean
  setHidden: (next: boolean) => void
  mode: HideableRowMode
  t: (k: string) => string
  children: ReactNode
}) {
  /* Toggling shows/hides the row in the QAM main panel, which makes Steam
     re-resolve the nav tree and yank focus out of the sidecar — re-assert
     focus on the eye after the re-render so the sidecar stays usable. */
  const eyeRef = useRef<HTMLDivElement>(null)
  const toggle = () => {
    setHidden(!hidden)
    const el = eyeRef.current
    if (el) requestAnimationFrame(() => { try { takeNavTreeFocus(el) } catch {} })
  }
  if (mode === 'qam' && hidden) return null
  if (mode === 'qam') return <>{children}</>
  // sidecar: row with the control on the left and an eye button on the right.
  // flow-children='row' lets Steam's nav dpad-right into the eye button.
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
