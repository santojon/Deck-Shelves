// Prewarmed at boot; callers fall back to ~/Downloads until the backend answers.

import { call } from "../shims/host-api";

let cachedDownloadsDir: string | null = null;
let cachedPicturesDir: string | null = null;

export async function prewarmUserPaths(): Promise<void> {
  if (!cachedDownloadsDir) {
    try {
      const dir = await call<[], string>("get_user_desktop");
      if (typeof dir === "string" && dir) cachedDownloadsDir = dir;
    } catch {
      // Backend not ready yet.
    }
  }
  if (!cachedPicturesDir) {
    try {
      const dir = await call<[], string>("get_user_pictures");
      if (typeof dir === "string" && dir) cachedPicturesDir = dir;
    } catch {
      // Backend not ready yet.
    }
  }
}

export function getUserDownloadsDir(): string {
  return cachedDownloadsDir ?? "~/Downloads";
}

export function getUserPicturesDir(): string {
  return cachedPicturesDir ?? "~/Pictures";
}

export function joinDownloads(filename: string): string {
  const base = getUserDownloadsDir();
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base.endsWith(sep) ? `${base}${filename}` : `${base}${sep}${filename}`;
}
