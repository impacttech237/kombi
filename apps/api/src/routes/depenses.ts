import { Hono } from 'hono';
import { z } from 'zod';
import { CATEGORIES_DEPENSE, compteDeCategorie, zModePaiement, zMontantPositif, zTauxTva, zDateISO, messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, regimeFiscalDe, type AppEnv } from '../types.js';

const zDepense = z.object({
  categorie: z.enum(CATEGORIES_DEPENSE.map((c) => c.code) as [string, ...string[]], {
    errorMap: () => ({ message: 'Catégorie de dépense invalide' }),
  }),
  libelle: z.string().trim().min(1, 'Libellé requis').max(160),
  montant: zMontantPositif,
  modePaiement: zModePaiement,
  tiersId: z.string().nullish(),
  recurrente: z.boolean().optional().default(false),
  clientUuid: z.string().nullish(),
  tauxTva: zTauxTva.optional().default(0),
  dateOperation: zDateISO.nullish(),
});

export const depenses = new Hono<AppEnv>();

depenses.get('/', requirePermission('depense:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerDepenses();
  return c.json({ depenses: liste });
});

depenses.get('/categories', requirePermission('depense:read'), (c) => c.json({ categories: CATEGORIES_DEPENSE }));

/** Enregistre une dépense réglée → génère l'écriture comptable (débit charge / crédit trésorerie). */
depenses.post('/', requirePermission('depense:manage'), async (c) => {
  const corps = zDepense.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const d = corps.data;

  const regimeFiscal = await regimeFiscalDe(c.env, c.get('entrepriseId'));
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).creerDepense({
    categorie: d.categorie, compteNumero: compteDeCategorie(d.categorie), libelle: d.libelle,
    montant: d.montant, modePaiement: d.modePaiement,
    tiersId: d.tiersId ?? null, recurrente: d.recurrente, clientUuid: d.clientUuid ?? null,
    tauxTva: d.tauxTva, regimeFiscal, dateOperation: d.dateOperation ?? null,
  }, { utilisateurId: c.get('utilisateurId'), role: c.get('role') });
  return c.json(res, res.deja ? 200 : 201);
});
