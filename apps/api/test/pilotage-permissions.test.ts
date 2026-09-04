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

describe('Cockpit dirigeant — protégé par compta:read', () => {
  it('un caissier n\'accède ni au cockpit ni à la marge par produit ; un admin oui', async () => {
    const cookieAdmin = await inscrire('admin-pilotage@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Pilotage Perms');

    const okCockpit = await SELF.fetch('http://localhost/api/pilotage/cockpit', {
      headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId },
    });
    expect(okCockpit.status).toBe(200);
    const okMarge = await SELF.fetch('http://localhost/api/pilotage/marge-produits', {
      headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId },
    });
    expect(okMarge.status).toBe(200);

    const cookieCaissier = await inscrire('caissier-pilotage@test.cm');
    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'caissier-pilotage@test.cm', role: 'caissier' }),
    });

    const refuseCockpit = await SELF.fetch('http://localhost/api/pilotage/cockpit', {
      headers: { cookie: cookieCaissier, 'x-entreprise-id': entrepriseId },
    });
    expect(refuseCockpit.status).toBe(403);
    const refuseMarge = await SELF.fetch('http://localhost/api/pilotage/marge-produits', {
      headers: { cookie: cookieCaissier, 'x-entreprise-id': entrepriseId },
    });
    expect(refuseMarge.status).toBe(403);
  });

  it('un employé n\'accède pas non plus au cockpit', async () => {
    const cookieAdmin = await inscrire('admin-pilotage-2@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Pilotage Perms 2');
    const cookieEmploye = await inscrire('employe-pilotage@test.cm');
    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'employe-pilotage@test.cm', role: 'employe' }),
    });
    const refuse = await SELF.fetch('http://localhost/api/pilotage/cockpit', {
      headers: { cookie: cookieEmploye, 'x-entreprise-id': entrepriseId },
    });
    expect(refuse.status).toBe(403);
  });
});
