import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

async function inscrire(email: string) {
  const res = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'motdepasse123', name: 'Test' }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  await SELF.fetch('http://localhost/api/entreprises', { headers: { cookie } }); // crée le profil utilisateur
  return cookie;
}

describe('Abonnements & plans (Gratuit / Essentiel / Pro)', () => {
  it('une nouvelle entreprise démarre en essai gratuit', async () => {
    const cookie = await inscrire('plan-defaut@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Plan', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();

    const res = await SELF.fetch('http://localhost/api/abonnement', { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    expect(res.status).toBe(200);
    const a = await res.json<{ planCode: string; statut: string; features: { quotaFacturesMois: number | null } }>();
    expect(a.planCode).toBe('gratuit');
    expect(a.statut).toBe('essai');
    expect(a.features.quotaFacturesMois).toBe(50);
  });

  it('un admin peut changer de plan (MVP sans passerelle de paiement)', async () => {
    const cookie = await inscrire('plan-change@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Upgrade', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    const changement = await SELF.fetch('http://localhost/api/abonnement/plan', {
      method: 'POST', headers, body: JSON.stringify({ planCode: 'essentiel' }),
    });
    expect(changement.status).toBe(200);

    const res = await SELF.fetch('http://localhost/api/abonnement', { headers });
    const a = await res.json<{ planCode: string; statut: string; features: { quotaFacturesMois: number | null } }>();
    expect(a.planCode).toBe('essentiel');
    expect(a.statut).toBe('actif');
    expect(a.features.quotaFacturesMois).toBeNull(); // illimité
  });

  it('le quota du plan Gratuit bloque l\'émission au-delà de la limite (402)', async () => {
    const cookie = await inscrire('plan-quota@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Quota', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    // Abaisse le quota du plan Gratuit à 0 pour ce test (sans émettre 50 vraies factures).
    await env.DB.prepare(
      `UPDATE plan SET features_json = json_set(features_json, '$.quotaFacturesMois', 0) WHERE code = 'gratuit'`,
    ).run();

    const tiers = await SELF.fetch('http://localhost/api/tiers', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Client Test', type: 'client' }),
    });
    const { tiersId } = await tiers.json<{ tiersId: string }>();
    const facture = await SELF.fetch('http://localhost/api/factures', {
      method: 'POST', headers, body: JSON.stringify({ tiersId, lignes: [{ prixUnitaire: 5000, quantite: 1 }] }),
    });
    const { factureId } = await facture.json<{ factureId: string }>();

    const emission = await SELF.fetch(`http://localhost/api/factures/${factureId}/emettre`, { method: 'POST', headers });
    expect(emission.status).toBe(402);

    // Remet le quota par défaut pour ne pas polluer les autres tests de ce fichier.
    await env.DB.prepare(
      `UPDATE plan SET features_json = json_set(features_json, '$.quotaFacturesMois', 50) WHERE code = 'gratuit'`,
    ).run();
  });
});
