import { Hono } from 'hono';
import { z } from 'zod';
import { messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

const zAnneeMois = z.string().regex(/^\d{4}-\d{2}$/, 'Format de mois invalide (attendu AAAA-MM)');
const zBudget = z.object({
  caCible: z.number().int().nonnegative().nullish(),
  plafondDepenses: z.number().int().nonnegative().nullish(),
  margeCiblePct: z.number().min(0).max(100).nullish(),
});
const zHorizon = z.union([z.literal(30), z.literal(60), z.literal(90)]);

export const budgets = new Hono<AppEnv>();

budgets.get('/', requirePermission('budget:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerBudgets();
  return c.json({ budgets: liste });
});

budgets.get('/previsions', requirePermission('budget:read'), async (c) => {
  const horizon = zHorizon.safeParse(Number(c.req.query('horizon') ?? '30'));
  if (!horizon.success) return c.json({ erreur: 'Horizon invalide (30, 60 ou 90 jours)' }, 400);
  const prevision = await stubEntreprise(c.env, c.get('entrepriseId')).previsionTresorerie(horizon.data);
  return c.json(prevision);
});

budgets.get('/seuil-rentabilite', requirePermission('budget:read'), async (c) => {
  const seuil = await stubEntreprise(c.env, c.get('entrepriseId')).seuilRentabilite();
  return c.json(seuil);
});

budgets.get('/simulation', requirePermission('budget:read'), async (c) => {
  const type = c.req.query('type');
  if (type !== 'baisse_ventes' && type !== 'recrutement_investissement') {
    return c.json({ erreur: 'Type de simulation invalide' }, 400);
  }
  const params = type === 'baisse_ventes'
    ? { pct: Number(c.req.query('pct') ?? '0') }
    : { coutMensuel: Number(c.req.query('coutMensuel') ?? '0') };
  const resultat = await stubEntreprise(c.env, c.get('entrepriseId')).simulerScenario(type, params);
  return c.json(resultat);
});

budgets.get('/:anneeMois', requirePermission('budget:read'), async (c) => {
  const anneeMois = zAnneeMois.safeParse(c.req.param('anneeMois'));
  if (!anneeMois.success) return c.json({ erreur: messageErreurZod(anneeMois.error) }, 400);
  const budget = await stubEntreprise(c.env, c.get('entrepriseId')).getBudget(anneeMois.data);
  return c.json({ budget });
});

budgets.put('/:anneeMois', requirePermission('budget:manage'), async (c) => {
  const anneeMois = zAnneeMois.safeParse(c.req.param('anneeMois'));
  if (!anneeMois.success) return c.json({ erreur: messageErreurZod(anneeMois.error) }, 400);
  const corps = zBudget.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  await stubEntreprise(c.env, c.get('entrepriseId')).definirBudget(anneeMois.data, corps.data, {
    utilisateurId: c.get('utilisateurId'), role: c.get('role'),
  });
  return c.json({ ok: true });
});
