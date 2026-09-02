import { Hono } from 'hono';
import { stubEntreprise, regimeFiscalDe, type AppEnv } from '../types.js';

export const notifications = new Hono<AppEnv>();

/** Cloche in-app : factures en retard/à échéance proche, stock bas/rupture, échéance IGS. */
notifications.get('/', async (c) => {
  const entrepriseId = c.get('entrepriseId');
  const regimeFiscal = await regimeFiscalDe(c.env, entrepriseId);
  const liste = await stubEntreprise(c.env, entrepriseId).notificationsActives(regimeFiscal);
  return c.json({ notifications: liste });
});
