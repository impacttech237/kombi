import { Hono } from 'hono';
import { SECTEURS, NATURE_ACTIVITE, type Secteur, type NatureActivite } from '@kombi/shared';
import { planCreationEntreprise } from '../services/onboarding.js';
import type { AppEnv } from '../types.js';

/**
 * Routes entreprises — nécessitent l'authentification mais PAS de tenant sélectionné
 * (on crée / liste les entreprises de l'utilisateur avant d'en choisir une).
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

/** Crée une entreprise avec application du preset sectoriel (onboarding). */
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
    raisonSociale,
    secteur,
    natureActivite,
    niu,
    utilisateurId,
    annee,
  });

  await c.env.DB.batch(stmts); // batch = atomique
  return c.json({ entrepriseId }, 201);
});

/** Modules actifs de l'entreprise (nécessite x-entreprise-id + appartenance). */
entreprises.get('/:id/modules', async (c) => {
  const utilisateurId = c.get('utilisateurId');
  const id = c.req.param('id');
  const membre = await c.env.DB.prepare(
    'SELECT 1 FROM membre_entreprise WHERE utilisateur_id = ? AND entreprise_id = ?',
  )
    .bind(utilisateurId, id)
    .first();
  if (!membre) return c.json({ erreur: 'Accès refusé' }, 403);

  const res = await c.env.DB.prepare(
    'SELECT code_module, actif FROM module_entreprise WHERE entreprise_id = ?',
  )
    .bind(id)
    .all<{ code_module: string; actif: number }>();
  return c.json({ modules: res.results ?? [] });
});
