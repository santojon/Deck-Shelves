import { defineConfig } from 'vitest/config'

export default defineConfig({
  define: {
    __DEV__: JSON.stringify(true),
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
})
