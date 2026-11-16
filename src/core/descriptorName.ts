export function descriptorName(
  t: (key: string) => string,
  d: { id?: string; displayName?: string; label?: string } | null | undefined,
): string {
  const id = String(d?.id ?? "");
  const key = `integration_${id}`;
  const translated = t(key);
  if (translated && translated !== key) return translated;
  return d?.displayName || (d as any)?.label || id;
}
