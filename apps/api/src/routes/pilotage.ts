import { Hono } from 'hono';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';
import { avecCacheTTL } from '../lib/cache-isolate.js';

export const pilotage = new Hono<AppEnv>();

/**
 * Cockpit dirigeant (voir docs/PLAN-cockpit-dirigeant.md) : trésorerie, comparaison au mois
 * précédent, alertes, top produits — un seul appel pour tout le nouveau bloc du Dashboard.
 * Gardé par `compta:read`, comme États financiers / Pièces justificatives.
 *
 * `cockpit()` fait une dizaine de requêtes SQL côté DO à chaque appel (audit du 2026-09-04,
 * point 9) ; un rechargement fréquent du Dashboard répéterait ce coût inutilement. Mis en cache
 * en mémoire d'isolate (même mécanisme que D16), TTL court : une donnée de pilotage tolère
 * quelques secondes de retard, contrairement à un paiement ou une écriture comptable — jamais
 * utilisé ici pour de l'autorisation.
 */
pilotage.get('/cockpit', requirePermission('compta:read'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const cockpit = await avecCacheTTL(`cockpit:${entrepriseId}`, 20_000, () =>
    stubEntreprise(c.env, entrepriseId).cockpit(),
  );
  return c.json(cockpit);
});

/** Marge par produit sur l'exercice ouvert — écran Rentabilité. */
pilotage.get('/marge-produits', requirePermission('compta:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).margeParProduit();
  return c.json({ produits: liste });
});

/** Marge par client sur l'exercice ouvert — écran Rentabilité (onglet Clients). */
pilotage.get('/marge-clients', requirePermission('compta:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).margeParClient();
  return c.json({ clients: liste });
});
