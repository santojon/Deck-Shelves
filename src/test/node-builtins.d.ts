/* The browser tsconfig has no @types/node; these cover the few builtins the test scripts call. */
declare module "node:child_process" {
  export function execFileSync(file: string, args: string[], options: { encoding: string }): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string): string;
}
declare module "node:path" {
  export function dirname(p: string): string;
  export function join(...parts: string[]): string;
}
