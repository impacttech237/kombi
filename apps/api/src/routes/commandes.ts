import { Hono } from 'hono';
import { STATUT_COMMANDE, TYPE_COMMANDE, type StatutCommande, type TypeCommande } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const commandes = new Hono<AppEnv>();

commandes.get('/', requirePermission('commande:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerCommandes();
  return c.json({ commandes: liste });
});

commandes.post('/', requirePermission('commande:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const libelle = String(body?.libelle ?? '').trim();
  if (!libelle) return c.json({ erreur: 'Libellé requis' }, 400);
  const type = TYPE_COMMANDE.includes(body?.type) ? (body.type as TypeCommande) : 'commande';
  const montant = body?.montant != null ? Math.floor(Number(body.montant)) : null;

  const id = await stubEntreprise(c.env, c.get('entrepriseId')).creerCommande({
    type, libelle, tiersId: body?.tiersId ?? null, montant,
    datePrevue: body?.datePrevue ?? null,
  });
  return c.json({ commandeId: id }, 201);
});

commandes.post('/:id/statut', requirePermission('commande:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const statut = body?.statut as StatutCommande;
  if (!STATUT_COMMANDE.includes(statut)) return c.json({ erreur: 'Statut invalide' }, 400);
  await stubEntreprise(c.env, c.get('entrepriseId')).changerStatutCommande(c.req.param('id'), statut);
  return c.json({ ok: true });
});
