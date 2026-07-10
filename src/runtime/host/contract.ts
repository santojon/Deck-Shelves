/* HostApi contract — a thin re-export of the shared `@deck-shelves/host` package
   (the single source of truth both host adapters and the bundle build against),
   so the rest of the codebase keeps importing from `./contract` and the Decky /
   standalone adapters + `index.tsx` all get `HostApi`, `HOST_API_VERSION`, etc.
   here. Resolved to the package source via the vite alias + tsconfig `paths`. */
export * from "@deck-shelves/host";
