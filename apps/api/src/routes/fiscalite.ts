import { Hono } from 'hono';
import { calculerIGS, determinerRegime, projeterFranchissement } from '@kombi/fiscal';
import type { NatureActivite } from '@kombi/shared';
import type { AppEnv } from '../types.js';

export const fiscalite = new Hono<AppEnv>();

/** Calcul IGS pour l'entreprise courante à partir de son CA cumulé de l'exercice. */
fiscalite.get('/igs', async (c) => {
  const entrepriseId = c.get('entrepriseId');

  const ent = await c.env.DB.prepare(
    'SELECT adherent_cga, nature_activite FROM entreprise WHERE id = ?',
  )
    .bind(entrepriseId)
    .first<{ adherent_cga: number; nature_activite: NatureActivite }>();
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);

  // CA cumulé = somme des ventes (crédits classe 7) sur l'exercice ouvert.
  const row = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(l.montant), 0) AS ca
       FROM ligne_ecriture l
       JOIN compte_comptable cc ON cc.id = l.compte_id
       JOIN ecriture e ON e.id = l.ecriture_id
      WHERE l.entreprise_id = ? AND cc.classe = 7 AND l.sens = 'credit'
        AND e.statut = 'validee'`,
  )
    .bind(entrepriseId)
    .first<{ ca: number }>();

  const caCumule = row?.ca ?? 0;
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
  const alerte = projeterFranchissement(
    caCumule,
    moisEcoules,
    ent.nature_activite,
    igs?.classe ?? null,
  );
  return c.json(alerte);
});
