import { Hono } from 'hono';
import { calculerIGS, determinerRegime, projeterFranchissement } from '@kombi/fiscal';
import type { NatureActivite } from '@kombi/shared';
import { stubEntreprise, type AppEnv } from '../types.js';

export const fiscalite = new Hono<AppEnv>();

/** Calcul IGS : métadonnées entreprise (D1) + CA cumulé (base dédiée de l'entreprise, DO). */
fiscalite.get('/igs', async (c) => {
  const entrepriseId = c.get('entrepriseId');

  const ent = await c.env.DB.prepare(
    'SELECT adherent_cga, nature_activite FROM entreprise WHERE id = ?',
  )
    .bind(entrepriseId)
    .first<{ adherent_cga: number; nature_activite: NatureActivite }>();
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);

  const caCumule = await stubEntreprise(c.env, entrepriseId).caCumule();
  const igs = calculerIGS(caCumule, { adherentCGA: ent.adherent_cga === 1 });
  const regime = determinerRegime({ caAnnuelHT: caCumule, natureActivite: ent.nature_activite });

  return c.json({ caCumule, regime, igs });
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
