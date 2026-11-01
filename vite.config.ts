import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          flow: ['@xyflow/react'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
