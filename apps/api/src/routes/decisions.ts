import { Hono } from 'hono';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';
import { avecCacheTTL } from '../lib/cache-isolate.js';

export const decisions = new Hono<AppEnv>();

/**
 * « À décider » — synthèse quotidienne des 3 problèmes les plus importants (impact financier),
 * chacun avec cause, urgence et action suggérée. Recalcul coûteux (agrège plusieurs signaux) ;
 * une fraîcheur de quelques minutes suffit pour une synthèse « du jour » (voir cockpit, même
 * mécanisme de cache isolate).
 */
decisions.get('/', requirePermission('decision:read'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const problemes = await avecCacheTTL(`decisions:${entrepriseId}`, 300_000, () =>
    stubEntreprise(c.env, entrepriseId).problemesPrioritaires(),
  );
  return c.json({ problemes });
});
