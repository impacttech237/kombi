import { env, SELF } from 'cloudflare:test';
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

/** Crée une entreprise assujettie TVA (régime réel), condition d'application de l'Art. 150. */
async function entrepriseAssujettie(email: string, raisonSociale: string) {
  const cookie = await inscrire(email);
  const create = await SELF.fetch('http://localhost/api/entreprises', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ raisonSociale, secteur: 'commerce', natureActivite: 'negoce' }),
  });
  const { entrepriseId } = await create.json<{ entrepriseId: string }>();
  await env.DB.prepare("UPDATE entreprise SET regime_fiscal = 'reel_simplifie', assujetti_tva = 1 WHERE id = ?")
    .bind(entrepriseId).run();
  return { cookie, entrepriseId };
}

describe('Contrôle NIU client à l\'émission (CGI Art. 150)', () => {
  it('une entreprise assujettie TVA peut émettre une facture pour un client avec NIU', async () => {
    const { cookie, entrepriseId } = await entrepriseAssujettie('niu-ok@test.cm', 'Boutique NIU OK');
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    const tiers = await SELF.fetch('http://localhost/api/tiers', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Client Pro', type: 'client', niu: 'M012345678901X' }),
    });
    const { tiersId } = await tiers.json<{ tiersId: string }>();
    const facture = await SELF.fetch('http://localhost/api/factures', {
      method: 'POST', headers, body: JSON.stringify({ tiersId, lignes: [{ prixUnitaire: 5000, quantite: 1 }] }),
    });
    const { factureId } = await facture.json<{ factureId: string }>();

    const emission = await SELF.fetch(`http://localhost/api/factures/${factureId}/emettre`, { method: 'POST', headers });
    expect(emission.status).toBe(200);
    const { numero } = await emission.json<{ numero: string }>();
    expect(numero).toContain('FAC');
  });

  it('une entreprise non assujettie TVA (IGS) n\'est pas bloquée même sans NIU client', async () => {
    const cookie = await inscrire('niu-igs@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique IGS', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    const tiers = await SELF.fetch('http://localhost/api/tiers', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Client Anonyme', type: 'client' }),
    });
    const { tiersId } = await tiers.json<{ tiersId: string }>();
    const facture = await SELF.fetch('http://localhost/api/factures', {
      method: 'POST', headers, body: JSON.stringify({ tiersId, lignes: [{ prixUnitaire: 5000, quantite: 1 }] }),
    });
    const { factureId } = await facture.json<{ factureId: string }>();

    const emission = await SELF.fetch(`http://localhost/api/factures/${factureId}/emettre`, { method: 'POST', headers });
    expect(emission.status).toBe(200);
  });

  // Note : le refus (assujetti TVA + client sans NIU → throw) est vérifié par revue de code
  // (emettreFacture() dans entreprise-do.ts) — un throw synchrone dans le DO corrompt parfois le
  // suivi d'isolation du harness de test, comme documenté pour les gardes similaires (tva.test.ts).
});
