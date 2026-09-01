import { Hono } from 'hono';
import { MODE_PAIEMENT, type ModePaiement } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';
import type { LigneVenteEntree } from '../do/entreprise-do.js';

export const ventes = new Hono<AppEnv>();

/** Enregistre une vente (caisse) → génère l'écriture comptable automatiquement. */
ventes.post('/', requirePermission('vente:create'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const caissierId = c.get('utilisateurId');
  const body = await c.req.json().catch(() => null);

  const modePaiement = body?.modePaiement as ModePaiement;
  if (!MODE_PAIEMENT.includes(modePaiement)) return c.json({ erreur: 'Mode de paiement invalide' }, 400);

  const lignesBrutes = Array.isArray(body?.lignes) ? body.lignes : [];
  const lignes: LigneVenteEntree[] = lignesBrutes
    .map((l: Record<string, unknown>) => ({
      designation: String(l.designation ?? 'Article').slice(0, 120),
      quantite: Math.max(1, Math.floor(Number(l.quantite ?? 1))),
      prixUnitaire: Math.max(0, Math.floor(Number(l.prixUnitaire ?? 0))),
      tauxTva: Number(l.tauxTva ?? 0),
    }))
    .filter((l: LigneVenteEntree) => l.prixUnitaire > 0);

  if (!lignes.length) return c.json({ erreur: 'Ajoutez au moins un article avec un montant' }, 400);

  const res = await stubEntreprise(c.env, entrepriseId).enregistrerVente({
    lignes, modePaiement, tiersId: body?.tiersId ?? null, caissierId,
    clientUuid: body?.clientUuid ?? null,
  });
  return c.json(res, res.deja ? 200 : 201);
});

/** Statistiques du jour (pour le tableau de bord). */
ventes.get('/jour', requirePermission('vente:read'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const stats = await stubEntreprise(c.env, entrepriseId).statsJour();
  return c.json(stats);
});
