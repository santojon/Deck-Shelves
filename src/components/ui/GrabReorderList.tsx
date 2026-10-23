import { createRef, memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { Field, Focusable, GamepadButton } from '../../runtime/host/decky'
import { takeNavTreeFocus } from '../../runtime/navFocus'

type Stoppable = {
  preventDefault?: () => void
  stopPropagation?: () => void
  stopImmediatePropagation?: () => void
}

// Steam's gamepad event, as the Focusable callbacks receive it.
type PadEvent = (Stoppable & { detail?: { button?: unknown; is_repeat?: boolean; event?: Stoppable } }) | null | undefined

type Grab = {
  from: number // index in items of the grabbed row
  perm: number[] // would-be order, as item indexes
  base: string[] // ids of items when the row was grabbed
}

type GrabRowNodes = {
  target: RefObject<HTMLDivElement | null>
  row: RefObject<HTMLDivElement | null>
}

type RowTexts = { grab: string; drop: string; cancel: string; moves: { [button: number]: string } }

const LIST_STYLE = { display: 'flex', flexDirection: 'column' } as const
const noop = () => undefined

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

function isMoved(perm: readonly number[]): boolean {
  return perm.some((itemIndex, position) => itemIndex !== position)
}

function positionsOf(perm: readonly number[]): number[] {
  const positions: number[] = []
  perm.forEach((itemIndex, position) => { positions[itemIndex] = position })
  return positions
}

function isRepeat(evt: PadEvent): boolean {
  return Boolean(evt?.detail?.is_repeat)
}

function directionDelta(button: unknown): number | null {
  if (button === GamepadButton.DIR_UP) return -1
  if (button === GamepadButton.DIR_DOWN) return 1
  if (button === GamepadButton.DIR_LEFT || button === GamepadButton.DIR_RIGHT) return 0
  return null
}

function invoke(target: Stoppable | null | undefined, method: keyof Stoppable): void {
  try { target?.[method]?.() } catch { /* a host event may refuse the call */ }
}

// Keeps Steam's navigation and the QAM router from also acting on the press.
function absorb(evt: PadEvent): void {
  invoke(evt, 'preventDefault')
  invoke(evt, 'stopPropagation')
  invoke(evt, 'stopImmediatePropagation')
  invoke(evt?.detail?.event, 'preventDefault')
  invoke(evt?.detail?.event, 'stopPropagation')
}

function focusTarget(target: HTMLElement | null): void {
  if (!target || takeNavTreeFocus(target)) return
  try { target.focus() } catch { /* detached element */ }
}

function scrollIntoNearest(row: HTMLElement | null): void {
  if (!row || typeof row.scrollIntoView !== 'function') return
  try { row.scrollIntoView({ block: 'nearest' }) } catch { /* detached element */ }
}

/* Grab state for one list. Handlers read and write it here at once, so rapid
   presses act on the latest state; React state mirrors it for rendering. */
function createGrabControl(setGrab: (next: Grab | null) => void) {
  let grab: Grab | null = null
  let ids: string[] = []
  let onReorder: (ids: string[]) => void = noop
  let frame: { win: Window; id: number } | null = null
  let alive = true
  // A saved order the caller has not applied yet, and the row to refocus then.
  let landing: { base: string[]; order: string[]; refs: GrabRowNodes } | null = null

  const commit = (next: Grab | null) => { grab = next; setGrab(next) }
  const holds = (index: number) => alive && grab !== null && grab.from === index

  function cancelFrame(): void {
    if (!frame) return
    const { win, id } = frame
    frame = null
    try { win.cancelAnimationFrame(id) } catch { /* window already gone */ }
  }

  // One frame after the press: focus back on the row, then scroll it into view.
  function schedule(refs: GrabRowNodes): void {
    cancelFrame()
    const win = refs.row.current?.ownerDocument?.defaultView
    if (!win || typeof win.requestAnimationFrame !== 'function') return
    const id = win.requestAnimationFrame(() => {
      frame = null
      if (!alive) return
      focusTarget(refs.target.current)
      scrollIntoNearest(refs.row.current)
    })
    frame = { win, id }
  }

  function drop(refs: GrabRowNodes): void {
    const done = grab
    commit(null)
    schedule(refs)
    if (!done || !isMoved(done.perm)) return
    const order = done.perm.map((i) => done.base[i])
    landing = { base: done.base, order, refs }
    onReorder(order)
  }

  // The caller may apply the saved order a render later; moving the row's node
  // drops its focus, so take it back when that order arrives.
  function land(nextIds: string[]): void {
    if (!landing) return
    const { base, order, refs } = landing
    if (sameIds(order, nextIds)) { landing = null; schedule(refs) } else if (!sameIds(base, nextIds)) landing = null
  }

  function move(index: number, delta: number, refs: GrabRowNodes): void {
    const current = grab
    if (!current) return
    const from = current.perm.indexOf(index)
    const to = from + delta
    if (to !== from && to >= 0 && to < current.perm.length) {
      const perm = current.perm.slice()
      perm[from] = perm[to]
      perm[to] = index
      commit({ ...current, perm })
    }
    schedule(refs)
  }

  function cancelPress(evt: PadEvent, refs: GrabRowNodes): boolean {
    if (isRepeat(evt)) return false
    absorb(evt)
    commit(null)
    schedule(refs)
    return true
  }

  return {
    sync(nextIds: string[], nextOnReorder: (ids: string[]) => void): void {
      ids = nextIds
      onReorder = nextOnReorder
      if (grab && !sameIds(grab.base, nextIds)) { grab = null; cancelFrame() }
      land(nextIds)
    },
    attach(): () => void {
      alive = true
      return () => { alive = false; landing = null; cancelFrame() }
    },
    ok(index: number, evt: PadEvent, refs: GrabRowNodes): void {
      if (!alive || isRepeat(evt)) return
      if (holds(index)) { drop(refs); return }
      if (index >= ids.length) return
      cancelFrame()
      landing = null
      commit({ from: index, perm: ids.map((_id, i) => i), base: ids })
    },
    buttonDown(index: number, evt: PadEvent, refs: GrabRowNodes): boolean {
      if (!holds(index)) return false
      const button = evt?.detail?.button
      if (button === GamepadButton.CANCEL) return cancelPress(evt, refs)
      const delta = directionDelta(button)
      if (delta === null) return false
      absorb(evt)
      move(index, delta, refs)
      return true
    },
    direction(index: number, evt: PadEvent): boolean {
      if (!holds(index)) return false
      absorb(evt)
      return true
    },
    cancelButton(index: number, evt: PadEvent, refs: GrabRowNodes): void {
      if (holds(index)) cancelPress(evt, refs)
    },
    endSilently(): void {
      landing = null
      if (!grab) return
      cancelFrame()
      commit(null)
    },
  }
}

type GrabControl = ReturnType<typeof createGrabControl>

// While a row is grabbed, a touch or mouse press anywhere in the list's document ends the grab.
function useEndOnPointer(rootRef: RefObject<HTMLDivElement | null>, active: boolean, control: GrabControl): void {
  useEffect(() => {
    const doc = active ? rootRef.current?.ownerDocument : undefined
    if (!doc) return
    const end = () => control.endSilently()
    doc.addEventListener('pointerdown', end, true)
    return () => doc.removeEventListener('pointerdown', end, true)
  }, [rootRef, active, control])
}

function createGrabRowNodes(): GrabRowNodes {
  return { target: createRef<HTMLDivElement>(), row: createRef<HTMLDivElement>() }
}

// The descriptions show in Steam's footer while the row is held.
function grabbedProps(control: GrabControl, index: number, refs: GrabRowNodes, texts: RowTexts) {
  return {
    onButtonDown: (evt: PadEvent) => control.buttonDown(index, evt, refs),
    onGamepadDirection: (evt: PadEvent) => control.direction(index, evt),
    onCancelButton: (evt: PadEvent) => control.cancelButton(index, evt, refs),
    onCancelActionDescription: texts.cancel,
    actionDescriptionMap: texts.moves,
  }
}

type RowProps<T> = {
  item: T
  id: string
  index: number
  order: number | undefined
  grabbed: boolean
  texts: RowTexts
  control: GrabControl
  renderLabel: (item: T) => ReactNode
  renderActions: (item: T) => ReactNode
}

function GrabRowView<T>({ item, id, index, order, grabbed, texts, control, renderLabel, renderActions }: RowProps<T>) {
  const [refs] = useState(createGrabRowNodes)
  const nameArea = (
    <Focusable
      ref={refs.target}
      className='ds-grab-target'
      onActivate={noop}
      onOKButton={(evt: PadEvent) => control.ok(index, evt, refs)}
      onOKActionDescription={grabbed ? texts.drop : texts.grab}
      {...(grabbed ? grabbedProps(control, index, refs, texts) : {})}
    >
      {renderLabel(item)}
    </Focusable>
  )
  return (
    <div
      ref={refs.row}
      className='ds-grab-row'
      data-ds-grab-row={id}
      data-ds-grabbed={grabbed ? '1' : undefined}
      style={order === undefined ? undefined : { order }}
    >
      <Field focusable={false} label={nameArea} childrenLayout='inline' childrenContainerWidth='min' inlineWrap='keep-inline'>
        {renderActions(item)}
      </Field>
    </div>
  )
}

// Rows re-render only when their own props change, so a move costs two rows.
const GrabRow = memo(GrabRowView) as typeof GrabRowView

/* A list the controller reorders one row at a time: A on a name grabs the row,
   the D-pad moves it, A drops it (saving once if its place changed) and B puts
   it back. The DOM order stays fixed during a grab; CSS order shows the move. */
export function GrabReorderList<T>({ items, getId, renderLabel, renderActions, onReorder }: {
  items: T[]
  getId: (item: T) => string
  renderLabel: (item: T) => ReactNode
  renderActions: (item: T) => ReactNode
  onReorder: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const [grab, setGrab] = useState<Grab | null>(null)
  const [control] = useState(() => createGrabControl(setGrab))
  const rootRef = useRef<HTMLDivElement>(null)
  const ids = items.map((item) => getId(item))
  // Another path changed the ids or their order: that ends the grab.
  const stale = grab !== null && !sameIds(grab.base, ids)
  if (stale) setGrab(null)
  const live = stale ? null : grab
  useLayoutEffect(() => { control.sync(ids, onReorder) })
  useEffect(() => control.attach(), [control])
  useEndOnPointer(rootRef, live !== null, control)
  const grabText = t('reorder_label')
  const dropText = t('reorder_save_order')
  const cancelText = t('cancel')
  const upText = t('move_up')
  const downText = t('move_down')
  const texts = useMemo(
    () => ({
      grab: grabText,
      drop: dropText,
      cancel: cancelText,
      moves: { [GamepadButton.DIR_UP]: upText, [GamepadButton.DIR_DOWN]: downText },
    }),
    [grabText, dropText, cancelText, upText, downText],
  )
  const positions = live ? positionsOf(live.perm) : null
  return (
    <div ref={rootRef} className='ds-grab-list' style={LIST_STYLE}>
      {items.map((item, index) => (
        <GrabRow
          key={ids[index]}
          item={item}
          id={ids[index]}
          index={index}
          order={positions?.[index]}
          grabbed={live?.from === index}
          texts={texts}
          control={control}
          renderLabel={renderLabel}
          renderActions={renderActions}
        />
      ))}
    </div>
  )
}
