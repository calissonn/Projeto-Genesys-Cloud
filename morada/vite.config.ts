import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  css: { postcss: { plugins: [] } },
  test: { environment: 'node' },
} as any);
