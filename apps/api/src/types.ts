import type { EntrepriseDO } from './do/entreprise-do.js';

/** Bindings Cloudflare injectés dans le Worker (voir wrangler.toml). */
export interface Bindings {
  DB: D1Database; // control plane : identité, registre entreprises, auth
  ENTREPRISE: DurableObjectNamespace<EntrepriseDO>; // 1 base par entreprise (D13)
  DOCS: R2Bucket;
  ASSETS: Fetcher; // sert la PWA (front) depuis le même Worker (même origine)
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
}

/** Stub du Durable Object d'une entreprise (sa base SQLite dédiée). */
export function stubEntreprise(env: Bindings, entrepriseId: string) {
  return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(entrepriseId));
}

/**
 * Régime fiscal courant (D1, source de vérité) — jamais mis en cache côté DO pour rester à jour
 * si l'entreprise bascule IGS↔Réel. La TVA est interdite au régime IGS (CGI Art. 142).
 */
export async function regimeFiscalDe(env: Bindings, entrepriseId: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT regime_fiscal FROM entreprise WHERE id = ?')
    .bind(entrepriseId).first<{ regime_fiscal: string }>();
  return row?.regime_fiscal ?? null;
}

export interface FeaturesPlan {
  maxUtilisateurs: number | null;
  quotaFacturesMois: number | null;
  modules: string[];
  rapprochement?: boolean;
  recurrent?: boolean;
  multiBoutiques?: boolean;
}

export interface Abonnement {
  planCode: string; statut: string; essaiFin: string | null; features: FeaturesPlan;
}

/** Abonnement courant (control plane D1) — voir docs/Spécifications_technique.md §7. */
export async function abonnementDe(env: Bindings, entrepriseId: string): Promise<Abonnement | null> {
  const row = await env.DB.prepare(
    `SELECT a.plan_code, a.statut, a.essai_fin, p.features_json
       FROM abonnement a JOIN plan p ON p.code = a.plan_code
      WHERE a.entreprise_id = ?`,
  ).bind(entrepriseId).first<{ plan_code: string; statut: string; essai_fin: string | null; features_json: string }>();
  if (!row) return null;
  return {
    planCode: row.plan_code, statut: row.statut, essaiFin: row.essai_fin,
    features: JSON.parse(row.features_json) as FeaturesPlan,
  };
}

/** Variables de contexte posées par les middlewares. */
export interface Variables {
  utilisateurId: string;
  entrepriseId: string;
  role: import('@kombi/shared').RoleMembre;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };
