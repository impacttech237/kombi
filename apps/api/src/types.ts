/** Bindings Cloudflare injectés dans le Worker (voir wrangler.toml). */
export interface Bindings {
  DB: D1Database;
  DOCS: R2Bucket;
}

/** Variables de contexte posées par les middlewares. */
export interface Variables {
  utilisateurId: string;
  entrepriseId: string;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
