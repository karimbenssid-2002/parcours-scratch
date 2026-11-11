import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { 'server-only': fileURLToPath(new URL('./tests/helpers/empty.ts', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Premier test de chaque fichier : démarrage de PGlite (PostgreSQL en WebAssembly), lent quand tous les fichiers démarrent ensemble.
    testTimeout: 30_000,
    env: {
      AUTOGRADE_ENABLED: '1', // la correction est active dans les tests ; enabled.test.ts la retire pour vérifier le cas contraire
      AUTH_SECRET: 'test-admin-secret-0123456789abcdef0123',
      STUDENT_AUTH_SECRET: 'test-student-secret-0123456789abcdef01',
    },
  },
})
