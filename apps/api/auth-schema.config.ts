/**
 * Config utilisée UNIQUEMENT par le CLI better-auth pour générer le schéma SQL
 * (`npx @better-auth/cli generate`). Reproduit les options de src/auth/auth.ts sans binding D1 réel.
 */
import { betterAuth } from 'better-auth';

export const auth = betterAuth({
  database: { dialect: undefined as never, type: 'sqlite' },
  emailAndPassword: { enabled: true, requireEmailVerification: false },
});
