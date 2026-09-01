import { Hono } from 'hono';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const tiers = new Hono<AppEnv>();

tiers.get('/', requirePermission('tiers:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerTiers();
  return c.json({ tiers: liste });
});

tiers.post('/', requirePermission('tiers:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const nom = String(body?.nom ?? '').trim();
  if (!nom) return c.json({ erreur: 'Nom requis' }, 400);
  const type = ['client', 'fournisseur', 'les_deux'].includes(body?.type) ? body.type : 'client';
  const id = await stubEntreprise(c.env, c.get('entrepriseId')).creerTiers({
    type, nom, niu: body?.niu ? String(body.niu).trim() : undefined,
    telephone: body?.telephone ? String(body.telephone).trim() : undefined,
  });
  return c.json({ tiersId: id }, 201);
});
