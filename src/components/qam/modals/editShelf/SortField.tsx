import { DialogButton, Dropdown, Field, Focusable, type SingleDropdownOption } from '../../../../runtime/host/decky'
import i18n from '../../../../i18n'
import { SortDirectionButton } from './SortDirectionButton'
import { optionData } from './utils'

/* Normalise the sort/reverse props (single value or array) into the derived
   state the field renders from. Secondary keys exclude `manual` (invalidates
   manualOrder) and `random` (non-deterministic tiebreaker); a secondary key
   can only be added when multi-key is allowed and the primary isn't one of
   those two. */
function deriveSortState(
  sort: string | string[],
  reverse: boolean | boolean[],
  options: SingleDropdownOption[],
  allowMultiKey: boolean,
) {
  const sortArr: string[] = Array.isArray(sort) ? sort : [sort]
  const reverseArr: boolean[] = Array.isArray(reverse) ? reverse : sortArr.map(() => reverse)
  const primary = sortArr[0] ?? ''
  const primaryReverse = reverseArr[0] ?? false
  const isMulti = sortArr.length > 1
  const secondaryOptions = options.filter((o) => o.data !== 'manual' && o.data !== 'random')
  const canAddSecondary = allowMultiKey && primary !== 'manual' && primary !== 'random'
  return { sortArr, reverseArr, primary, primaryReverse, isMulti, secondaryOptions, canAddSecondary }
}

export function SortField({
  label,
  options,
  sort,
  onSortChange,
  reverse,
  onReverseChange,
  bottomSeparator = 'thick',
  allowMultiKey = false,
}: {
  label: string
  options: SingleDropdownOption[]
  sort: string | string[]
  onSortChange: (next: string | string[]) => void
  reverse: boolean | boolean[]
  onReverseChange: (next: boolean | boolean[]) => void
  bottomSeparator?: 'thick' | 'standard' | 'none'
  allowMultiKey?: boolean
}) {
  const t = (k: any) => i18n.t(k)

  const { sortArr, reverseArr, primary, primaryReverse, isMulti, secondaryOptions, canAddSecondary } =
    deriveSortState(sort, reverse, options, allowMultiKey)

  // If user picks manual/random as primary, secondary keys are stripped.
  const setPrimary = (next: string) => {
    if (next === 'manual' || next === 'random') {
      onSortChange(next)
      onReverseChange(reverseArr[0] ?? false)
      return
    }
    if (isMulti) {
      const nextArr = sortArr.slice()
      nextArr[0] = next
      onSortChange(nextArr)
    } else {
      onSortChange(next)
    }
  }

  const setPrimaryReverse = (next: boolean) => {
    if (isMulti) {
      const nextArr = reverseArr.slice()
      nextArr[0] = next
      onReverseChange(nextArr)
    } else {
      onReverseChange(next)
    }
  }

  const setSecondary = (idx: number, next: string) => {
    const nextArr = sortArr.slice()
    nextArr[idx] = next
    onSortChange(nextArr)
  }

  const setSecondaryReverse = (idx: number, next: boolean) => {
    const nextArr = reverseArr.slice()
    nextArr[idx] = next
    onReverseChange(nextArr)
  }

  const addSecondary = () => {
    const defaultSort = secondaryOptions[0]?.data ?? 'alphabetical'
    const nextSort = [...sortArr, String(defaultSort)]
    const nextReverse = [...reverseArr, false]
    onSortChange(nextSort)
    onReverseChange(nextReverse)
  }

  const removeSecondary = (idx: number) => {
    const nextSort = sortArr.filter((_, i) => i !== idx)
    const nextReverse = reverseArr.filter((_, i) => i !== idx)
    if (nextSort.length <= 1) {
      onSortChange(nextSort[0] ?? 'alphabetical')
      onReverseChange(nextReverse[0] ?? false)
    } else {
      onSortChange(nextSort)
      onReverseChange(nextReverse)
    }
  }

  /* When the user has 2+ sort keys, the chain shows a one-time description
     above explaining that earlier rows dominate (mirrors the smart-shelf
     composite picker's "combine modes" Field-with-description treatment).
     Single-key shelves skip the description to avoid noise. */
  return (
    <>
      {isMulti && (
        <Field
          label={t('sort_chain_label')}
          description={t('sort_chain_desc')}
          bottomSeparator="none"
        />
      )}
      <Field
        label={isMulti ? `${label} (1)` : label}
        childrenLayout="inline"
        childrenContainerWidth="min"
        inlineWrap="keep-inline"
        bottomSeparator={isMulti ? 'none' : bottomSeparator}
      >
        <Focusable style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Focusable style={{ minWidth: 200 }}>
            <Dropdown rgOptions={options} selectedOption={primary} onChange={(opt: unknown) => setPrimary(String(optionData(opt) ?? ''))} focusable />
          </Focusable>
          <SortDirectionButton sort={primary} reverse={primaryReverse} onChange={setPrimaryReverse} />
        </Focusable>
      </Field>
      {isMulti && sortArr.slice(1).map((key, i) => {
        const idx = i + 1
        return (
          <Field
            key={idx}
            label={`${label} (${idx + 1})`}
            childrenLayout="inline"
            childrenContainerWidth="min"
            inlineWrap="keep-inline"
            bottomSeparator={idx === sortArr.length - 1 ? bottomSeparator : 'none'}
          >
            <Focusable style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Focusable style={{ minWidth: 200 }}>
                <Dropdown rgOptions={secondaryOptions} selectedOption={key} onChange={(opt: unknown) => setSecondary(idx, String(optionData(opt) ?? ''))} focusable />
              </Focusable>
              <SortDirectionButton sort={key} reverse={reverseArr[idx] ?? false} onChange={(next: boolean) => setSecondaryReverse(idx, next)} />
              <DialogButton
                onClick={() => removeSecondary(idx)}
                onOKButton={() => removeSecondary(idx)}
                onOKActionDescription={t('sort_remove_key')}
                style={{ minWidth: 40, width: 40, padding: 8 }}
              >×</DialogButton>
            </Focusable>
          </Field>
        )
      })}
      {canAddSecondary && (
        <DialogButton
          onClick={addSecondary}
          onOKButton={addSecondary}
          onOKActionDescription={t('sort_add_secondary')}
          style={{ width: '100%', marginTop: 4, marginBottom: 8 }}
        >+ {t('sort_add_secondary')}</DialogButton>
      )}
    </>
  )
}
