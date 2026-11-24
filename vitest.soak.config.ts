import { defineConfig } from 'vitest/config'

// Long-running test against the real mock server; run with `npm run test:soak`.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['soak/**/*.soak.test.ts'],
    testTimeout: 150_000,
    hookTimeout: 20_000,
  },
})
