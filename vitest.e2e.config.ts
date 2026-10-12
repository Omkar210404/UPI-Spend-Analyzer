import { defineConfig } from 'vitest/config';

// The privacy test drives a real browser against the production build.
// Run `npm run build` first.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
