import { Hono } from 'hono';
import { z } from 'zod';
import { zModePaiement, zMontantPositif, zLigneMontant, zDateISO, messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, regimeFiscalDe, type AppEnv } from '../types.js';

const zVente = z.object({
  modePaiement: zModePaiement.nullish(),
  aCredit: z.boolean().optional().default(false),
  lignes: z.array(zLigneMontant).min(1, 'Ajoutez au moins un article avec un montant'),
  tiersId: z.string().nullish(),
  clientUuid: z.string().nullish(),
  dateOperation: zDateISO.nullish(),
  dateEcheance: zDateISO.nullish(),
}).refine((v) => v.aCredit || v.modePaiement, { message: 'Mode de paiement requis (ou vente à crédit)' })
  .refine((v) => !v.aCredit || v.tiersId, { message: 'Un client est requis pour une vente à crédit' });

const zPaiementVente = z.object({
  montant: zMontantPositif, modePaiement: zModePaiement, clientUuid: z.string().nullish(),
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

  const regimeFiscal = await regimeFiscalDe(c.env, entrepriseId);
  const res = await stubEntreprise(c.env, entrepriseId).enregistrerVente({
    lignes, modePaiement: v.modePaiement ?? null, aCredit: v.aCredit, tiersId: v.tiersId ?? null, caissierId,
    clientUuid: v.clientUuid ?? null, dateOperation: v.dateOperation ?? null, regimeFiscal,
    dateEcheance: v.dateEcheance ?? null,
  }, { utilisateurId: caissierId, role: c.get('role') });
  return c.json(res, res.deja ? 200 : 201);
});

/** Encaisse (total ou partiel) une vente à crédit. */
ventes.post('/:id/payer', requirePermission('vente:create'), async (c) => {
  const corps = zPaiementVente.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).payerVente(
    c.req.param('id'), corps.data.montant, corps.data.modePaiement,
    { utilisateurId: c.get('utilisateurId'), role: c.get('role') }, corps.data.clientUuid ?? null,
  );
  return c.json(res);
});

/** Ventes à crédit non soldées (« on me doit »). */
ventes.get('/credit', requirePermission('vente:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerVentesACredit();
  return c.json({ ventes: liste });
});

/** Historique des ventes récentes (pour retrouver une vente à annuler). */
ventes.get('/recentes', requirePermission('vente:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerVentesRecentes();
  return c.json({ ventes: liste });
});

/** Annule une vente (erreur de caisse, retour client) — contre-passation + remise en stock. */
ventes.post('/:id/annuler', requirePermission('vente:annuler'), async (c) => {
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).annulerVente(
    c.req.param('id'), { utilisateurId: c.get('utilisateurId'), role: c.get('role') },
  );
  return c.json(res);
});

/** Statistiques du jour (pour le tableau de bord). */
ventes.get('/jour', requirePermission('vente:read'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const stats = await stubEntreprise(c.env, entrepriseId).statsJour();
  return c.json(stats);
});

/** Tendance des 7 derniers jours (vrai graphe du tableau de bord). */
ventes.get('/tendance', requirePermission('vente:read'), async (c) => {
  const tendance = await stubEntreprise(c.env, c.get('entrepriseId')).tendance7Jours();
  return c.json({ tendance });
});

/** Marge brute cumulée — donnée sensible, réservée à ceux qui voient la couche comptable. */
ventes.get('/marge', requirePermission('compta:read'), async (c) => {
  const marge = await stubEntreprise(c.env, c.get('entrepriseId')).margeCumulee();
  return c.json({ marge });
});

/** Meilleures ventes de l'exercice (tableau de bord). */
ventes.get('/top', requirePermission('vente:read'), async (c) => {
  const top = await stubEntreprise(c.env, c.get('entrepriseId')).meilleuresVentes(5);
  return c.json({ top });
});
