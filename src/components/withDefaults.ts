// Like destructuring defaults: only an undefined prop takes its default.
export function withDefaults<P extends object, D extends Partial<P>>(props: P, defaults: D): P & Required<Pick<P, keyof D & keyof P>> {
  const out: any = { ...props };
  for (const key of Object.keys(defaults)) {
    if (out[key] === undefined) out[key] = (defaults as any)[key];
  }
  return out;
}
