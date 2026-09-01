import { env, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { planCreationEntreprise } from '../src/services/onboarding.js';
import { TenantDb } from '../src/db/scoped.js';

const uid = () => crypto.randomUUID();

async function creerUtilisateur(nom: string): Promise<string> {
  const id = uid();
  await env.DB.prepare('INSERT INTO utilisateur (id, email, nom) VALUES (?, ?, ?)')
    .bind(id, `${id}@test.cm`, nom)
    .run();
  return id;
}

describe('Onboarding sectoriel', () => {
  it('un commerce active le module stock ; un service ne l\'active pas', async () => {
    const u = await creerUtilisateur('Commerçante');
    const commerce = planCreationEntreprise(env.DB, {
      raisonSociale: 'Boutique A', secteur: 'commerce', natureActivite: 'negoce',
      utilisateurId: u, annee: 2026,
    });
    await env.DB.batch(commerce.stmts);
    const service = planCreationEntreprise(env.DB, {
      raisonSociale: 'Cabinet B', secteur: 'service', natureActivite: 'liberale',
      utilisateurId: u, annee: 2026,
    });
    await env.DB.batch(service.stmts);

    const stockCommerce = await env.DB.prepare(
      "SELECT actif FROM module_entreprise WHERE entreprise_id=? AND code_module='stock'",
    ).bind(commerce.entrepriseId).first<{ actif: number }>();
    const stockService = await env.DB.prepare(
      "SELECT actif FROM module_entreprise WHERE entreprise_id=? AND code_module='stock'",
    ).bind(service.entrepriseId).first<{ actif: number }>();

    expect(stockCommerce?.actif).toBe(1);
    expect(stockService?.actif).toBe(0);

    // Plan comptable seedé
    const nbComptes = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM compte_comptable WHERE entreprise_id=?',
    ).bind(commerce.entrepriseId).first<{ n: number }>();
    expect(nbComptes!.n).toBeGreaterThan(10);
  });
});

describe('Isolation multi-entreprises (sharding = entreprise_id)', () => {
  it('TenantDb ne retourne jamais les données d\'une autre entreprise', async () => {
    const u = await creerUtilisateur('Dupont');
    const a = planCreationEntreprise(env.DB, {
      raisonSociale: 'Ese A', secteur: 'commerce', natureActivite: 'negoce', utilisateurId: u, annee: 2026,
    });
    const b = planCreationEntreprise(env.DB, {
      raisonSociale: 'Ese B', secteur: 'commerce', natureActivite: 'negoce', utilisateurId: u, annee: 2026,
    });
    await env.DB.batch(a.stmts);
    await env.DB.batch(b.stmts);

    // Un tiers dans chaque entreprise
    await new TenantDb(env.DB, a.entrepriseId).insert('tiers', { id: uid(), nom: 'Client A', type: 'client' });
    await new TenantDb(env.DB, b.entrepriseId).insert('tiers', { id: uid(), nom: 'Client B', type: 'client' });

    const vusParA = await new TenantDb(env.DB, a.entrepriseId).list<{ nom: string }>('tiers');
    expect(vusParA).toHaveLength(1);
    expect(vusParA[0]!.nom).toBe('Client A');
    // A ne voit jamais "Client B"
    expect(vusParA.some((t) => t.nom === 'Client B')).toBe(false);
  });
});

describe('Auth end-to-end (better-auth)', () => {
  beforeEach(async () => {
    // isolation de storage par test assurée par le pool ; rien à nettoyer
  });

  it('refuse l\'accès aux routes protégées sans session', async () => {
    const res = await SELF.fetch('http://localhost/api/entreprises');
    expect(res.status).toBe(401);
  });

  it('inscription puis accès authentifié à /api/entreprises', async () => {
    const signup = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'patron@pme.cm', password: 'motdepasse123', name: 'Patron' }),
    });
    expect([200, 201]).toContain(signup.status);
    const cookie = signup.headers.get('set-cookie');
    expect(cookie).toBeTruthy();

    const res = await SELF.fetch('http://localhost/api/entreprises', {
      headers: { cookie: cookie!.split(';')[0]! },
    });
    expect(res.status).toBe(200);
    const data = await res.json<{ entreprises: unknown[] }>();
    expect(Array.isArray(data.entreprises)).toBe(true);
  });
});
