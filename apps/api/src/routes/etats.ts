import { Hono } from 'hono';
import { z } from 'zod';
import { messageErreurZod } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv } from '../types.js';

export const etats = new Hono<AppEnv>();

/** Compte de résultat + bilan de l'entreprise (couche comptable, consultation). */
etats.get('/', requirePermission('compta:read'), async (c) => {
  const e = await stubEntreprise(c.env, c.get('entrepriseId')).etatsFinanciers();
  return c.json(e);
});

/** Trésorerie du jour par mode (espèces, MTN MoMo, Orange Money, banque) — tableau de bord. */
etats.get('/tresorerie-jour', requirePermission('compta:read'), async (c) => {
  const t = await stubEntreprise(c.env, c.get('entrepriseId')).tresorerieDuJour();
  return c.json(t);
});

/** Soldes réels de trésorerie par mode (cumul depuis l'ouverture de l'exercice) — écran Trésorerie. */
etats.get('/tresorerie-solde', requirePermission('compta:read'), async (c) => {
  const t = await stubEntreprise(c.env, c.get('entrepriseId')).soldesTresorerie();
  return c.json(t);
});

/** Journal d'audit immuable : entrées + preuve d'intégrité de la chaîne de hash. */
etats.get('/audit', requirePermission('audit:read'), async (c) => {
  const e = stubEntreprise(c.env, c.get('entrepriseId'));
  const [entrees, integrite] = await Promise.all([e.listerAuditLog(), e.verifierChaineAudit()]);
  return c.json({ entrees, integrite });
});

// ── Rapprochement de trésorerie (D18) — solde déclaré vs calculé, écart gardé ──
const zPointage = z.object({
  compte: z.enum(['especes', 'mtnMomo', 'orangeMoney', 'banque']),
  soldeDeclare: z.number().int(),
});

etats.get('/pointages', requirePermission('compta:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerPointages();
  return c.json({ pointages: liste });
});

etats.post('/pointages', requirePermission('compta:read'), async (c) => {
  const corps = zPointage.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  const res = await stubEntreprise(c.env, c.get('entrepriseId')).enregistrerPointage(
    corps.data.compte, corps.data.soldeDeclare, { utilisateurId: c.get('utilisateurId'), role: c.get('role') },
  );
  return c.json(res, 201);
});

// ── Clôture mensuelle verrouillable (D18) ──
const zAnneeMois = z.object({ anneeMois: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM') });

etats.get('/clotures', requirePermission('compta:read'), async (c) => {
  const liste = await stubEntreprise(c.env, c.get('entrepriseId')).listerClotures();
  return c.json({ clotures: liste });
});

etats.post('/clotures', requirePermission('compta:read'), async (c) => {
  const corps = zAnneeMois.safeParse(await c.req.json().catch(() => null));
  if (!corps.success) return c.json({ erreur: messageErreurZod(corps.error) }, 400);
  await stubEntreprise(c.env, c.get('entrepriseId')).cloturerMois(
    corps.data.anneeMois, { utilisateurId: c.get('utilisateurId'), role: c.get('role') },
  );
  return c.json({ ok: true }, 201);
});

etats.delete('/clotures/:anneeMois', requirePermission('compta:read'), async (c) => {
  await stubEntreprise(c.env, c.get('entrepriseId')).rouvrirMois(
    c.req.param('anneeMois'), { utilisateurId: c.get('utilisateurId'), role: c.get('role') },
  );
  return c.json({ ok: true });
});
