/**
 * Authentification — better-auth sur D1 (via Kysely). Email + mot de passe.
 * Instancié par requête avec le binding D1 du Worker.
 *
 * Le schéma des tables better-auth est généré par le CLI (`pnpm auth:generate`) →
 * migration 0003_auth.sql. Ne pas éditer ce schéma à la main.
 */

import { betterAuth } from 'better-auth';
import { D1Dialect } from 'kysely-d1';
import { origenesConfiance } from '../lib/origins.js';

export interface AuthEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  /** Origines front autorisées (CSV). Ex. dev: http://localhost:5173 ; prod: domaine Pages. */
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
}

export function creerAuth(db: D1Database, env: AuthEnv) {
  const trusted = origenesConfiance(env);
  return betterAuth({
    database: { dialect: new D1Dialect({ database: db }), type: 'sqlite' },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: trusted,
    emailAndPassword: {
      enabled: true,
      // MVP : pas de vérification email obligatoire (ajoutée plus tard avec l'envoi WhatsApp/email)
      requireEmailVerification: false,
    },
    // Un compte utilisateur ; le rattachement aux entreprises est géré par membre_entreprise.
    session: {
      // Audit scalabilité 2026-09-04 : sans ça, CHAQUE requête authentifiée (authentifier(),
      // middleware/auth.ts) appelle auth.api.getSession() → une lecture D1 de la table `session`,
      // sans aucun cache — alors que D1 est la SEULE base non shardée (control-plane), donc le
      // seul vrai goulot d'étranglement à forte concurrence (contrairement au DO par entreprise,
      // déjà parallèle par nature). Le cookie cache signé de better-auth évite cette lecture D1
      // tant qu'il n'a pas expiré : la session se valide depuis un cookie signé, pas la base.
      // maxAge court (comme le cache de rôle 30s, tenant.ts) pour garder une fenêtre de
      // révocation resserrée — un compte désactivé reste actif au plus ce délai après coup.
      cookieCache: { enabled: true, maxAge: 60 },
    },
  });
}

export type Auth = ReturnType<typeof creerAuth>;
