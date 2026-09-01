import { createMiddleware } from 'hono/factory';
import { peut, type Permission } from '@kombi/shared';
import type { AppEnv } from '../types.js';

/** Refuse la requête si le rôle courant n'a pas la permission. À placer après `tenant`. */
export function requirePermission(permission: Permission) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const role = c.get('role');
    if (!role || !peut(role, permission)) {
      return c.json({ erreur: `Permission « ${permission} » refusée pour le rôle « ${role} »` }, 403);
    }
    await next();
  });
}
