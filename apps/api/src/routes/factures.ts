import { Hono } from 'hono';
import { MODE_PAIEMENT, type ModePaiement } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';
import { genererFacturePDF, type DonneesFacture } from '../pdf/facture-pdf.js';

export const factures = new Hono<AppEnv>();

/** Préfixe de numérotation dérivé de la raison sociale (ex. "Boutique Awa" -> "BOUTIQUE"). */
function prefixe(raisonSociale: string): string {
  const clean = raisonSociale.toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, '').trim();
  return (clean.split(/\s+/)[0] || 'KOMBI').slice(0, 10);
}

async function emetteur(c: { env: AppEnv['Bindings'] }, entrepriseId: string) {
  return (c.env as AppEnv['Bindings']).DB
    .prepare('SELECT raison_sociale, niu FROM entreprise WHERE id = ?')
    .bind(entrepriseId)
    .first<{ raison_sociale: string; niu: string | null }>();
}

factures.get('/', requirePermission('facture:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerFactures();
  return c.json({ factures: liste });
});

factures.post('/', requirePermission('facture:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const type = body?.type === 'devis' ? 'devis' : 'facture';
  const tiersId = String(body?.tiersId ?? '');
  if (!tiersId) return c.json({ erreur: 'Client requis' }, 400);
  const lignes = (Array.isArray(body?.lignes) ? body.lignes : [])
    .map((l: Record<string, unknown>) => ({
      designation: String(l.designation ?? 'Article').slice(0, 120),
      quantite: Math.max(1, Math.floor(Number(l.quantite ?? 1))),
      prixUnitaire: Math.max(0, Math.floor(Number(l.prixUnitaire ?? 0))),
      tauxTva: Number(l.tauxTva ?? 0),
    }))
    .filter((l: { prixUnitaire: number }) => l.prixUnitaire > 0);
  if (!lignes.length) return c.json({ erreur: 'Ajoutez au moins une ligne' }, 400);

  const id = await stubEntreprise(c.env, c.get('entrepriseId')).creerFacture({
    type, tiersId, dateEcheance: body?.dateEcheance ?? null, lignes,
  });
  return c.json({ factureId: id }, 201);
});

factures.post('/:id/emettre', requirePermission('facture:manage'), async (c) => {
  const ent = await emetteur(c, c.get('entrepriseId'));
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);
  const res = await stubEntreprise(c.env, c.get('entrepriseId'))
    .emettreFacture(c.req.param('id'), prefixe(ent.raison_sociale));
  return c.json(res);
});

factures.post('/:id/payer', requirePermission('facture:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const montant = Math.floor(Number(body?.montant ?? 0));
  const modePaiement = body?.modePaiement as ModePaiement;
  if (montant <= 0) return c.json({ erreur: 'Montant invalide' }, 400);
  if (!MODE_PAIEMENT.includes(modePaiement)) return c.json({ erreur: 'Mode de paiement invalide' }, 400);
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).payerFacture(c.req.param('id'), montant, modePaiement);
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
  const pdf = await genererFacturePDF(f, { raisonSociale: ent?.raison_sociale ?? 'Kombi', niu: ent?.niu });
  return new Response(pdf, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${f.numero ?? 'facture'}.pdf"`,
    },
  });
});
