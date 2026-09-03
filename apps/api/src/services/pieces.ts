/**
 * Pièce justificative (photo/scan ou PDF) attachable à une dépense, un achat fournisseur ou une
 * vente à crédit — même mécanique partout : fichier dans R2 (bucket DOCS), seule la clé de
 * l'objet est gardée côté DO. Factorisé ici pour éviter de dupliquer l'upload/lecture/suppression
 * dans chaque route (voir routes/depenses.ts, routes/achats.ts, routes/ventes.ts).
 */
import type { Hono } from 'hono';
import type { Permission } from '@kombi/shared';
import { requirePermission } from '../middleware/permission.js';
import { stubEntreprise, type AppEnv, type Bindings } from '../types.js';

const TYPES_PIECE_AUTORISES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const TAILLE_PIECE_MAX = 10 * 1024 * 1024; // 10 Mo

function extensionPour(contentType: string): string {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[contentType] ?? 'bin';
}

type Stub = ReturnType<typeof stubEntreprise>;

interface RoutesPieceOptions {
  /** Préfixe de la clé R2 (ex. 'depense', 'achat', 'vente') — juste pour retrouver l'origine à l'œil dans le bucket. */
  segment: string;
  permissionLire: Permission;
  permissionGerer: Permission;
  introuvable: string;
  existe(stub: Stub, id: string): Promise<boolean>;
  attacher(stub: Stub, id: string, cle: string | null): Promise<void>;
  lireCle(stub: Stub, id: string): Promise<string | null>;
}

/** Monte POST/GET/DELETE /:id/piece sur `router`. */
export function monterRoutesPiece(router: Hono<AppEnv>, opts: RoutesPieceOptions): void {
  router.post('/:id/piece', requirePermission(opts.permissionGerer), async (c) => {
    const contentType = c.req.header('content-type') ?? '';
    if (!TYPES_PIECE_AUTORISES.has(contentType)) {
      return c.json({ erreur: 'Type de fichier non supporté (image JPEG/PNG/WebP ou PDF uniquement)' }, 415);
    }
    const corps = await c.req.arrayBuffer();
    if (corps.byteLength === 0) return c.json({ erreur: 'Fichier vide' }, 400);
    if (corps.byteLength > TAILLE_PIECE_MAX) return c.json({ erreur: 'Fichier trop volumineux (10 Mo max)' }, 413);

    const entrepriseId = c.get('entrepriseId');
    const id = c.req.param('id');
    const stub = stubEntreprise(c.env as Bindings, entrepriseId);
    // Valide l'existence de l'entité AVANT d'écrire dans R2 — évite un fichier orphelin si l'id est invalide.
    if (!(await opts.existe(stub, id))) return c.json({ erreur: opts.introuvable }, 404);
    const ancienneCle = await opts.lireCle(stub, id);

    const cle = `pieces/${entrepriseId}/${opts.segment}-${id}-${Date.now()}.${extensionPour(contentType)}`;
    await c.env.DOCS.put(cle, corps, { httpMetadata: { contentType } });
    await opts.attacher(stub, id, cle);
    if (ancienneCle) await c.env.DOCS.delete(ancienneCle); // remplace, ne laisse pas de fichier orphelin

    return c.json({ cle }, 201);
  });

  router.get('/:id/piece', requirePermission(opts.permissionLire), async (c) => {
    const stub = stubEntreprise(c.env as Bindings, c.get('entrepriseId'));
    const cle = await opts.lireCle(stub, c.req.param('id'));
    if (!cle) return c.json({ erreur: 'Aucune pièce jointe' }, 404);

    const objet = await c.env.DOCS.get(cle);
    if (!objet) return c.json({ erreur: 'Pièce introuvable (fichier manquant)' }, 404);

    return new Response(objet.body, {
      headers: { 'content-type': objet.httpMetadata?.contentType ?? 'application/octet-stream' },
    });
  });

  router.delete('/:id/piece', requirePermission(opts.permissionGerer), async (c) => {
    const stub = stubEntreprise(c.env as Bindings, c.get('entrepriseId'));
    const id = c.req.param('id');
    const cle = await opts.lireCle(stub, id);
    if (cle) {
      await c.env.DOCS.delete(cle);
      await opts.attacher(stub, id, null);
    }
    return c.json({ ok: true });
  });
}
