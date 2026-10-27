import { useEffect, useState } from 'react'
import { readJsonFile } from '../../../settingsStore'
import { readImportFile, type ImportRead, type ImportScope } from '../../../features/settings/importFile'

// The file an import would read, checked whenever the path changes (null while checking).
export function useImportRead(path: string, scope: ImportScope): ImportRead | null {
  const [read, setRead] = useState<ImportRead | null>(null)
  useEffect(() => {
    let alive = true
    setRead(null)
    void readImportFile(path, scope, readJsonFile).then((r) => { if (alive) setRead(r) }).catch(() => { if (alive) setRead({ kind: 'not_found' }) })
    return () => { alive = false }
  }, [path, scope])
  return read
}

const STATUS_KEY: Record<ImportRead['kind'], string> = {
  ok: 'import_status_found',
  not_found: 'import_status_not_found',
  invalid: 'import_status_invalid',
  empty: 'import_status_empty',
}

// The full path and whether it can be imported, shown before the user confirms.
export function ImportFileStatus({ path, read, t }: { path: string; read: ImportRead | null; t: (key: string) => string }) {
  const ok = read?.kind === 'ok'
  const mark = read ? (ok ? '✓' : '✗') : '…'
  return (
    <div style={{ fontSize: 12, lineHeight: 1.4, wordBreak: 'break-all' }}>
      <div style={{ opacity: 0.75 }}>{path}</div>
      <div style={{ color: read && !ok ? 'var(--ds-danger, #f87171)' : 'var(--ds-text-dim, rgba(255,255,255,0.75))' }}>
        {mark} {read ? t(STATUS_KEY[read.kind]) : t('loading')}
      </div>
    </div>
  )
}
