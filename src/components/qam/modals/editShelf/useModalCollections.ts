import { useEffect, useState } from 'react'
import { usePlatform } from '../../../../runtime/platformContext'
import type { PlatformCollection } from '../../../../runtime/platform'

// Steam's collectionStore can take a few seconds to fill after boot, so poll briefly while open.
export function useModalCollections(initial: ReadonlyArray<PlatformCollection>): ReadonlyArray<PlatformCollection> {
  const [modalCollections, setModalCollections] = useState<ReadonlyArray<PlatformCollection>>(initial)
  const modalPlatform = usePlatform()
  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      modalPlatform.listCollections().then((next) => {
        if (cancelled) return
        setModalCollections((current) => {
          const a = JSON.stringify(current.map((c) => ({ id: c.id, name: c.name, isDynamic: c.isDynamic })))
          const b = JSON.stringify(next.map((c) => ({ id: c.id, name: c.name, isDynamic: c.isDynamic })))
          return a === b ? current : next
        })
      }).catch(() => {})
    }
    refresh()
    const t1 = window.setTimeout(refresh, 500)
    const t2 = window.setTimeout(refresh, 2000)
    const interval = window.setInterval(refresh, 10000)
    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.clearInterval(interval)
    }
  }, [modalPlatform])
  return modalCollections.length > 0 ? modalCollections : initial
}
