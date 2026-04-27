import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// @decky/api's published index does `import _manifest from '@decky/manifest'`,
// which is normally injected by Decky's build pipeline at compile time. In a
// raw Node/Vitest run that virtual package is missing and any test that
// transitively touches @decky/api fails to load. Aliasing both packages to
// no-op stubs lets the test suite import the codebase without pulling in
// runtime-only Decky machinery.
export default defineConfig({
  define: {
    __DEV__: JSON.stringify(true),
  },
  resolve: {
    alias: {
      '@decky/manifest': fileURLToPath(new URL('./src/test/stubs/decky-manifest.ts', import.meta.url)),
      '@decky/api': fileURLToPath(new URL('./src/test/stubs/decky-api.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
})
