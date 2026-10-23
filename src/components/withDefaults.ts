/* Destructuring defaults for a large prop bag, applied in one place: only a
   prop that is `undefined` takes its default (exactly like `= value` in a
   destructuring pattern), without a decision point per parameter. */
export function withDefaults<P extends object, D extends Partial<P>>(props: P, defaults: D): P & Required<Pick<P, keyof D & keyof P>> {
  const out: any = { ...props };
  for (const key of Object.keys(defaults)) {
    if (out[key] === undefined) out[key] = (defaults as any)[key];
  }
  return out;
}
