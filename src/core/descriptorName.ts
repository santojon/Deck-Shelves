/* Localized display name for a registered descriptor (shelf source, import
   type, …). Prefers the `integration_<id>` i18n key — the same one the
   Integrations panel resolves — so pickers stay in sync with that list instead
   of the raw English `displayName`. Falls back to the descriptor's own name
   when no translation exists (e.g. third-party plugins with their own label). */
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
