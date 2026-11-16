import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// The @host/* shims read globals that only exist in the live renderer, so tests alias them to stubs.
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
