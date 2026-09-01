import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    DOCS: R2Bucket;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
