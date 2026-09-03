import { Hono } from 'hono';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const etats = new Hono<AppEnv>();

/** Compte de résultat + bilan de l'entreprise (couche comptable, consultation). */
etats.get('/', requirePermission('compta:read'), async (c) => {
  const e = await stubEntreprise(c.env, c.get('entrepriseId')).etatsFinanciers();
  return c.json(e);
});

/** Trésorerie du jour par mode (espèces, MTN MoMo, Orange Money, banque) — tableau de bord. */
etats.get('/tresorerie-jour', requirePermission('compta:read'), async (c) => {
  const t = await stubEntreprise(c.env, c.get('entrepriseId')).tresorerieDuJour();
  return c.json(t);
});

/** Soldes réels de trésorerie par mode (cumul depuis l'ouverture de l'exercice) — écran Trésorerie. */
etats.get('/tresorerie-solde', requirePermission('compta:read'), async (c) => {
  const t = await stubEntreprise(c.env, c.get('entrepriseId')).soldesTresorerie();
  return c.json(t);
});

/** Journal d'audit immuable : entrées + preuve d'intégrité de la chaîne de hash. */
etats.get('/audit', requirePermission('audit:read'), async (c) => {
  const e = stubEntreprise(c.env, c.get('entrepriseId'));
  const [entrees, integrite] = await Promise.all([e.listerAuditLog(), e.verifierChaineAudit()]);
  return c.json({ entrees, integrite });
});
