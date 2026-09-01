import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types.js';
import { creerAuth } from './auth/auth.js';
import { authentifier } from './middleware/auth.js';
import { tenant } from './middleware/tenant.js';
import { entreprises } from './routes/entreprises.js';
import { fiscalite } from './routes/fiscalite.js';

const app = new Hono<AppEnv>();

app.use('*', cors({ origin: (o) => o, credentials: true }));

app.get('/', (c) => c.json({ service: 'kombi-api', statut: 'ok' }));
app.get('/health', (c) => c.json({ ok: true }));

// ── Auth better-auth : /api/auth/** (inscription, connexion, session…) ──
app.on(['GET', 'POST'], '/api/auth/*', (c) => creerAuth(c.env.DB, c.env).handler(c.req.raw));

// ── Entreprises : authentifié, sans tenant (on crée/liste avant de choisir) ──
app.use('/api/entreprises/*', authentifier);
app.use('/api/entreprises', authentifier);
app.route('/api/entreprises', entreprises);

// ── Routes métier : authentifié + tenant (isolation multi-entreprises) ──
app.use('/api/fiscalite/*', authentifier, tenant);
app.route('/api/fiscalite', fiscalite);

export default app;

// Durable Object : 1 base par entreprise (D13).
export { EntrepriseDO } from './do/entreprise-do.js';
