/** Bindings Cloudflare injectés dans le Worker (voir wrangler.toml). */
export interface Bindings {
  DB: D1Database;
  DOCS: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
}

/** Variables de contexte posées par les middlewares. */
export interface Variables {
  utilisateurId: string;
  entrepriseId: string;
  role: import('@kombi/shared').RoleMembre;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
