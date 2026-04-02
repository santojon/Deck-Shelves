import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __DEV__: JSON.stringify(true),
  },
  test: {
    environment: 'node',
    include: ['src/test/**/*.test.ts'],
  },
})
