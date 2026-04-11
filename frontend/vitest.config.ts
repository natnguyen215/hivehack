import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Component tests need jsdom: `npm i -D jsdom` then set environment: 'jsdom'
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
