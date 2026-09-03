import { Hono } from 'hono';
import { z } from 'zod';
import {
  SECTEURS, NATURE_ACTIVITE, ROLE_MEMBRE, peut, messageErreurZod,
  type Secteur, type NatureActivite, type RoleMembre,
} from '@kombi/shared';
import { planCreationEntreprise } from '../services/onboarding.js';
import { sauvegarderEntreprise, listerSauvegardes } from '../services/sauvegarde.js';
import { cleCacheRole } from '../middleware/tenant.js';
import { invaliderCache } from '../lib/cache-isolate.js';
import { stubEntreprise, type AppEnv } from '../types.js';

/**
 * Routes entreprises — authentifiées, sans tenant sélectionné (on crée/liste avant de choisir).
 */
export const entreprises = new Hono<AppEnv>();

/** Liste les entreprises dont l'utilisateur courant est membre (+ son rôle). */
entreprises.get('/', async (c) => {
  const utilisateurId = c.get('utilisateurId');
  const res = await c.env.DB.prepare(
    `SELECT e.id, e.raison_sociale, e.niu, e.secteur, e.regime_fiscal, e.assujetti_tva, m.role
       FROM entreprise e
       JOIN membre_entreprise m ON m.entreprise_id = e.id
      WHERE m.utilisateur_id = ?
      ORDER BY e.raison_sociale`,
  )
    .bind(utilisateurId)
    .all();
  return c.json({ entreprises: res.results ?? [] });
});

const zCreationEntreprise = z.object({
  raisonSociale: z.string().trim().min(1, 'raisonSociale requise').max(160),
  secteur: z.enum(SECTEURS as unknown as [Secteur, ...Secteur[]]),
  natureActivite: z.enum(NATURE_ACTIVITE as unknown as [NatureActivite, ...NatureActivite[]]),
  niu: z.string().trim().max(32).nullish(),
});

/** Crée une entreprise : control plane (D1) puis initialisation de sa base dédiée (DO). */
entreprises.post('/', async (c) => {
  const utilisateurId = c.get('utilisateurId');
  const corps = zCreationEntreprise.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const { raisonSociale, secteur, natureActivite, niu } = corps.data;

  const annee = new Date().getUTCFullYear();
  const { entrepriseId, stmts } = planCreationEntreprise(c.env.DB, {
    raisonSociale, secteur, natureActivite, niu: niu ?? undefined, utilisateurId, annee,
  });

  await c.env.DB.batch(stmts); // control plane, atomique
  // Initialise la base dédiée de l'entreprise (modules, plan comptable, exercice).
  await stubEntreprise(c.env, entrepriseId).initialiser(entrepriseId, secteur, annee);

  return c.json({ entrepriseId }, 201);
});

const zParametres = z.object({
  niu: z.string().trim().max(32).nullish(),
  adherentCga: z.boolean().optional(),
  assujettiTva: z.boolean().optional(),
  noteFacture: z.string().trim().max(400).nullish(),
});

/**
 * Paramètres fiscaux de l'entreprise (NIU, adhésion CGA, assujettissement TVA) — jusqu'ici
 * jamais exposés en écriture après l'onboarding alors qu'ils pilotent l'IGS (CGA ÷ 2, spec
 * §6.2 : « fonctionnalité gratuite phare ») et l'éligibilité TVA. `regime_fiscal` reste hors de
 * cette route : un changement de régime ne doit jamais s'appliquer rétroactivement sans un
 * parcours de confirmation dédié (spec §1.1), pas un simple champ de formulaire.
 */
entreprises.patch('/:id', async (c) => {
  const entrepriseId = c.req.param('id');
  const role = await rolePourEntreprise(c.env.DB, c.get('utilisateurId'), entrepriseId);
  if (!role || !peut(role, 'entreprise:manage')) return c.json({ erreur: 'Accès refusé' }, 403);

  const corps = zParametres.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const p = corps.data;

  const champs: string[] = [];
  const valeurs: unknown[] = [];
  if (p.niu !== undefined) { champs.push('niu = ?'); valeurs.push(p.niu || null); }
  if (p.adherentCga !== undefined) { champs.push('adherent_cga = ?'); valeurs.push(p.adherentCga ? 1 : 0); }
  if (p.assujettiTva !== undefined) { champs.push('assujetti_tva = ?'); valeurs.push(p.assujettiTva ? 1 : 0); }
  if (p.noteFacture !== undefined) { champs.push('note_facture = ?'); valeurs.push(p.noteFacture || null); }
  if (!champs.length) return c.json({ erreur: 'Aucun champ à mettre à jour' }, 400);

  await c.env.DB.prepare(`UPDATE entreprise SET ${champs.join(', ')} WHERE id = ?`)
    .bind(...valeurs, entrepriseId)
    .run();
  return c.json({ ok: true });
});

/** Paramètres fiscaux actuels (pour pré-remplir l'écran Réglages). */
entreprises.get('/:id/parametres', async (c) => {
  const entrepriseId = c.req.param('id');
  const role = await rolePourEntreprise(c.env.DB, c.get('utilisateurId'), entrepriseId);
  if (!role) return c.json({ erreur: 'Accès refusé' }, 403);

  const ent = await c.env.DB.prepare(
    'SELECT raison_sociale, niu, secteur, nature_activite, regime_fiscal, adherent_cga, assujetti_tva, note_facture FROM entreprise WHERE id = ?',
  ).bind(entrepriseId).first();
  if (!ent) return c.json({ erreur: 'Entreprise introuvable' }, 404);
  return c.json(ent);
});

/**
 * Sauvegardes : une tâche planifiée (cron, `wrangler.toml`) exporte déjà chaque entreprise
 * quotidiennement vers R2. Ces routes exposent un déclenchement à la demande et la consultation
 * de l'historique — réservées à l'admin de SA PROPRE entreprise. La restauration n'est
 * volontairement PAS exposée ici (pas de rôle super-admin dans ce MVP) : voir
 * `EntrepriseDO.importerDonnees()` et le commentaire de `services/sauvegarde.ts`.
 */
entreprises.post('/:id/sauvegardes', async (c) => {
  const entrepriseId = c.req.param('id');
  const role = await rolePourEntreprise(c.env.DB, c.get('utilisateurId'), entrepriseId);
  if (!role || !peut(role, 'entreprise:manage')) return c.json({ erreur: 'Accès refusé' }, 403);

  const cle = await sauvegarderEntreprise(c.env, entrepriseId);
  return c.json({ cle }, 201);
});

entreprises.get('/:id/sauvegardes', async (c) => {
  const entrepriseId = c.req.param('id');
  const role = await rolePourEntreprise(c.env.DB, c.get('utilisateurId'), entrepriseId);
  if (!role || !peut(role, 'entreprise:manage')) return c.json({ erreur: 'Accès refusé' }, 403);

  const sauvegardes = await listerSauvegardes(c.env, entrepriseId);
  return c.json({ sauvegardes });
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

// ══════════════ Équipe : membres de l'entreprise (rôles) ══════════════

async function rolePourEntreprise(
  db: D1Database, utilisateurId: string, entrepriseId: string,
): Promise<RoleMembre | null> {
  const row = await db.prepare(
    'SELECT role FROM membre_entreprise WHERE utilisateur_id = ? AND entreprise_id = ?',
  )
    .bind(utilisateurId, entrepriseId)
    .first<{ role: RoleMembre }>();
  return row?.role ?? null;
}

/** Liste les membres de l'entreprise et leur rôle — réservé à qui gère l'équipe (admin). */
entreprises.get('/:id/membres', async (c) => {
  const entrepriseId = c.req.param('id');
  const role = await rolePourEntreprise(c.env.DB, c.get('utilisateurId'), entrepriseId);
  if (!role || !peut(role, 'membre:manage')) return c.json({ erreur: 'Accès refusé' }, 403);

  const res = await c.env.DB.prepare(
    `SELECT m.id, m.role, u.nom, u.email
       FROM membre_entreprise m JOIN utilisateur u ON u.id = m.utilisateur_id
      WHERE m.entreprise_id = ?
      ORDER BY u.nom`,
  )
    .bind(entrepriseId)
    .all();
  return c.json({ membres: res.results ?? [] });
});

const zAjoutMembre = z.object({
  email: z.string().trim().email('Email invalide'),
  role: z.enum(ROLE_MEMBRE),
});

/**
 * Ajoute un membre par email. L'utilisateur doit déjà avoir un compte Kombi (pas d'invitation
 * par email en MVP — voir docs/parcours.md, backlog « écran d'invitation »).
 */
entreprises.post('/:id/membres', async (c) => {
  const entrepriseId = c.req.param('id');
  const role = await rolePourEntreprise(c.env.DB, c.get('utilisateurId'), entrepriseId);
  if (!role || !peut(role, 'membre:manage')) return c.json({ erreur: 'Accès refusé' }, 403);

  const corps = zAjoutMembre.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);

  const utilisateur = await c.env.DB.prepare('SELECT id FROM utilisateur WHERE email = ?')
    .bind(corps.data.email)
    .first<{ id: string }>();
  if (!utilisateur) {
    return c.json({ erreur: "Cette personne doit d'abord créer un compte Kombi avec cet email" }, 404);
  }

  const dejaMembre = await c.env.DB.prepare(
    'SELECT 1 FROM membre_entreprise WHERE utilisateur_id = ? AND entreprise_id = ?',
  )
    .bind(utilisateur.id, entrepriseId)
    .first();
  if (dejaMembre) return c.json({ erreur: 'Cette personne fait déjà partie de l\'équipe' }, 409);

  await c.env.DB.prepare(
    'INSERT INTO membre_entreprise (id, utilisateur_id, entreprise_id, role) VALUES (?, ?, ?, ?)',
  )
    .bind(crypto.randomUUID(), utilisateur.id, entrepriseId, corps.data.role)
    .run();
  invaliderCache(cleCacheRole(utilisateur.id, entrepriseId));
  return c.json({ ok: true }, 201);
});

const zRole = z.object({ role: z.enum(ROLE_MEMBRE) });

/** Change le rôle d'un membre. */
entreprises.post('/:id/membres/:membreId/role', async (c) => {
  const entrepriseId = c.req.param('id');
  const role = await rolePourEntreprise(c.env.DB, c.get('utilisateurId'), entrepriseId);
  if (!role || !peut(role, 'membre:manage')) return c.json({ erreur: 'Accès refusé' }, 403);

  const corps = zRole.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);

  const membre = await c.env.DB.prepare('SELECT utilisateur_id FROM membre_entreprise WHERE id = ? AND entreprise_id = ?')
    .bind(c.req.param('membreId'), entrepriseId)
    .first<{ utilisateur_id: string }>();

  await c.env.DB.prepare('UPDATE membre_entreprise SET role = ? WHERE id = ? AND entreprise_id = ?')
    .bind(corps.data.role, c.req.param('membreId'), entrepriseId)
    .run();
  // Cache du rôle (audit infra 2026-09-03, point 7) : invalider pour que le changement soit pris
  // en compte immédiatement, sans attendre l'expiration du TTL (30s, voir middleware/tenant.ts).
  if (membre) invaliderCache(cleCacheRole(membre.utilisateur_id, entrepriseId));
  return c.json({ ok: true });
});

/** Retire un membre de l'équipe. */
entreprises.delete('/:id/membres/:membreId', async (c) => {
  const entrepriseId = c.req.param('id');
  const role = await rolePourEntreprise(c.env.DB, c.get('utilisateurId'), entrepriseId);
  if (!role || !peut(role, 'membre:manage')) return c.json({ erreur: 'Accès refusé' }, 403);

  const membre = await c.env.DB.prepare('SELECT utilisateur_id FROM membre_entreprise WHERE id = ? AND entreprise_id = ?')
    .bind(c.req.param('membreId'), entrepriseId)
    .first<{ utilisateur_id: string }>();

  await c.env.DB.prepare('DELETE FROM membre_entreprise WHERE id = ? AND entreprise_id = ?')
    .bind(c.req.param('membreId'), entrepriseId)
    .run();
  // Un accès retiré doit cesser immédiatement, pas rester actif jusqu'à expiration du cache.
  if (membre) invaliderCache(cleCacheRole(membre.utilisateur_id, entrepriseId));
  return c.json({ ok: true });
});
