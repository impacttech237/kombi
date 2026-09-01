import { Hono } from 'hono';
import { SECTEURS, NATURE_ACTIVITE, type Secteur, type NatureActivite } from '@kombi/shared';
import { planCreationEntreprise } from '../services/onboarding.js';
import { stubEntreprise, type AppEnv } from '../types.js';

/**
 * Routes entreprises — authentifiées, sans tenant sélectionné (on crée/liste avant de choisir).
 */
export const entreprises = new Hono<AppEnv>();

/** Liste les entreprises dont l'utilisateur courant est membre (+ son rôle). */
entreprises.get('/', async (c) => {
  const utilisateurId = c.get('utilisateurId');
  const res = await c.env.DB.prepare(
    `SELECT e.id, e.raison_sociale, e.secteur, e.regime_fiscal, m.role
       FROM entreprise e
       JOIN membre_entreprise m ON m.entreprise_id = e.id
      WHERE m.utilisateur_id = ?
      ORDER BY e.raison_sociale`,
  )
    .bind(utilisateurId)
    .all();
  return c.json({ entreprises: res.results ?? [] });
});

/** Crée une entreprise : control plane (D1) puis initialisation de sa base dédiée (DO). */
entreprises.post('/', async (c) => {
  const utilisateurId = c.get('utilisateurId');
  const body = await c.req.json().catch(() => null);

  const raisonSociale = String(body?.raisonSociale ?? '').trim();
  const secteur = body?.secteur as Secteur;
  const natureActivite = body?.natureActivite as NatureActivite;
  const niu = body?.niu ? String(body.niu).trim() : undefined;

  if (!raisonSociale) return c.json({ erreur: 'raisonSociale requise' }, 400);
  if (!SECTEURS.includes(secteur)) return c.json({ erreur: 'secteur invalide' }, 400);
  if (!NATURE_ACTIVITE.includes(natureActivite))
    return c.json({ erreur: 'natureActivite invalide' }, 400);

  const annee = new Date().getUTCFullYear();
  const { entrepriseId, stmts } = planCreationEntreprise(c.env.DB, {
    raisonSociale, secteur, natureActivite, niu, utilisateurId, annee,
  });

  await c.env.DB.batch(stmts); // control plane, atomique
  // Initialise la base dédiée de l'entreprise (modules, plan comptable, exercice).
  await stubEntreprise(c.env, entrepriseId).initialiser(entrepriseId, secteur, annee);

  return c.json({ entrepriseId }, 201);
});

/** Modules actifs de l'entreprise (lus dans sa base dédiée). */
entreprises.get('/:id/modules', async (c) => {
  const utilisateurId = c.get('utilisateurId');
  const id = c.req.param('id');
  const membre = await c.env.DB.prepare(
    'SELECT 1 FROM membre_entreprise WHERE utilisateur_id = ? AND entreprise_id = ?',
  )
    .bind(utilisateurId, id)
    .first();
  if (!membre) return c.json({ erreur: 'Accès refusé' }, 403);

  const modules = await stubEntreprise(c.env, id).modules();
  return c.json({ modules });
});
