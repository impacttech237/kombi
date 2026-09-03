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

describe('Paramètres fiscaux entreprise (NIU, CGA, TVA)', () => {
  it('un admin peut activer adherent_cga et assujetti_tva après la création', async () => {
    const cookie = await inscrire('parametres-admin@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Paramètres', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();
    const headers = { 'content-type': 'application/json', cookie };

    // Par défaut, ni CGA ni TVA (la fonctionnalité gratuite phare était jusqu'ici inatteignable).
    const avant = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/parametres`, { headers });
    const paramsAvant = await avant.json<{ adherent_cga: number; assujetti_tva: number }>();
    expect(paramsAvant.adherent_cga).toBe(0);
    expect(paramsAvant.assujetti_tva).toBe(0);

    const maj = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}`, {
      method: 'PATCH', headers, body: JSON.stringify({ niu: 'M012345678901X', adherentCga: true, assujettiTva: true }),
    });
    expect(maj.status).toBe(200);

    const apres = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/parametres`, { headers });
    const paramsApres = await apres.json<{ niu: string; adherent_cga: number; assujetti_tva: number }>();
    expect(paramsApres.niu).toBe('M012345678901X');
    expect(paramsApres.adherent_cga).toBe(1);
    expect(paramsApres.assujetti_tva).toBe(1);
  });

  it('un non-membre ne peut pas lire ni modifier les paramètres d\'une autre entreprise', async () => {
    const cookieA = await inscrire('parametres-a@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieA },
      body: JSON.stringify({ raisonSociale: 'Boutique A', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();

    const cookieB = await inscrire('parametres-b@test.cm');
    const res = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/parametres`, {
      headers: { cookie: cookieB },
    });
    expect(res.status).toBe(403);
  });
});
