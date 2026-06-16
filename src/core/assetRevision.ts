// Monotonic revision counter folded into every asset cache key. Bumping it
// makes every URL list re-derive with a fresh `?c=…` query, which is how
// `/customimages/*` swaps to the new bitmap when the user replaces the art
// off-screen (Steam writes the file in place; the URL doesn't change, so
// without a buster the browser keeps serving the cached pixels).
//
// The HomeInject route-change listener bumps this when the user returns to
// home from a detail page; that single edge covers the common
// "edit art → press B → expect to see new art" flow without forcing a
// network round-trip.

let revision = 0;

export function getAssetRevision(): string {
  return String(revision);
}

export function bumpAssetRevision(): void {
  revision++;
}
