import { createMiddleware } from 'hono/factory';
import { creerAuth } from '../auth/auth.js';
import { avecCacheTTL } from '../lib/cache-isolate.js';
import type { AppEnv } from '../types.js';

/**
 * Valide la session better-auth et résout l'utilisateur métier.
 * Pose `utilisateurId` (id du profil `utilisateur`, lié à user.id par auth_id).
 * Crée le profil métier au premier accès s'il n'existe pas encore (bridge auth → domaine).
 */
export const authentifier = createMiddleware<AppEnv>(async (c, next) => {
  const auth = creerAuth(c.env.DB, c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return c.json({ erreur: 'Non authentifié' }, 401);

  const authUser = session.user;
  // Le lien auth_id → profil utilisateur ne change jamais une fois créé (audit infra
  // 2026-09-03, point 7) : sûr à mettre en cache plus longtemps que le rôle (voir tenant.ts).
  const utilisateurId = await avecCacheTTL(`profil:${authUser.id}`, 5 * 60_000, async () => {
    const profil = await c.env.DB.prepare('SELECT id FROM utilisateur WHERE auth_id = ?')
      .bind(authUser.id)
      .first<{ id: string }>();
    if (profil) return profil.id;

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO utilisateur (id, email, nom, auth_id) VALUES (?, ?, ?, ?)',
    )
      .bind(id, authUser.email, authUser.name ?? authUser.email, authUser.id)
      .run();
    return id;
  });

  c.set('utilisateurId', utilisateurId);
  await next();
});
