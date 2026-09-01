import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

// Tests d'intégration exécutés DANS workerd, avec une vraie D1 (miniflare) migrée.
export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              BETTER_AUTH_SECRET: 'test-secret-kombi-0123456789abcdef',
              BETTER_AUTH_URL: 'http://localhost',
            },
          },
        },
      },
    },
  };
});
