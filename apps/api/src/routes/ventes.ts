import { Hono } from 'hono';
import { z } from 'zod';
import { zModePaiement, zLigneMontant, zDateISO, messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

const zVente = z.object({
  modePaiement: zModePaiement,
  lignes: z.array(zLigneMontant).min(1, 'Ajoutez au moins un article avec un montant'),
  tiersId: z.string().nullish(),
  clientUuid: z.string().nullish(),
  dateOperation: zDateISO.nullish(),
});

export const ventes = new Hono<AppEnv>();

/** Enregistre une vente (caisse) → génère l'écriture comptable automatiquement. */
ventes.post('/', requirePermission('vente:create'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const caissierId = c.get('utilisateurId');
  const corps = zVente.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const v = corps.data;

  const lignes = v.lignes.filter((l) => l.prixUnitaire > 0);
  if (!lignes.length) return c.json({ erreur: 'Ajoutez au moins un article avec un montant' }, 400);

  const res = await stubEntreprise(c.env, entrepriseId).enregistrerVente({
    lignes, modePaiement: v.modePaiement, tiersId: v.tiersId ?? null, caissierId,
    clientUuid: v.clientUuid ?? null, dateOperation: v.dateOperation ?? null,
  }, { utilisateurId: caissierId, role: c.get('role') });
  return c.json(res, res.deja ? 200 : 201);
});

/** Statistiques du jour (pour le tableau de bord). */
ventes.get('/jour', requirePermission('vente:read'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const stats = await stubEntreprise(c.env, entrepriseId).statsJour();
  return c.json(stats);
});
