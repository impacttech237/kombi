import { applyD1Migrations, env } from 'cloudflare:test';

// Applique les migrations D1 avant chaque fichier de test.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
