import { Hono } from 'hono';
import { calculerIGS, projeterFranchissement } from '@kombi/fiscal';
import type { NatureActivite } from '@kombi/shared';
import { regimeActuelDe } from '../services/bascule-regime.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const fiscalite = new Hono<AppEnv>();

/** Calcul IGS : métadonnées entreprise (D1) + CA cumulé (base dédiée de l'entreprise, DO). */
fiscalite.get('/igs', async (c) => {
  const entrepriseId = c.get('entrepriseId');

  const ent = await c.env.DB.prepare(
    'SELECT adherent_cga FROM entreprise WHERE id = ?',
  )
    .bind(entrepriseId)
    .first<{ adherent_cga: number }>();
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);

  const caCumule = await stubEntreprise(c.env, entrepriseId).caCumule();
  const igs = calculerIGS(caCumule, { adherentCGA: ent.adherent_cga === 1 });
  // Régime légal de l'exercice courant (décidé sur le CA de l'exercice clos précédent, avec
  // maintien 2 ans si applicable — voir services/bascule-regime.ts), pas le régime « au pas »
  // recalculé sur le CA en cours d'accumulation.
  const { regime, ansSousSeuil } = await regimeActuelDe(c.env, entrepriseId);

  return c.json({ caCumule, regime, ansSousSeuil, igs });
});

/** Alerte de franchissement projeté sur l'exercice. */
fiscalite.get('/alerte-seuil', async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const moisEcoules = Number(c.req.query('moisEcoules') ?? '0');
  const caCumule = Number(c.req.query('caCumule') ?? '0');

  const ent = await c.env.DB.prepare('SELECT nature_activite FROM entreprise WHERE id = ?')
    .bind(entrepriseId)
    .first<{ nature_activite: NatureActivite }>();
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);

  const igs = calculerIGS(caCumule);
  const alerte = projeterFranchissement(caCumule, moisEcoules, ent.nature_activite, igs?.classe ?? null);
  return c.json(alerte);
});
