import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types.js';
import { tenant } from './middleware/tenant.js';
import { fiscalite } from './routes/fiscalite.js';

const app = new Hono<AppEnv>();

app.use('*', cors());

app.get('/', (c) => c.json({ service: 'compta-api', statut: 'ok' }));
app.get('/health', (c) => c.json({ ok: true }));

// TODO(auth): middleware better-auth posant c.set('utilisateurId', ...) avant /api/*.
// Placeholder de dev : lit x-utilisateur-id (à REMPLACER par la vraie auth).
app.use('/api/*', async (c, next) => {
  const dev = c.req.header('x-utilisateur-id');
  if (dev) c.set('utilisateurId', dev);
  await next();
});

// Routes métier — protégées par l'isolation multi-entreprises.
app.use('/api/*', tenant);
app.route('/api/fiscalite', fiscalite);

export default app;
