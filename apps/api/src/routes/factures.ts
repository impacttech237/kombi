import { Hono } from 'hono';
import { z } from 'zod';
import { zModePaiement, zMontantPositif, zLigneMontant, zDateISO, messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, regimeFiscalDe, abonnementDe, type AppEnv } from '../types.js';
import { genererFacturePDF, type DonneesFacture } from '../pdf/facture-pdf.js';

const zCreationFacture = z.object({
  type: z.enum(['devis', 'facture']).default('facture'),
  tiersId: z.string().min(1, 'Client requis'),
  dateEcheance: zDateISO.nullish(),
  lignes: z.array(zLigneMontant).min(1, 'Ajoutez au moins une ligne'),
  clientUuid: z.string().nullish(),
});

const zPaiementFacture = z.object({
  montant: zMontantPositif,
  modePaiement: zModePaiement,
  clientUuid: z.string().nullish(),
});

export const factures = new Hono<AppEnv>();

/** Préfixe de numérotation dérivé de la raison sociale (ex. "Boutique Awa" -> "BOUTIQUE"). */
function prefixe(raisonSociale: string): string {
  const clean = raisonSociale.toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, '').trim();
  return (clean.split(/\s+/)[0] || 'KOMBI').slice(0, 10);
}

async function emetteur(c: { env: AppEnv['Bindings'] }, entrepriseId: string) {
  return (c.env as AppEnv['Bindings']).DB
    .prepare('SELECT raison_sociale, niu, assujetti_tva, note_facture FROM entreprise WHERE id = ?')
    .bind(entrepriseId)
    .first<{ raison_sociale: string; niu: string | null; assujetti_tva: number; note_facture: string | null }>();
}

factures.get('/', requirePermission('facture:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerFactures();
  return c.json({ factures: liste });
});

/** Factures émises non soldées (« on me doit »), avec montant dû et retard calculés. */
factures.get('/impayees', requirePermission('facture:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerFacturesImpayees();
  return c.json({ factures: liste });
});

factures.post('/', requirePermission('facture:manage'), async (c) => {
  const corps = zCreationFacture.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const f = corps.data;

  const lignes = f.lignes.filter((l) => l.prixUnitaire > 0);
  if (!lignes.length) return c.json({ erreur: 'Ajoutez au moins une ligne' }, 400);

  const regimeFiscal = await regimeFiscalDe(c.env, c.get('entrepriseId'));
  const id = await stubEntreprise(c.env, c.get('entrepriseId')).creerFacture({
    type: f.type, tiersId: f.tiersId, dateEcheance: f.dateEcheance ?? null, lignes, regimeFiscal,
    clientUuid: f.clientUuid ?? null,
  });
  return c.json({ factureId: id }, 201);
});

factures.post('/:id/emettre', requirePermission('facture:manage'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const ent = await emetteur(c, entrepriseId);
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);

  // Quota du plan Gratuit (spec §7 : 50 factures/mois) — Essentiel/Pro sont illimités.
  const a = await abonnementDe(c.env, entrepriseId);
  if (a?.features.quotaFacturesMois != null) {
    const emises = await stubEntreprise(c.env, entrepriseId).compterFacturesMoisCourant();
    if (emises >= a.features.quotaFacturesMois) {
      return c.json({ erreur: `Quota du plan ${a.planCode} atteint (${a.features.quotaFacturesMois} factures/mois)` }, 402);
    }
  }

  const regimeFiscal = await regimeFiscalDe(c.env, entrepriseId);
  const assujettiTva = regimeFiscal !== 'igs' && ent.assujetti_tva === 1;
  const res = await stubEntreprise(c.env, entrepriseId).emettreFacture(
    c.req.param('id'), prefixe(ent.raison_sociale),
    { utilisateurId: c.get('utilisateurId'), role: c.get('role') }, assujettiTva,
  );
  return c.json(res);
});

/**
 * Facture-document pour une vente déjà réglée en caisse — réutilise l'écriture de la vente
 * (pas de double comptage du CA). Voir creerFactureDepuisVente().
 */
factures.post('/depuis-vente/:venteId', requirePermission('facture:manage'), async (c) => {
  const ent = await emetteur(c, c.get('entrepriseId'));
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).creerFactureDepuisVente(
    c.req.param('venteId'), prefixe(ent.raison_sociale),
    { utilisateurId: c.get('utilisateurId'), role: c.get('role') },
  );
  return c.json(res, 201);
});

/** Convertit un devis en une nouvelle facture (brouillon), liée via facture.devis_id. */
factures.post('/:id/convertir', requirePermission('facture:manage'), async (c) => {
  const factureId = await stubEntreprise(c.env, c.get('entrepriseId')).convertirDevisEnFacture(c.req.param('id'));
  return c.json({ factureId }, 201);
});

/** Avoir : corrige une facture émise sans la supprimer (contre-passation complète). */
factures.post('/:id/avoir', requirePermission('facture:manage'), async (c) => {
  const ent = await emetteur(c, c.get('entrepriseId'));
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).creerAvoir(
    c.req.param('id'), prefixe(ent.raison_sociale), { utilisateurId: c.get('utilisateurId'), role: c.get('role') },
  );
  return c.json(res, 201);
});

factures.post('/:id/payer', requirePermission('facture:manage'), async (c) => {
  const corps = zPaiementFacture.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).payerFacture(
    c.req.param('id'), corps.data.montant, corps.data.modePaiement,
    { utilisateurId: c.get('utilisateurId'), role: c.get('role') }, corps.data.clientUuid ?? null,
  );
  return c.json(res);
});

factures.get('/:id', requirePermission('facture:read'), async (c) => {
  const f = await stubEntreprise(c.env, c.get('entrepriseId')).getFacture(c.req.param('id'));
  if (!f) return c.json({ erreur: 'Facture introuvable' }, 404);
  return c.json(f);
});

factures.get('/:id/pdf', requirePermission('facture:read'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const f = (await stubEntreprise(c.env, entrepriseId).getFacture(c.req.param('id'))) as DonneesFacture | null;
  if (!f) return c.json({ erreur: 'Facture introuvable' }, 404);
  const ent = await emetteur(c, entrepriseId);
  const pdf = await genererFacturePDF(f, { raisonSociale: ent?.raison_sociale ?? 'Kombi', niu: ent?.niu, noteFacture: ent?.note_facture });
  return new Response(pdf, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${f.numero ?? 'facture'}.pdf"`,
    },
  });
});
