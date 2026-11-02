// Copia as migrações SQL para a pasta de build.
import { cpSync } from 'node:fs';
cpSync('src/db/migrations', 'dist/src/db/migrations', { recursive: true });
