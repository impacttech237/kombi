import { Hono } from 'hono';
import { MODE_PAIEMENT, type ModePaiement } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const produits = new Hono<AppEnv>();

/** Liste des produits (avec niveau de stock et alerte de rupture). */
produits.get('/', requirePermission('stock:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerProduits();
  return c.json({ produits: liste });
});

/** Crée un produit. */
produits.post('/', requirePermission('stock:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const nom = String(body?.nom ?? '').trim();
  const prixVente = Math.floor(Number(body?.prixVente ?? 0));
  if (!nom) return c.json({ erreur: 'Nom requis' }, 400);
  if (!(prixVente >= 0)) return c.json({ erreur: 'Prix invalide' }, 400);

  const id = await stubEntreprise(c.env, c.get('entrepriseId')).creerProduit({
    nom, sku: body?.sku ? String(body.sku).trim() : null, prixVente,
    seuilAlerte: Math.floor(Number(body?.seuilAlerte ?? 0)),
    unite: body?.unite ? String(body.unite) : undefined,
  });
  return c.json({ produitId: id }, 201);
});

/** Approvisionnement : entrée en stock (met à jour le CMP + écriture d'achat). */
produits.post('/:id/entree', requirePermission('stock:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);
  const quantite = Math.floor(Number(body?.quantite ?? 0));
  const coutUnitaire = Math.floor(Number(body?.coutUnitaire ?? 0));
  const modePaiement = body?.modePaiement as ModePaiement;
  if (quantite <= 0) return c.json({ erreur: 'Quantité invalide' }, 400);
  if (coutUnitaire < 0) return c.json({ erreur: 'Coût invalide' }, 400);
  if (!MODE_PAIEMENT.includes(modePaiement)) return c.json({ erreur: 'Mode de paiement invalide' }, 400);

  const res = await stubEntreprise(c.env, c.get('entrepriseId')).entrerStock({
    produitId: c.req.param('id'), quantite, coutUnitaire, modePaiement,
  });
  return c.json(res);
});
