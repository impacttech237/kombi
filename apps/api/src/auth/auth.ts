/**
 * Authentification — better-auth sur D1 (via Kysely). Email + mot de passe.
 * Instancié par requête avec le binding D1 du Worker.
 *
 * Le schéma des tables better-auth est généré par le CLI (`pnpm auth:generate`) →
 * migration 0003_auth.sql. Ne pas éditer ce schéma à la main.
 */

import { betterAuth } from 'better-auth';
import { D1Dialect } from 'kysely-d1';

export interface AuthEnv {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
}

export function creerAuth(db: D1Database, env: AuthEnv) {
  return betterAuth({
    database: { dialect: new D1Dialect({ database: db }), type: 'sqlite' },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      // MVP : pas de vérification email obligatoire (ajoutée plus tard avec l'envoi WhatsApp/email)
      requireEmailVerification: false,
    },
    // Un compte utilisateur ; le rattachement aux entreprises est géré par membre_entreprise.
  });
}

export type Auth = ReturnType<typeof creerAuth>;
