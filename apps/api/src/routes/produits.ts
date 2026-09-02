import { Hono } from 'hono';
import { z } from 'zod';
import { zModePaiement, zMontantPositif, zMontantPositifOuNul, messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

const zProduit = z.object({
  nom: z.string().trim().min(1, 'Nom requis').max(120),
  sku: z.string().trim().max(64).nullish(),
  prixVente: zMontantPositifOuNul,
  seuilAlerte: zMontantPositifOuNul.optional().default(0),
  unite: z.string().trim().max(32).nullish(),
});

const zEntreeStock = z.object({
  quantite: zMontantPositif,
  coutUnitaire: zMontantPositifOuNul,
  modePaiement: zModePaiement.nullish(),
  aCredit: z.boolean().optional().default(false),
  tiersId: z.string().nullish(),
}).refine((v) => v.aCredit || v.modePaiement, { message: 'Mode de paiement requis (ou achat à crédit)' })
  .refine((v) => !v.aCredit || v.tiersId, { message: 'Un fournisseur est requis pour un achat à crédit' });

export const produits = new Hono<AppEnv>();

/** Liste des produits (avec niveau de stock et alerte de rupture). */
produits.get('/', requirePermission('stock:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerProduits();
  return c.json({ produits: liste });
});

/** Crée un produit. */
produits.post('/', requirePermission('stock:manage'), async (c) => {
  const corps = zProduit.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const p = corps.data;

  const id = await stubEntreprise(c.env, c.get('entrepriseId')).creerProduit({
    nom: p.nom, sku: p.sku ?? null, prixVente: p.prixVente, seuilAlerte: p.seuilAlerte,
    unite: p.unite ?? undefined,
  });
  return c.json({ produitId: id }, 201);
});

/** Approvisionnement : entrée en stock (met à jour le CMP + écriture d'achat). */
produits.post('/:id/entree', requirePermission('stock:manage'), async (c) => {
  const corps = zEntreeStock.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const e = corps.data;

  const res = await stubEntreprise(c.env, c.get('entrepriseId')).entrerStock({
    produitId: c.req.param('id'), quantite: e.quantite, coutUnitaire: e.coutUnitaire,
    modePaiement: e.modePaiement ?? null, aCredit: e.aCredit, tiersId: e.tiersId ?? null,
  }, { utilisateurId: c.get('utilisateurId'), role: c.get('role') });
  return c.json(res);
});
