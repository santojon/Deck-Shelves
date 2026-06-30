export function textFromDeckyChange(value: unknown): string {
  if (typeof value === 'string') return value
  const maybe = (value as any)?.target?.value ?? (value as any)?.currentTarget?.value ?? (value as any)?.value ?? value
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

export function pickerPath(result: unknown): string {
  if (typeof result === 'string') return result
  if (Array.isArray(result)) return pickerPath(result[0])
  const maybe = result as any
  return String(maybe?.realpath ?? maybe?.path ?? maybe?.strPath ?? maybe?.filepath ?? maybe?.file_path ?? maybe?.selectedPath ?? '')
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
