import { Hono } from 'hono';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const pilotage = new Hono<AppEnv>();

/**
 * Cockpit dirigeant (voir docs/PLAN-cockpit-dirigeant.md) : trésorerie, comparaison au mois
 * précédent, alertes, top produits — un seul appel pour tout le nouveau bloc du Dashboard.
 * Gardé par `compta:read`, comme États financiers / Pièces justificatives.
 */
pilotage.get('/cockpit', requirePermission('compta:read'), async (c) => {
  const cockpit = await stubEntreprise(c.env, c.get('entrepriseId')).cockpit();
  return c.json(cockpit);
});

/** Marge par produit sur l'exercice ouvert — écran Rentabilité. */
pilotage.get('/marge-produits', requirePermission('compta:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).margeParProduit();
  return c.json({ produits: liste });
});
