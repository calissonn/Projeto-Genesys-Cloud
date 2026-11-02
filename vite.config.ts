import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Modo protótipo (padrão): `npm run dev` — dados simulados, sem backend.
 * Modo backend: `npm run dev:backend` — usa .env.backend (VITE_DATA_SOURCE=backend) e encaminha /api
 * ao servidor local. DEV_USER simula o usuário que o proxy de SSO informaria em produção
 * (o backend precisa estar com AUTH_MODE=dev).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.BACKEND_URL ?? 'http://localhost:8080';
  const headers: Record<string, string> = env.DEV_USER ? { 'x-dev-user': env.DEV_USER } : {};
  const proxy = { '/api': { target: backend, changeOrigin: false, headers } };
  return {
    plugins: [react()],
    server: { host: true, port: 5173, proxy },
    preview: { proxy },
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
  };
});
