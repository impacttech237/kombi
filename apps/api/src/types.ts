import type { EntrepriseDO } from './do/entreprise-do.js';

/** Bindings Cloudflare injectés dans le Worker (voir wrangler.toml). */
export interface Bindings {
  DB: D1Database; // control plane : identité, registre entreprises, auth
  ENTREPRISE: DurableObjectNamespace<EntrepriseDO>; // 1 base par entreprise (D13)
  DOCS: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
}

/** Stub du Durable Object d'une entreprise (sa base SQLite dédiée). */
export function stubEntreprise(env: Bindings, entrepriseId: string) {
  return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(entrepriseId));
}

/** Variables de contexte posées par les middlewares. */
export interface Variables {
  utilisateurId: string;
  entrepriseId: string;
  role: import('@kombi/shared').RoleMembre;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
