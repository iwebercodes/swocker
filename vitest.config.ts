import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    watch: false,
    testTimeout: 120000, // 2 minutes for Docker operations
    hookTimeout: 60000, // 1 minute for setup/teardown
    isolate: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Run tests sequentially to avoid Docker conflicts
      },
    },
    globalSetup: './tests/setup.ts', // Pull required Docker images before tests run
  },
});
