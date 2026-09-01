import { createMiddleware } from 'hono/factory';
import type { CodeModule } from '@kombi/shared';
import { stubEntreprise, type AppEnv } from '../types.js';

/**
 * Feature-gating : refuse l'accès si le module n'est pas actif pour l'entreprise.
 * L'état des modules vit dans la base dédiée de l'entreprise (DO). À placer après `tenant`.
 */
export function requireModule(code: CodeModule) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const entrepriseId = c.get('entrepriseId');
    const actif = await stubEntreprise(c.env, entrepriseId).moduleActif(code);
    if (!actif) {
      return c.json({ erreur: `Module « ${code} » non activé pour cette entreprise` }, 403);
    }
    await next();
  });
}
