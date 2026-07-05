// Decky's onChange hands back a raw string, an event, or a `{ value }` object
// depending on the field. Pick the first defined candidate across those shapes.
function pickChangeValue(v: any): unknown {
  return v?.target?.value ?? v?.currentTarget?.value ?? v?.value ?? v
}

export function textFromDeckyChange(value: unknown): string {
  if (typeof value === 'string') return value
  const maybe = pickChangeValue(value)
  return typeof maybe === 'string' ? maybe : ''
}

export function filenameWithJson(name: string): string {
  const base = name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '').replace(/-+/g, '-') || 'deck-shelves'
  return base.toLowerCase().endsWith('.json') ? base : `${base}.json`
}

// Split a full path into its folder + filename so import modals can show just
// the filename (matching the export modals) instead of the whole path.
export function splitPath(p: string): { dir: string; base: string } {
  const norm = String(p ?? '').replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx >= 0 ? { dir: p.slice(0, idx), base: p.slice(idx + 1) } : { dir: '', base: p }
}

export function joinPath(dir: string, base: string): string {
  if (!dir) return base
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return dir.endsWith(sep) ? `${dir}${base}` : `${dir}${sep}${base}`
}

// The picker result shape varies across Steam/Decky builds — take the first
// defined path-ish field, matching the previous `?? ` fallback order.
const PICKER_PATH_KEYS = ['realpath', 'path', 'strPath', 'filepath', 'file_path', 'selectedPath']

function firstPathField(o: any): string {
  for (const k of PICKER_PATH_KEYS) {
    const v = o?.[k]
    if (v !== undefined && v !== null) return String(v)
  }
  return ''
}

export function pickerPath(result: unknown): string {
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return pickerPath(result[0])
  return firstPathField(result)
}

export async function tryPickerCalls(calls: Array<() => Promise<unknown>>): Promise<string> {
  for (const fn of calls) {
    try {
      const value = pickerPath(await fn())
      if (value) return value
    } catch {}
  }
  return ''
}
