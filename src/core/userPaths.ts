// Backend-resolved user paths. Backend (`main.py`) already exposes
// `get_user_desktop` which uses `os.path.expanduser("~")` and picks
// `~/Desktop` → `~/Downloads` → `~` based on what exists — portable across
// any Linux distro (Bazzite, ChimeraOS, Nobara) and across Decky runtimes
// regardless of the user account name. The frontend used to hard-code
// `/home/deck/Downloads`, which breaks on every system where the user
// isn't literally `deck`.
//
// The pre-warm is fired once at plugin boot so the cached value is ready
// by the time the user clicks Import / Export. Until the first response
// lands, callers fall back to `~/Downloads` (which the backend's
// `_normalize_path` expands via `os.path.expanduser`).

import { call } from "../shims/decky-api";

let cachedDownloadsDir: string | null = null;

export async function prewarmUserPaths(): Promise<void> {
  if (cachedDownloadsDir) return;
  try {
    const dir = await call<[], string>("get_user_desktop");
    if (typeof dir === "string" && dir) cachedDownloadsDir = dir;
  } catch {
    // Backend not ready yet — keep falling back to ~/Downloads.
  }
}

export function getUserDownloadsDir(): string {
  return cachedDownloadsDir ?? "~/Downloads";
}

export function joinDownloads(filename: string): string {
  const base = getUserDownloadsDir();
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base.endsWith(sep) ? `${base}${filename}` : `${base}${sep}${filename}`;
}
