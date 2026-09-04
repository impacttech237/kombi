import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

async function inscrire(email: string) {
  const res = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'motdepasse123', name: 'Test' }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  await SELF.fetch('http://localhost/api/entreprises', { headers: { cookie } });
  return cookie;
}

async function creerEntreprise(cookie: string, raisonSociale: string) {
  const res = await SELF.fetch('http://localhost/api/entreprises', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ raisonSociale, secteur: 'commerce', natureActivite: 'negoce' }),
  });
  const { entrepriseId } = await res.json<{ entrepriseId: string }>();
  return entrepriseId;
}

describe('Budgets — protégés par budget:read / budget:manage', () => {
  it('un comptable peut lire un budget mais pas le définir ; un gérant peut les deux', async () => {
    const cookieAdmin = await inscrire('admin-budget@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Budget Perms');

    const definir = await SELF.fetch(`http://localhost/api/budgets/2026-09`, {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieAdmin, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({ caCible: 500000, plafondDepenses: 100000 }),
    });
    expect(definir.status).toBe(200);

    const cookieComptable = await inscrire('comptable-budget@test.cm');
    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'comptable-budget@test.cm', role: 'comptable' }),
    });

    const lireComptable = await SELF.fetch(`http://localhost/api/budgets/2026-09`, {
      headers: { cookie: cookieComptable, 'x-entreprise-id': entrepriseId },
    });
    expect(lireComptable.status).toBe(200);

    const definirComptable = await SELF.fetch(`http://localhost/api/budgets/2026-10`, {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieComptable, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({ caCible: 400000 }),
    });
    expect(definirComptable.status).toBe(403);
  });

  it('un caissier n\'a accès à aucune route budget', async () => {
    const cookieAdmin = await inscrire('admin-budget-2@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Budget Perms 2');
    const cookieCaissier = await inscrire('caissier-budget@test.cm');
    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'caissier-budget@test.cm', role: 'caissier' }),
    });
    const refuse = await SELF.fetch(`http://localhost/api/budgets/previsions?horizon=30`, {
      headers: { cookie: cookieCaissier, 'x-entreprise-id': entrepriseId },
    });
    expect(refuse.status).toBe(403);
  });

  it('rejette un format de mois invalide (400, pas une exception serveur)', async () => {
    const cookieAdmin = await inscrire('admin-budget-3@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Budget Format');
    const res = await SELF.fetch(`http://localhost/api/budgets/septembre-2026`, {
      method: 'PUT', headers: { 'content-type': 'application/json', cookie: cookieAdmin, 'x-entreprise-id': entrepriseId },
      body: JSON.stringify({ caCible: 1000 }),
    });
    expect(res.status).toBe(400);
  });

  it('la prévision de trésorerie et le seuil de rentabilité répondent 200', async () => {
    const cookieAdmin = await inscrire('admin-budget-4@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Budget Prévisions');
    const prevision = await SELF.fetch(`http://localhost/api/budgets/previsions?horizon=90`, {
      headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId },
    });
    expect(prevision.status).toBe(200);
    const seuil = await SELF.fetch(`http://localhost/api/budgets/seuil-rentabilite`, {
      headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId },
    });
    expect(seuil.status).toBe(200);
    const simulation = await SELF.fetch(`http://localhost/api/budgets/simulation?type=baisse_ventes&pct=10`, {
      headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId },
    });
    expect(simulation.status).toBe(200);
  });
});
