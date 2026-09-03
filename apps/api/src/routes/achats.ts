import { Hono } from 'hono';
import { z } from 'zod';
import { zModePaiement, zMontantPositif, messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';
import { monterRoutesPiece } from '../services/pieces.js';

const zPaiementAchat = z.object({
  montant: zMontantPositif, modePaiement: zModePaiement, clientUuid: z.string().nullish(),
});

export const achats = new Hono<AppEnv>();

/** Dettes fournisseurs non soldées (« ce que je dois »). */
achats.get('/dettes', requirePermission('achat:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerDettesFournisseurs();
  return c.json({ dettes: liste });
});

/** Règle (total ou partiel) une dette fournisseur. */
achats.post('/:id/payer', requirePermission('achat:manage'), async (c) => {
  const corps = zPaiementAchat.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).payerAchat(
    c.req.param('id'), corps.data.montant, corps.data.modePaiement,
    { utilisateurId: c.get('utilisateurId'), role: c.get('role') }, corps.data.clientUuid ?? null,
  );
  return c.json(res);
});

// ── Pièce justificative (scan de la facture fournisseur) ──
monterRoutesPiece(achats, {
  segment: 'achat', permissionLire: 'achat:read', permissionGerer: 'achat:manage',
  introuvable: 'Achat introuvable',
  existe: (stub, id) => stub.achatExiste(id),
  attacher: (stub, id, cle) => stub.attacherPieceAchat(id, cle),
  lireCle: (stub, id) => stub.getPieceAchat(id),
});
