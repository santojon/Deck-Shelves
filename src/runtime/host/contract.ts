/* HostApi contract — sourced from the shared `@deck-shelves/host` package (the
   single source of truth both host adapters and the bundle build against).

   Kept as a thin re-export so the rest of the codebase keeps importing from
   `./contract`; the Decky adapter (`decky.ts`), the standalone adapter
   (`standalone.ts`), and `index.tsx` all get `HostApi`, `HOST_API_VERSION`,
   etc. from here. Resolved to the package's source (`host/src/contract`) via
   the vite alias + tsconfig `paths` so no build of the package is required. */
export * from "@deck-shelves/host";
