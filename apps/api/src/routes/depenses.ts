import { Hono } from 'hono';
import { MODE_PAIEMENT, CATEGORIES_DEPENSE, compteDeCategorie, type ModePaiement } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const depenses = new Hono<AppEnv>();

depenses.get('/', requirePermission('depense:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerDepenses();
  return c.json({ depenses: liste });
});

depenses.get('/categories', requirePermission('depense:read'), (c) => c.json({ categories: CATEGORIES_DEPENSE }));

/** Enregistre une dépense réglée → génère l'écriture comptable (débit charge / crédit trésorerie). */
depenses.post('/', requirePermission('depense:manage'), async (c) => {
  const body = await c.req.json().catch(() => null);

  const modePaiement = body?.modePaiement as ModePaiement;
  if (!MODE_PAIEMENT.includes(modePaiement)) return c.json({ erreur: 'Mode de paiement invalide' }, 400);

  const categorie = String(body?.categorie ?? '');
  if (!CATEGORIES_DEPENSE.some((cat) => cat.code === categorie)) {
    return c.json({ erreur: 'Catégorie de dépense invalide' }, 400);
  }
  const libelle = String(body?.libelle ?? '').trim();
  if (!libelle) return c.json({ erreur: 'Libellé requis' }, 400);
  const montant = Math.floor(Number(body?.montant ?? 0));
  if (montant <= 0) return c.json({ erreur: 'Montant invalide' }, 400);

  const res = await stubEntreprise(c.env, c.get('entrepriseId')).creerDepense({
    categorie, compteNumero: compteDeCategorie(categorie), libelle, montant, modePaiement,
    tiersId: body?.tiersId ?? null, recurrente: Boolean(body?.recurrente), clientUuid: body?.clientUuid ?? null,
  });
  return c.json(res, res.deja ? 200 : 201);
});
