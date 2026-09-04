import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('À décider — problèmes prioritaires', () => {
  it('classe les problèmes par impact financier décroissant, limité à 3', async () => {
    const e = doE('decisions-1');
    await e.initialiser('decisions-1', 'commerce', 2026);
    const client = await e.creerTiers({ type: 'client', nom: 'Gros Client' });
    // Créance en retard — gros montant
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 200000 }],
      aCredit: true, tiersId: client, dateEcheance: '2020-01-01',
    });
    // Dépense anormale — petit montant, pour vérifier le tri (moins prioritaire que la créance)
    for (const mois of ['06', '07', '08']) {
      await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: `Transport ${mois}`, montant: 10000, modePaiement: 'especes', dateOperation: `2026-${mois}-10` });
    }
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Transport septembre', montant: 40000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const problemes = await e.problemesPrioritaires() as { probleme: string; impactFinancier: number }[];
    expect(problemes.length).toBeGreaterThan(0);
    expect(problemes.length).toBeLessThanOrEqual(3);
    // Trié décroissant
    for (let i = 1; i < problemes.length; i++) {
      expect(problemes[i - 1]!.impactFinancier).toBeGreaterThanOrEqual(problemes[i]!.impactFinancier);
    }
    expect(problemes[0]!.impactFinancier).toBe(200000);
  });

  it('renvoie une liste vide quand rien n\'est problématique', async () => {
    const e = doE('decisions-2');
    await e.initialiser('decisions-2', 'commerce', 2026);
    const problemes = await e.problemesPrioritaires();
    expect(problemes).toEqual([]);
  });

  it('signale le dépassement du plafond de dépenses du mois', async () => {
    const e = doE('decisions-3');
    await e.initialiser('decisions-3', 'commerce', 2026);
    await e.definirBudget('2026-09', { plafondDepenses: 5000 });
    await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 20000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const problemes = await e.problemesPrioritaires() as { probleme: string; impactFinancier: number; cause: string }[];
    const budgetPb = problemes.find((p) => p.probleme.includes('Plafond'));
    expect(budgetPb).toBeDefined();
    expect(budgetPb!.impactFinancier).toBe(15000);
  });
});

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

describe('Route /api/decisions — réservée admin/gérant', () => {
  it('un gérant y accède, un comptable et un caissier non', async () => {
    const cookieAdmin = await inscrire('admin-decisions@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Décisions');

    const ok = await SELF.fetch('http://localhost/api/decisions', { headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId } });
    expect(ok.status).toBe(200);
    const body = await ok.json<{ problemes: unknown[] }>();
    expect(Array.isArray(body.problemes)).toBe(true);

    const cookieComptable = await inscrire('comptable-decisions@test.cm');
    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'comptable-decisions@test.cm', role: 'comptable' }),
    });
    const refuseComptable = await SELF.fetch('http://localhost/api/decisions', { headers: { cookie: cookieComptable, 'x-entreprise-id': entrepriseId } });
    expect(refuseComptable.status).toBe(403);

    const cookieCaissier = await inscrire('caissier-decisions@test.cm');
    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'caissier-decisions@test.cm', role: 'caissier' }),
    });
    const refuseCaissier = await SELF.fetch('http://localhost/api/decisions', { headers: { cookie: cookieCaissier, 'x-entreprise-id': entrepriseId } });
    expect(refuseCaissier.status).toBe(403);
  });
});
