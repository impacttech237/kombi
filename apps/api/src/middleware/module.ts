import { createMiddleware } from 'hono/factory';
import type { CodeModule } from '@kombi/shared';
import type { AppEnv } from '../types.js';

/**
 * Feature-gating : refuse l'accès à une route si le module n'est pas actif pour l'entreprise.
 * À placer après le middleware `tenant` (qui pose entrepriseId).
 * Ex. : facturation.use('*', requireModule('facturation'))
 */
export function requireModule(code: CodeModule) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const entrepriseId = c.get('entrepriseId');
    const row = await c.env.DB.prepare(
      'SELECT actif FROM module_entreprise WHERE entreprise_id = ? AND code_module = ?',
    )
      .bind(entrepriseId, code)
      .first<{ actif: number }>();

    if (!row || row.actif !== 1) {
      return c.json({ erreur: `Module « ${code} » non activé pour cette entreprise` }, 403);
    }
    await next();
  });
}
