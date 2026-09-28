/* `@types/node` isn't a project dependency (browser-targeted tsconfig) —
   these ambient declarations cover only the handful of Node builtins a few
   test-only scripts call directly (spawning Python for cross-language
   checks), rather than adding a new dependency for the full Node types. */
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
