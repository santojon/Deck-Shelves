import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// The `@host/*` specifiers resolve (via the plugin build alias) to the runtime
// shims, which read Steam/loader globals that exist only inside the live
// renderer. In a raw Node/Vitest run those globals are missing, so alias the
// `@host/*` specifiers to no-op stubs — the suite can import the codebase
// without the renderer runtime.
export default defineConfig({
  define: {
    __DEV__: JSON.stringify(true),
  },
  resolve: {
    alias: {
      '@host/manifest': fileURLToPath(new URL('./src/test/stubs/host-manifest.ts', import.meta.url)),
      '@host/api': fileURLToPath(new URL('./src/test/stubs/host-api.ts', import.meta.url)),
      '@host/ui': fileURLToPath(new URL('./src/test/stubs/host-ui.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
})
