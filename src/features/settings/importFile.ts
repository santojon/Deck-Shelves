import { unwrapPayload } from "./settingsCategories";

export type ImportScope = "all" | "shelves" | "smart";

// The files the export writes, full backup first: any of them can feed a narrower import.
export const KNOWN_EXPORT_FILES = ["deck-shelves.json", "deck-shelves-shelves.json", "deck-shelves-smart-shelves.json"] as const;

export type ImportRead =
  | { kind: "ok"; payload: Record<string, unknown> }
  | { kind: "not_found" }
  | { kind: "invalid" }
  | { kind: "empty" };

type ReadFile = (path: string) => Promise<string | null>;

const nonEmptyList = (v: unknown) => Array.isArray(v) && v.length > 0;

// Whether a payload holds anything the import of this scope would take.
export function hasDataForScope(payload: Record<string, unknown>, scope: ImportScope): boolean {
  if (scope === "shelves") return nonEmptyList(payload.shelves);
  if (scope === "smart") return nonEmptyList(payload.smartShelves);
  return Object.keys(payload).length > 0;
}

export async function readImportFile(path: string, scope: ImportScope, read: ReadFile): Promise<ImportRead> {
  const raw = await read(path);
  if (!raw) return { kind: "not_found" };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { kind: "invalid" }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { kind: "invalid" };
  const payload = unwrapPayload(parsed);
  return hasDataForScope(payload, scope) ? { kind: "ok", payload } : { kind: "empty" };
}

function splitAt(path: string): { dir: string; base: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", base: path } : { dir: path.slice(0, i), base: path.slice(i + 1) };
}

/* The requested file is missing: another export file in the same folder that holds
   what this scope imports (a full backup also holds the shelves), or null. */
export async function findAlternativeImport(path: string, scope: ImportScope, read: ReadFile): Promise<string | null> {
  const { dir, base } = splitAt(path);
  for (const name of KNOWN_EXPORT_FILES) {
    if (name === base) continue;
    const candidate = dir ? `${dir}/${name}` : name;
    if ((await readImportFile(candidate, scope, read)).kind === "ok") return candidate;
  }
  return null;
}
