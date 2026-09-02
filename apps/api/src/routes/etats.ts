import { Hono } from 'hono';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const etats = new Hono<AppEnv>();

/** Compte de résultat + bilan de l'entreprise (couche comptable, consultation). */
etats.get('/', requirePermission('compta:read'), async (c) => {
  const e = await stubEntreprise(c.env, c.get('entrepriseId')).etatsFinanciers();
  return c.json(e);
});
