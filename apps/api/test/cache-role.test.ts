import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

/**
 * Vérifie le cache TTL du rôle (audit infra 2026-09-03, point 7 — soulager D1 de la lecture
 * répétée de membre_entreprise) n'introduit PAS de fenêtre où un accès révoqué resterait actif :
 * l'invalidation ciblée dans entreprises.ts doit prendre effet immédiatement, sans attendre les
 * 30s de TTL (voir middleware/tenant.ts).
 */

async function inscrire(email: string, ip: string) {
  const res = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password: 'motdepasse123', name: 'Test' }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  await SELF.fetch('http://localhost/api/entreprises', { headers: { cookie } });
  return cookie;
}

async function creerEntreprise(cookie: string, raisonSociale: string) {
  const res = await SELF.fetch('http://localhost/api/entreprises', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ raisonSociale, secteur: 'commerce', natureActivite: 'negoce' }),
  });
  const { entrepriseId } = await res.json<{ entrepriseId: string }>();
  return entrepriseId;
}

describe('Cache TTL du rôle (middleware/tenant.ts) — invalidation immédiate', () => {
  it('un membre retiré perd l\'accès immédiatement, pas après expiration du TTL', async () => {
    const cookieAdmin = await inscrire('patron-cache@equipe.cm', '198.51.100.20');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Cache');
    const cookieRecrue = await inscrire('caissier-cache@equipe.cm', '198.51.100.21');

    const ajout = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'caissier-cache@equipe.cm', role: 'caissier' }),
    });
    expect(ajout.status).toBe(201);

    const { membres } = await (await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      headers: { cookie: cookieAdmin },
    })).json<{ membres: { id: string; email: string }[] }>();
    const recrue = membres.find((m) => m.email === 'caissier-cache@equipe.cm')!;

    // Réchauffe le cache du rôle pour ce couple (utilisateur, entreprise) — la route vente:read
    // passe par le middleware `tenant` (contrairement aux routes /api/entreprises/*).
    const avant = await SELF.fetch('http://localhost/api/ventes/recentes', {
      headers: { cookie: cookieRecrue, 'x-entreprise-id': entrepriseId },
    });
    expect(avant.status).toBe(200);

    const retrait = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres/${recrue.id}`, {
      method: 'DELETE', headers: { cookie: cookieAdmin },
    });
    expect(retrait.status).toBe(200);

    // Sans invalidation, le cache (TTL 30s) laisserait cet appel réussir malgré le retrait.
    const apres = await SELF.fetch('http://localhost/api/ventes/recentes', {
      headers: { cookie: cookieRecrue, 'x-entreprise-id': entrepriseId },
    });
    expect(apres.status).toBe(403);
  });

  it('un changement de rôle est pris en compte immédiatement (pas l\'ancien rôle mis en cache)', async () => {
    const cookieAdmin = await inscrire('patron-cache2@equipe.cm', '198.51.100.22');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Cache 2');
    const cookieRecrue = await inscrire('employe-cache@equipe.cm', '198.51.100.23');

    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'employe-cache@equipe.cm', role: 'employe' }),
    });
    const { membres } = await (await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      headers: { cookie: cookieAdmin },
    })).json<{ membres: { id: string; email: string }[] }>();
    const recrue = membres.find((m) => m.email === 'employe-cache@equipe.cm')!;

    // `employe` n'a pas `vente:read` (voir authz.ts) — réchauffe le cache sur un 403 attendu.
    const avant = await SELF.fetch('http://localhost/api/ventes/recentes', {
      headers: { cookie: cookieRecrue, 'x-entreprise-id': entrepriseId },
    });
    expect(avant.status).toBe(403);

    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres/${recrue.id}/role`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ role: 'caissier' }), // caissier a vente:read
    });

    const apres = await SELF.fetch('http://localhost/api/ventes/recentes', {
      headers: { cookie: cookieRecrue, 'x-entreprise-id': entrepriseId },
    });
    expect(apres.status).toBe(200);
  });
});
