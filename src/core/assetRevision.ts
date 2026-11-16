// Busts cached `/customimages/*` URLs: Steam rewrites the file in place, so the URL never changes.

let revision = 0;

export function getAssetRevision(): string {
  return String(revision);
}

export function bumpAssetRevision(): void {
  revision++;
}
