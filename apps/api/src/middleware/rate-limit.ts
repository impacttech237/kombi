import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../types.js';

/**
 * Rate limiting fenêtre fixe basé sur D1 (pas de binding externe requis) : limite le nombre
 * de requêtes par clé (IP) sur une fenêtre glissante. Suffisant pour freiner le brute-force
 * sur l'authentification ; pas destiné à absorber un DDoS volumétrique (Cloudflare s'en charge).
 */
export function limiterDebit(opts: { limite: number; fenetreSecondes: number; prefixe: string }) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'inconnu';
    const cle = `${opts.prefixe}:${ip}`;
    const maintenant = Date.now();

    // UPSERT atomique en un seul statement SQLite : lecture + incrément dans la même opération,
    // pas de fenêtre lecture-puis-écriture exploitable par des requêtes concurrentes (contrairement
    // à un SELECT suivi d'un UPDATE séparés).
    const { results } = await c.env.DB.prepare(
      `INSERT INTO rate_limit (cle, compteur, fenetre_debut) VALUES (?, 1, ?)
       ON CONFLICT(cle) DO UPDATE SET
         compteur = CASE WHEN (unixepoch() - unixepoch(fenetre_debut)) > ? THEN 1 ELSE compteur + 1 END,
         fenetre_debut = CASE WHEN (unixepoch() - unixepoch(fenetre_debut)) > ? THEN excluded.fenetre_debut ELSE fenetre_debut END
       RETURNING compteur`,
    )
      .bind(cle, new Date(maintenant).toISOString(), opts.fenetreSecondes, opts.fenetreSecondes)
      .all<{ compteur: number }>();

    const compteur = results[0]?.compteur ?? 1;
    if (compteur > opts.limite) {
      return c.json({ erreur: 'Trop de tentatives, réessayez dans quelques minutes' }, 429);
    }

    await next();
  });
}
