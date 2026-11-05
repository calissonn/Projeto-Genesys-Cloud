import path from 'node:path';
import type { NextConfig } from 'next';

// Usa o mesmo .env da raiz do projeto (ACC_TOKEN, ACC_PORT…).
try {
  process.loadEnvFile(path.resolve(process.cwd(), '../../.env'));
} catch {
  /* sem .env: usa variáveis do ambiente */
}

const config: NextConfig = {
  transpilePackages: ['@acc/shared'],
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: path.resolve(process.cwd(), '../..') },
};
export default config;
