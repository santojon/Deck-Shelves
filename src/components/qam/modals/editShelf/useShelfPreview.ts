import { useMemo, type Dispatch, type SetStateAction } from 'react'
import type { PlatformApi } from '../../../../runtime/platform'
import type { EditableShelfState } from './types'
import { buildPrimarySource as buildPrimarySourceShared, assembleFinalSource } from './saveHelpers'
import { usePreviewResolution } from './usePreviewResolution'

export function useShelfPreview({ state, setState, isManualSort, previewShelfId, hiddenPickerOpen, previewRefreshNonce, platform }: {
  state: EditableShelfState
  setState: Dispatch<SetStateAction<EditableShelfState>>
  isManualSort: boolean
  previewShelfId: string
  hiddenPickerOpen: boolean
  previewRefreshNonce: number
  platform: PlatformApi
}) {
  // Synthetic cards ride in the manual order as negative ids: -(index + 1).
  const SYNTH_SENTINEL = (i: number) => -(i + 1)
  const synthIndexOfSentinel = (id: number) => (id < 0 ? -id - 1 : -1)

  const previewSource = useMemo(() => {
    const childFilter = state.childFilterGroup.items.length > 0 ? state.childFilterGroup : undefined
    const primary = buildPrimarySourceShared({ state, childFilter })
    return assembleFinalSource(primary, state)
  }, [state.sourceType, state.collectionId, state.tab, state.externalSourceId, state.filterGroup, state.filter.sort, state.filter.sortReverse, state.manualBaseSort, state.childFilterGroup, state.postFilterGroup, state.excludeOwned, state.excludeOwnedNonSteam, state.hideOwnedNonSteamCloud, state.compositeCombine, state.additionalSources, state.builtinSourceId, state.smartMode, state.primaryOrder])

  const { previewCount, resolvedIds, resolvedMeta, missingData } = usePreviewResolution({
    state, previewSource, previewShelfId, hiddenPickerOpen, previewRefreshNonce, platform,
  })

  const effectiveManualOrder = useMemo(() => {
    if (!isManualSort) return resolvedIds
    const idSet = new Set(resolvedIds)
    // Menu-added entries go last so they stay visible; hidden cards stay in the preview, marked.
    const gameOrder: number[] = []
    const appendTail: number[] = []
    const seen = new Set<number>()
    for (const id of state.manualOrder) {
      if (id < 0) continue
      if (seen.has(id)) continue
      seen.add(id)
      if (idSet.has(id)) gameOrder.push(id)
      else appendTail.push(id)
    }
    for (const id of resolvedIds) if (!seen.has(id)) gameOrder.push(id)
    gameOrder.push(...appendTail)
    if (!state.syntheticCards.length) return gameOrder
    const synthEntries = state.syntheticCards
      .map((c, i) => ({ pos: Math.max(0, Number(c.position) || 0), sentinel: SYNTH_SENTINEL(i) }))
      .sort((a, b) => a.pos - b.pos)
    const out = gameOrder.slice()
    for (const { pos, sentinel } of synthEntries) {
      out.splice(Math.min(pos, out.length), 0, sentinel)
    }
    return out
  }, [isManualSort, resolvedIds, state.manualOrder, state.syntheticCards])

  const reorderManual = (nextOrder: number[]) => setState((prev) => {
    // Only game appids go in manualOrder; synthetic slots live on syntheticCards[].position.
    const nextManualOrder: number[] = []
    const nextSynth = prev.syntheticCards.slice()
    for (let i = 0; i < nextOrder.length; i++) {
      const id = nextOrder[i]
      if (id >= 0) { nextManualOrder.push(id); continue }
      const synthIdx = synthIndexOfSentinel(id)
      if (synthIdx >= 0 && synthIdx < nextSynth.length) {
        nextSynth[synthIdx] = { ...nextSynth[synthIdx], position: i }
      }
    }
    return { ...prev, manualOrder: nextManualOrder, syntheticCards: nextSynth }
  })
  return { previewSource, previewCount, resolvedIds, resolvedMeta, missingData, effectiveManualOrder, reorderManual, SYNTH_SENTINEL }
}
