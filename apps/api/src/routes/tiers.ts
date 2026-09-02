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
    email: body?.email ? String(body.email).trim() : undefined,
    adresse: body?.adresse ? String(body.adresse).trim() : undefined,
  });
  return c.json({ tiersId: id }, 201);
});

/** Fiche tiers : coordonnées, solde et historique des opérations. */
tiers.get('/:id', requirePermission('tiers:read'), async (c) => {
  const fiche = await stubEntreprise(c.env, c.get('entrepriseId')).getTiersDetail(c.req.param('id'));
  if (!fiche) return c.json({ erreur: 'Tiers introuvable' }, 404);
  return c.json(fiche);
});
