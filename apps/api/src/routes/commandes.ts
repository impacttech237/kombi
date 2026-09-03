import { Hono } from 'hono';
import { z } from 'zod';
import {
  STATUT_COMMANDE, TYPE_COMMANDE, zDateISO, messageErreurZod, type StatutCommande,
} from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

const zCommande = z.object({
  type: z.enum(TYPE_COMMANDE).optional().default('commande'),
  libelle: z.string().trim().min(1, 'Libellé requis').max(160),
  montant: z.coerce.number().int().nonnegative().nullish(),
  tiersId: z.string().nullish(),
  datePrevue: zDateISO.nullish(),
  clientUuid: z.string().nullish(),
});

export const commandes = new Hono<AppEnv>();

commandes.get('/', requirePermission('commande:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerCommandes();
  return c.json({ commandes: liste });
});

commandes.post('/', requirePermission('commande:manage'), async (c) => {
  const parsed = zCommande.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ erreur: messageErreurZod(parsed.error) }, 400);
  const { type, libelle, montant, tiersId, datePrevue, clientUuid } = parsed.data;

  const id = await stubEntreprise(c.env, c.get('entrepriseId')).creerCommande({
    type, libelle, tiersId: tiersId ?? null, montant: montant ?? null, datePrevue: datePrevue ?? null,
    clientUuid: clientUuid ?? null,
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
