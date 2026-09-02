import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doEntreprise(id: string) {
  return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id));
}

describe('1 base par entreprise (Durable Object) — onboarding sectoriel', () => {
  it('un commerce active le stock ; un service ne l\'active pas', async () => {
    const commerce = doEntreprise('e-commerce');
    await commerce.initialiser('e-commerce', 'commerce', 2026);
    const service = doEntreprise('e-service');
    await service.initialiser('e-service', 'service', 2026);

    expect(await commerce.moduleActif('stock')).toBe(true);
    expect(await service.moduleActif('stock')).toBe(false);
    // module cœur toujours actif
    expect(await service.moduleActif('facturation')).toBe(true);
  });

  it('le plan comptable OHADA est seedé dans la base de l\'entreprise', async () => {
    const e = doEntreprise('e-plan');
    await e.initialiser('e-plan', 'commerce', 2026);
    // 311 (stock) présent car commerce
    const tiers = await e.listerTiers(); // vide au départ
    expect(tiers).toHaveLength(0);
  });

  it('initialiser est idempotent', async () => {
    const e = doEntreprise('e-idem');
    await e.initialiser('e-idem', 'commerce', 2026);
    await e.initialiser('e-idem', 'commerce', 2026); // second appel : no-op
    expect(await e.moduleActif('ventes')).toBe(true);
  });
});

describe('Isolation PHYSIQUE entre entreprises (bases DO séparées)', () => {
  it('l\'entreprise A ne voit jamais les données de B — séparation physique', async () => {
    const a = doEntreprise('phys-A');
    const b = doEntreprise('phys-B');
    await a.initialiser('phys-A', 'commerce', 2026);
    await b.initialiser('phys-B', 'commerce', 2026);

    await a.creerTiers({ type: 'client', nom: 'Client A' });
    await b.creerTiers({ type: 'client', nom: 'Client B' });

    const tiersA = await a.listerTiers();
    const tiersB = await b.listerTiers();
    expect(tiersA).toHaveLength(1);
    expect(tiersB).toHaveLength(1);
    expect((tiersA[0] as { nom: string }).nom).toBe('Client A');
    expect(tiersA.some((t) => (t as { nom: string }).nom === 'Client B')).toBe(false);
  });
});

describe('Auth + création via HTTP (bout en bout)', () => {
  it('refuse sans session, puis inscription → création d\'entreprise → liste', async () => {
    expect((await SELF.fetch('http://localhost/api/entreprises')).status).toBe(401);

    const signup = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'patron@pme.cm', password: 'motdepasse123', name: 'Patron' }),
    });
    expect([200, 201]).toContain(signup.status);
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;

    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Test', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    expect(create.status).toBe(201);
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();
    expect(entrepriseId).toBeTruthy();

    const liste = await SELF.fetch('http://localhost/api/entreprises', { headers: { cookie } });
    const { entreprises } = await liste.json<{ entreprises: { id: string; assujetti_tva: number }[] }>();
    expect(entreprises.some((e) => e.id === entrepriseId)).toBe(true);
    // assujetti_tva exposé (nécessaire côté caisse pour conditionner l'application de la TVA).
    expect(entreprises.find((e) => e.id === entrepriseId)?.assujetti_tva).toBe(0);

    // Modules de l'entreprise créée : stock actif (commerce)
    const mods = await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/modules`, {
      headers: { cookie },
    });
    const { modules } = await mods.json<{ modules: { code: string; actif: number }[] }>();
    expect(modules.find((m) => m.code === 'stock')?.actif).toBe(1);
  });
});
