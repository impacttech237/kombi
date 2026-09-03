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

/** Total des dépenses du jour (tableau de bord). */
depenses.get('/jour', requirePermission('depense:read'), async (c) => {
  const total = await stubEntreprise(c.env, c.get('entrepriseId')).depensesDuJour();
  return c.json({ total });
});

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

// ── Pièce justificative (photo/scan d'un reçu ou d'une facture fournisseur) ──
// Fichier stocké dans R2 (bucket DOCS, jusqu'ici inutilisé) ; seule la clé est gardée côté DO
// (voir migration v11, schema.ts). L'OCR (extraction de texte) tourne côté navigateur
// (Tesseract.js, apps/web) — le serveur ne stocke que le fichier tel quel, pas de texte extrait.
const TYPES_PIECE_AUTORISES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const TAILLE_PIECE_MAX = 10 * 1024 * 1024; // 10 Mo

function extensionPour(contentType: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[contentType] ?? 'bin';
}

depenses.post('/:id/piece', requirePermission('depense:manage'), async (c) => {
  const contentType = c.req.header('content-type') ?? '';
  if (!TYPES_PIECE_AUTORISES.has(contentType)) {
    return c.json({ erreur: 'Type de fichier non supporté (image JPEG/PNG/WebP ou PDF uniquement)' }, 415);
  }
  const corps = await c.req.arrayBuffer();
  if (corps.byteLength === 0) return c.json({ erreur: 'Fichier vide' }, 400);
  if (corps.byteLength > TAILLE_PIECE_MAX) return c.json({ erreur: 'Fichier trop volumineux (10 Mo max)' }, 413);

  const entrepriseId = c.get('entrepriseId');
  const depenseId = c.req.param('id');
  const stub = stubEntreprise(c.env, entrepriseId);
  // Valide l'existence de la dépense AVANT d'écrire dans R2 — évite un fichier orphelin si l'id est invalide.
  if (!(await stub.depenseExiste(depenseId))) return c.json({ erreur: 'Dépense introuvable' }, 404);
  const ancienneCle = await stub.getPieceDepense(depenseId);

  const cle = `pieces/${entrepriseId}/depense-${depenseId}-${Date.now()}.${extensionPour(contentType)}`;
  await c.env.DOCS.put(cle, corps, { httpMetadata: { contentType } });
  await stub.attacherPieceDepense(depenseId, cle);
  if (ancienneCle) await c.env.DOCS.delete(ancienneCle); // remplace, ne laisse pas de fichier orphelin

  return c.json({ cle }, 201);
});

depenses.get('/:id/piece', requirePermission('depense:read'), async (c) => {
  const cle = await stubEntreprise(c.env, c.get('entrepriseId')).getPieceDepense(c.req.param('id'));
  if (!cle) return c.json({ erreur: 'Aucune pièce jointe pour cette dépense' }, 404);

  const objet = await c.env.DOCS.get(cle);
  if (!objet) return c.json({ erreur: 'Pièce introuvable (fichier manquant)' }, 404);

  return new Response(objet.body, {
    headers: { 'content-type': objet.httpMetadata?.contentType ?? 'application/octet-stream' },
  });
});

depenses.delete('/:id/piece', requirePermission('depense:manage'), async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const depenseId = c.req.param('id');
  const stub = stubEntreprise(c.env, entrepriseId);
  const cle = await stub.getPieceDepense(depenseId);
  if (cle) {
    await c.env.DOCS.delete(cle);
    await stub.attacherPieceDepense(depenseId, null);
  }
  return c.json({ ok: true });
});
