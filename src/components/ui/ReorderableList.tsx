import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Field, Focusable, GamepadButton } from '../../runtime/host/decky';
import i18n from '../../i18n';

// Reorderable list. State is `{ mode, order: T[] }`; swaps are
// immutable splices keyed by entry id (falls back to position).

export type ReorderableEntry<T> = {
  label: ReactNode;
  position: number;
  data?: T;
};

export type ReorderableListProps<T> = {
  entries: ReorderableEntry<T>[];
  onSave: (entries: ReorderableEntry<T>[]) => void;
  interactables?: (props: { entry: ReorderableEntry<T> }) => ReactNode;
  animate?: boolean;
  fieldProps?: any;
};

type Mode = 'view' | 'edit';
type ListState<T> = { mode: Mode; order: ReorderableEntry<T>[] };

const SCOPE_ATTR = 'data-ds-reorder';
const SCOPE_STYLE = `
[${SCOPE_ATTR}] > div { transition: transform .22s cubic-bezier(.2,.7,.25,1), opacity .22s ease; }
[${SCOPE_ATTR}][data-ds-reorder-mode="edit"] > div { transform: scale(.94); opacity: .72; }
[${SCOPE_ATTR}][data-ds-reorder-mode="edit"] > div[data-ds-reorder-focused="1"] { transform: scale(1); opacity: 1; }
`;

function sortByPosition<T>(list: ReorderableEntry<T>[]): ReorderableEntry<T>[] {
  return list.slice().sort((a, b) => a.position - b.position);
}

function swap<T>(list: ReorderableEntry<T>[], i: number, j: number): ReorderableEntry<T>[] {
  if (i === j || i < 0 || j < 0 || i >= list.length || j >= list.length) return list;
  const next = list.slice();
  const tmp = next[i];
  // Build new entry objects so positions reflect the new order without
  // mutating callers' references.
  next[i] = { ...next[j], position: i };
  next[j] = { ...tmp, position: j };
  return next;
}

export function ReorderableList<T>(props: ReorderableListProps<T>) {
  const [state, setState] = useState<ListState<T>>(() => ({
    mode: 'view',
    order: sortByPosition(props.entries),
  }));
  // Latest order kept in a ref so the X / B handlers always read fresh
  // state without re-binding their closures on every reorder.
  const orderRef = useRef(state.order);
  orderRef.current = state.order;

  // Per-row refs to refocus the moved row after a swap — the outer
  // Focusable tracks focus by physical position; without an explicit
  // .focus() the next press swaps the wrong item.
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingFocusIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const id = pendingFocusIdRef.current;
    if (!id) return;
    pendingFocusIdRef.current = null;
    const el = rowRefs.current.get(id);
    if (!el) return;
    const target = (el.querySelector('[tabindex]:not([tabindex="-1"]), button, [role="button"]') as HTMLElement | null) ?? el;
    try { target.focus?.(); } catch {}
  }, [state.order]);

  useEffect(() => {
    setState((prev) => ({ mode: prev.mode, order: sortByPosition(props.entries) }));
  }, [props.entries]);

  function toggleMode() {
    setState((prev) => {
      const next: Mode = prev.mode === 'edit' ? 'view' : 'edit';
      if (next === 'view') props.onSave(prev.order);
      return { mode: next, order: prev.order };
    });
  }

  function onContainerButton(e: any) {
    if (e?.detail?.button === GamepadButton.CANCEL && state.mode === 'edit') {
      setState((prev) => {
        props.onSave(prev.order);
        return { mode: 'view', order: prev.order };
      });
    }
  }

  const xHint = useMemo(
    () =>
      (state.mode === 'edit'
        ? i18n.t('reorder_save_order')
        : i18n.t('reorder_label')) as string,
    [state.mode],
  );

  return (
    <>
      <style>{SCOPE_STYLE}</style>
      <div
        style={{
          width: 'inherit',
          flex: '1 1 1px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Focusable
          onSecondaryButton={toggleMode}
          onSecondaryActionDescription={xHint}
          onClick={toggleMode}
          onButtonDown={onContainerButton}
          {...{ [SCOPE_ATTR]: '' }}
          data-ds-reorder-mode={state.mode}
        >
          {state.order.map((entry, idx) => (
            <Row<T>
              key={(entry.data as any)?.id ?? entry.position}
              entry={entry}
              index={idx}
              total={state.order.length}
              editing={state.mode === 'edit'}
              fieldProps={props.fieldProps}
              rowRefs={rowRefs}
              onSwap={(direction) => {
                const cur = orderRef.current;
                const i = cur.findIndex((e) => e === entry || ((e.data as any)?.id !== undefined && (e.data as any)?.id === (entry.data as any)?.id));
                if (i < 0) return;
                const j = i + direction;
                const next = swap(cur, i, j);
                if (next !== cur) {
                  const movedId = (entry.data as any)?.id;
                  if (movedId !== undefined && movedId !== null) pendingFocusIdRef.current = String(movedId);
                  setState((prev) => ({ mode: prev.mode, order: next }));
                }
              }}
            >
              {props.interactables ? <props.interactables entry={entry} /> : null}
            </Row>
          ))}
        </Focusable>
      </div>
    </>
  );
}

function Row<T>({
  entry,
  index,
  total,
  editing,
  fieldProps,
  rowRefs,
  onSwap,
  children,
}: {
  entry: ReorderableEntry<T>;
  index: number;
  total: number;
  editing: boolean;
  fieldProps?: any;
  rowRefs: { current: Map<string, HTMLDivElement> };
  onSwap: (direction: -1 | 1) => void;
  children: ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const entryId = (entry.data as any)?.id != null ? String((entry.data as any).id) : null;

  useEffect(() => {
    if (!entryId || !wrapperRef.current) return;
    rowRefs.current.set(entryId, wrapperRef.current);
    return () => { rowRefs.current.delete(entryId); };
  }, [entryId, rowRefs]);

  function onDirection(e: any) {
    if (!editing) return;
    const b = e?.detail?.button;
    if (b === GamepadButton.DIR_DOWN && index < total - 1) onSwap(1);
    else if (b === GamepadButton.DIR_UP && index > 0) onSwap(-1);
  }

  return (
    <div ref={wrapperRef} data-ds-reorder-focused={focused ? '1' : '0'}>
      <Field
        label={entry.label}
        {...fieldProps}
        focusable={!children}
        onButtonDown={onDirection}
        onGamepadFocus={() => setFocused(true)}
        onGamepadBlur={() => setFocused(false)}
      >
        <Focusable style={{ display: 'flex', width: '100%', position: 'relative' }}>
          {children}
        </Focusable>
      </Field>
    </div>
  );
}
