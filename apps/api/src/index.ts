import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types.js';
import { creerAuth } from './auth/auth.js';
import { authentifier } from './middleware/auth.js';
import { tenant } from './middleware/tenant.js';
import { requireModule } from './middleware/module.js';
import { entreprises } from './routes/entreprises.js';
import { fiscalite } from './routes/fiscalite.js';
import { ventes } from './routes/ventes.js';
import { produits } from './routes/produits.js';
import { tiers } from './routes/tiers.js';
import { factures } from './routes/factures.js';
import { commandes } from './routes/commandes.js';

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

app.use('/api/ventes/*', authentifier, tenant, requireModule('ventes'));
app.route('/api/ventes', ventes);

app.use('/api/produits/*', authentifier, tenant, requireModule('stock'));
app.route('/api/produits', produits);

app.use('/api/tiers/*', authentifier, tenant, requireModule('tiers'));
app.route('/api/tiers', tiers);

app.use('/api/factures/*', authentifier, tenant, requireModule('facturation'));
app.route('/api/factures', factures);

app.use('/api/commandes/*', authentifier, tenant, requireModule('commandes'));
app.route('/api/commandes', commandes);

export default app;

// Durable Object : 1 base par entreprise (D13).
export { EntrepriseDO } from './do/entreprise-do.js';
