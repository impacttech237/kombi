import type { D1Migration } from '@cloudflare/vitest-pool-workers/config';
import type { EntrepriseDO } from '../src/do/entreprise-do.js';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    ENTREPRISE: DurableObjectNamespace<EntrepriseDO>;
    DOCS: R2Bucket;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
    TEST_MIGRATIONS: D1Migration[];
  }
}
