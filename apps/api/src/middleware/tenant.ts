import { createMiddleware } from 'hono/factory';
import { avecCacheTTL } from '../lib/cache-isolate.js';
import type { AppEnv } from '../types.js';

/** Clé de cache du rôle d'un utilisateur dans une entreprise — exportée pour invalidation ciblée
 * (voir `entreprises.ts` : ajout/retrait de membre, changement de rôle). */
export const cleCacheRole = (utilisateurId: string, entrepriseId: string) =>
  `role:${utilisateurId}:${entrepriseId}`;

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

  // TTL court (audit infra 2026-09-03, point 7) : un rôle peut changer (retrait d'équipe,
  // changement de rôle) — 30s borne la fenêtre pendant laquelle un accès révoqué resterait actif,
  // tout en absorbant l'essentiel de la charge D1 répétée sous forte volumétrie.
  const role = await avecCacheTTL(cleCacheRole(utilisateurId, entrepriseId), 30_000, async () => {
    const membre = await c.env.DB.prepare(
      'SELECT role FROM membre_entreprise WHERE utilisateur_id = ? AND entreprise_id = ? LIMIT 1',
    )
      .bind(utilisateurId, entrepriseId)
      .first<{ role: import('@kombi/shared').RoleMembre }>();
    return membre?.role ?? null;
  });

  if (!role) return c.json({ erreur: "Accès refusé à cette entreprise" }, 403);

  c.set('entrepriseId', entrepriseId);
  c.set('role', role);
  await next();
});
