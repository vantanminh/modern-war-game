import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
