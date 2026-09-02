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

    const row = await c.env.DB.prepare('SELECT compteur, fenetre_debut FROM rate_limit WHERE cle = ?')
      .bind(cle)
      .first<{ compteur: number; fenetre_debut: string }>();

    const fenetreExpiree = !row || maintenant - Date.parse(row.fenetre_debut) > opts.fenetreSecondes * 1000;
    if (fenetreExpiree) {
      await c.env.DB.prepare(
        `INSERT INTO rate_limit (cle, compteur, fenetre_debut) VALUES (?, 1, ?)
         ON CONFLICT(cle) DO UPDATE SET compteur = 1, fenetre_debut = excluded.fenetre_debut`,
      )
        .bind(cle, new Date(maintenant).toISOString())
        .run();
      return next();
    }

    if (row.compteur >= opts.limite) {
      return c.json({ erreur: 'Trop de tentatives, réessayez dans quelques minutes' }, 429);
    }

    await c.env.DB.prepare('UPDATE rate_limit SET compteur = compteur + 1 WHERE cle = ?').bind(cle).run();
    await next();
  });
}
