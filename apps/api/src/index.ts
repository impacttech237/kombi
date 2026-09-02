import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './types.js';
import { creerAuth } from './auth/auth.js';
import { authentifier } from './middleware/auth.js';
import { tenant } from './middleware/tenant.js';
import { requireModule } from './middleware/module.js';
import { requirePermission } from './middleware/permission.js';
import { limiterDebit } from './middleware/rate-limit.js';
import { origenesConfiance } from './lib/origins.js';
import { entreprises } from './routes/entreprises.js';
import { fiscalite } from './routes/fiscalite.js';
import { ventes } from './routes/ventes.js';
import { produits } from './routes/produits.js';
import { achats } from './routes/achats.js';
import { tiers } from './routes/tiers.js';
import { factures } from './routes/factures.js';
import { commandes } from './routes/commandes.js';
import { depenses } from './routes/depenses.js';
import { abonnement } from './routes/abonnement.js';
import { etats } from './routes/etats.js';

const app = new Hono<AppEnv>();

// CORS restreint aux origines de confiance (même liste que better-auth) — jamais de reflet ouvert.
app.use('*', (c, next) =>
  cors({
    origin: (origin) => (origenesConfiance(c.env).includes(origin) ? origin : undefined),
    credentials: true,
  })(c, next),
);

app.get('/health', (c) => c.json({ ok: true, service: 'kombi-api' }));

// ── Auth better-auth : /api/auth/** (inscription, connexion, session…) ──
// Les mutations (connexion, inscription…) sont freinées contre le brute-force ; les lectures
// (session courante) ne le sont pas, car appelées à chaque chargement de page.
app.on('POST', '/api/auth/*', limiterDebit({ limite: 10, fenetreSecondes: 60, prefixe: 'auth' }),
  (c) => creerAuth(c.env.DB, c.env).handler(c.req.raw));
app.on('GET', '/api/auth/*', (c) => creerAuth(c.env.DB, c.env).handler(c.req.raw));

// ── Entreprises : authentifié, sans tenant (on crée/liste avant de choisir) ──
app.use('/api/entreprises/*', authentifier);
app.use('/api/entreprises', authentifier);
app.route('/api/entreprises', entreprises);

// ── Routes métier : authentifié + tenant (isolation multi-entreprises) ──
app.use('/api/fiscalite/*', authentifier, tenant, requirePermission('compta:read'));
app.route('/api/fiscalite', fiscalite);

app.use('/api/ventes/*', authentifier, tenant, requireModule('ventes'));
app.route('/api/ventes', ventes);

app.use('/api/produits/*', authentifier, tenant, requireModule('stock'));
app.route('/api/produits', produits);

app.use('/api/achats/*', authentifier, tenant, requireModule('achats'));
app.route('/api/achats', achats);

app.use('/api/tiers/*', authentifier, tenant, requireModule('tiers'));
app.route('/api/tiers', tiers);

app.use('/api/factures/*', authentifier, tenant, requireModule('facturation'));
app.route('/api/factures', factures);

app.use('/api/commandes/*', authentifier, tenant, requireModule('commandes'));
app.route('/api/commandes', commandes);

app.use('/api/depenses/*', authentifier, tenant, requireModule('depenses'));
app.route('/api/depenses', depenses);

app.use('/api/etats/*', authentifier, tenant, requireModule('comptabilite'));
app.route('/api/etats', etats);

app.use('/api/abonnement/*', authentifier, tenant);
app.use('/api/abonnement', authentifier, tenant);
app.route('/api/abonnement', abonnement);

// Tout le reste (hors /api) = la PWA servie depuis le même Worker (même origine → cookies OK).
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

// Durable Object : 1 base par entreprise (D13).
export { EntrepriseDO } from './do/entreprise-do.js';
