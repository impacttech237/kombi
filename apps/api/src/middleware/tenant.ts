import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

/**
 * Isolation multi-entreprises (cahier des charges / doc archi §5) :
 * vérifie que l'utilisateur authentifié est bien membre de l'entreprise ciblée
 * (header `x-entreprise-id`), et pose entrepriseId dans le contexte.
 * TOUTE requête D1 métier doit ensuite filtrer sur `entreprise_id = ?`.
 *
 * NB : l'auth (better-auth) posera `utilisateurId` en amont ; ici on suppose ce middleware
 * exécuté après. À durcir avec des tests d'isolation (entreprise A ne lit jamais B).
 */
export const tenant = createMiddleware<AppEnv>(async (c, next) => {
  const utilisateurId = c.get('utilisateurId');
  const entrepriseId = c.req.header('x-entreprise-id');

  if (!utilisateurId) return c.json({ erreur: 'Non authentifié' }, 401);
  if (!entrepriseId) return c.json({ erreur: 'Entreprise non spécifiée' }, 400);

  const membre = await c.env.DB.prepare(
    'SELECT 1 FROM membre_entreprise WHERE utilisateur_id = ? AND entreprise_id = ? LIMIT 1',
  )
    .bind(utilisateurId, entrepriseId)
    .first();

  if (!membre) return c.json({ erreur: "Accès refusé à cette entreprise" }, 403);

  c.set('entrepriseId', entrepriseId);
  await next();
});
