/* HostApi contract — a thin re-export of the shared `@deck-shelves/host` package
   (single source of truth both host adapters and the bundle build against). The
   codebase keeps importing from `./contract`; the per-host adapters (`decky.ts`,
   `shelveshub.ts`) + `resolveHost` all get `HostApi`, `HOST_API_VERSION`, etc.
   here. Resolved to the package source via the vite alias + tsconfig `paths`. */
export * from "@deck-shelves/host";
