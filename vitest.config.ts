import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 90000, // Increased for full builds
    hookTimeout: 60000,
    fileParallelism: true,
    include: ['src/tests/**/*.test.{ts,js}'],
  },
});
