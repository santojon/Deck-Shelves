import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Field, Focusable, GamepadButton } from '@decky/ui';
import i18n from '../../i18n';

// Local reimplementation of `@decky/ui`'s `ReorderableList` for the sole
// purpose of translating the X-button hint shown on the QAM shelves list.
// Decky's component hard-codes `'Reorder'` / `'Save Order'` on the outer
// Focusable's `onSecondaryActionDescription`, and there is no prop to
// override it. Behaviour, focus tree and animation match Decky's
// implementation 1:1 — the only delta is `i18n.t('reorder_label')` /
// `i18n.t('reorder_save_order')` in place of the literal English strings.

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

export function ReorderableList<T>(props: ReorderableListProps<T>) {
  const animate = props.animate !== false;
  const [entryList, setEntryList] = useState<ReorderableEntry<T>[]>(
    [...props.entries].sort((a, b) => a.position - b.position),
  );
  const [reorderEnabled, setReorderEnabled] = useState(false);

  useEffect(() => {
    setEntryList([...props.entries].sort((a, b) => a.position - b.position));
  }, [props.entries]);

  function toggleReorderEnabled() {
    const next = !reorderEnabled;
    setReorderEnabled(next);
    if (!next) props.onSave(entryList);
  }

  function saveOnBackout(e: any) {
    if (e?.detail?.button === GamepadButton.CANCEL && reorderEnabled) {
      setReorderEnabled(false);
      props.onSave(entryList);
    }
  }

  return (
    <Fragment>
      <div
        style={{
          width: 'inherit',
          height: 'inherit',
          flex: '1 1 1px',
          scrollPadding: '48px 0px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignContent: 'stretch',
        }}
      >
        <Focusable
          onSecondaryButton={toggleReorderEnabled}
          onSecondaryActionDescription={
            reorderEnabled
              ? i18n.t('reorder_save_order') as string
              : i18n.t('reorder_label') as string
          }
          onClick={toggleReorderEnabled}
          onButtonDown={saveOnBackout}
        >
          {entryList.map((entry) => (
            <ReorderableItem<T>
              key={entry.position}
              animate={animate}
              listData={entryList}
              entryData={entry}
              reorderEntryFunc={setEntryList}
              reorderEnabled={reorderEnabled}
              fieldProps={props.fieldProps}
            >
              {props.interactables ? <props.interactables entry={entry} /> : null}
            </ReorderableItem>
          ))}
        </Focusable>
      </div>
    </Fragment>
  );
}

function ReorderableItem<T>(props: {
  animate: boolean;
  listData: ReorderableEntry<T>[];
  entryData: ReorderableEntry<T>;
  reorderEntryFunc: (next: ReorderableEntry<T>[]) => void;
  reorderEnabled: boolean;
  fieldProps?: any;
  children?: ReactNode;
}) {
  const [isSelected, _setIsSelected] = useState(false);
  const [isSelectedLastFrame, setIsSelectedLastFrame] = useState(false);
  const listEntries = props.listData;

  function onReorder(e: any) {
    if (!props.reorderEnabled) return;
    const currentIdx = listEntries.findIndex((d) => d === props.entryData);
    if (currentIdx < 0) return;
    const current = listEntries[currentIdx];
    let target = -1;
    if (e?.detail?.button === GamepadButton.DIR_DOWN) target = current.position + 1;
    else if (e?.detail?.button === GamepadButton.DIR_UP) target = current.position - 1;
    if (target >= listEntries.length || target < 0) return;
    const other = listEntries.find((d) => d.position === target);
    if (!other) return;
    const prevPos = current.position;
    current.position = other.position;
    other.position = prevPos;
    props.reorderEntryFunc([...listEntries].sort((a, b) => a.position - b.position));
  }

  async function setIsSelected(val: boolean) {
    _setIsSelected(val);
    for (let i = 0; i < 3; i++) await new Promise((res) => requestAnimationFrame(res as any));
    setIsSelectedLastFrame(val);
  }

  return (
    <div
      style={
        props.animate
          ? {
              transition:
                isSelected || isSelectedLastFrame
                  ? ''
                  : 'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
              transform: !props.reorderEnabled || isSelected ? 'scale(1)' : 'scale(0.9)',
              opacity: !props.reorderEnabled || isSelected ? 1 : 0.7,
            }
          : {}
      }
    >
      <Field
        label={props.entryData.label}
        {...props.fieldProps}
        focusable={!props.children}
        onButtonDown={onReorder}
        onGamepadBlur={() => setIsSelected(false)}
        onGamepadFocus={() => setIsSelected(true)}
      >
        <Focusable style={{ display: 'flex', width: '100%', position: 'relative' }}>
          {props.children}
        </Focusable>
      </Field>
    </div>
  );
}
