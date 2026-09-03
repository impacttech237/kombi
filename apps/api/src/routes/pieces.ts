import { Hono } from 'hono';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const pieces = new Hono<AppEnv>();

/**
 * Toutes les pièces justificatives jointes (dépenses, achats fournisseurs, ventes à crédit) en un
 * seul endroit — pour un comptable qui doit retrouver un justificatif sans ouvrir chaque écran un
 * par un. Gaté sur `compta:read` (gérant/comptable/admin), pas juste la somme des permissions
 * individuelles, puisque le but explicite de cet écran est la revue comptable transverse.
 */
pieces.get('/', requirePermission('compta:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerPiecesJustificatives();
  return c.json({ pieces: liste });
});
