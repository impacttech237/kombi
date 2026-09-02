import { Hono } from 'hono';
import { z } from 'zod';
import { requirePermission } from '../middleware/permission.js';
import { abonnementDe, type AppEnv } from '../types.js';

export const abonnement = new Hono<AppEnv>();

/** Abonnement courant + fonctionnalités du plan (voir docs/Spécifications_technique.md §7). */
abonnement.get('/', async (c) => {
  const a = await abonnementDe(c.env, c.get('entrepriseId'));
  if (!a) return c.json({ erreur: 'Aucun abonnement' }, 404);
  return c.json(a);
});

const zChangementPlan = z.object({ planCode: z.enum(['gratuit', 'essentiel', 'pro']) });

/**
 * Change de plan. MVP : pas de passerelle de paiement (réserve réglementaire, spec §7) — validé
 * manuellement par l'admin de l'entreprise en attendant une validation staff + paiement réel.
 */
abonnement.post('/plan', requirePermission('entreprise:manage'), async (c) => {
  const corps = zChangementPlan.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: 'Plan invalide' }, 400);
  await c.env.DB.prepare(
    "UPDATE abonnement SET plan_code = ?, statut = 'actif' WHERE entreprise_id = ?",
  ).bind(corps.data.planCode, c.get('entrepriseId')).run();
  return c.json({ ok: true });
});
