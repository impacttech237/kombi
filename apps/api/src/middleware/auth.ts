import { createMiddleware } from 'hono/factory';
import { creerAuth } from '../auth/auth.js';
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
  let profil = await c.env.DB.prepare('SELECT id FROM utilisateur WHERE auth_id = ?')
    .bind(authUser.id)
    .first<{ id: string }>();

  if (!profil) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      'INSERT INTO utilisateur (id, email, nom, auth_id) VALUES (?, ?, ?, ?)',
    )
      .bind(id, authUser.email, authUser.name ?? authUser.email, authUser.id)
      .run();
    profil = { id };
  }

  c.set('utilisateurId', profil.id);
  await next();
});
