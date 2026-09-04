import { SELF, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

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

describe('Rapprochement de trésorerie (D18)', () => {
  it('compare le solde déclaré au solde calculé et garde l\'écart', async () => {
    const e = doE('fiabilite-pointage-1');
    await e.initialiser('fiabilite-pointage-1', 'commerce', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 50000 }],
      modePaiement: 'especes',
    });
    // Solde calculé réel = 50000. Le dirigeant compte 48000 en caisse (2000 manquants).
    const { soldeCalcule, ecart } = await e.enregistrerPointage('especes', 48000);
    expect(soldeCalcule).toBe(50000);
    expect(ecart).toBe(-2000);

    const pointages = await e.listerPointages() as { compte: string; solde_declare: number; ecart: number }[];
    expect(pointages).toHaveLength(1);
    expect(pointages[0]!.ecart).toBe(-2000);
  });

  it('un pointage exact donne un écart nul', async () => {
    const e = doE('fiabilite-pointage-2');
    await e.initialiser('fiabilite-pointage-2', 'commerce', 2026);
    const { ecart } = await e.enregistrerPointage('especes', 0);
    expect(ecart).toBe(0);
  });
});

describe('Clôture mensuelle verrouillable (D18)', () => {
  it('refuse une nouvelle vente/dépense/achat datée dans un mois clôturé', async () => {
    const cookie = await inscrire('cloture-refus@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Clôture Refus');
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    const cloture = await SELF.fetch('http://localhost/api/etats/clotures', {
      method: 'POST', headers, body: JSON.stringify({ anneeMois: '2026-08' }),
    });
    expect(cloture.status).toBe(201);

    const vente = await SELF.fetch('http://localhost/api/ventes', {
      method: 'POST', headers,
      body: JSON.stringify({ lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 10000 }], modePaiement: 'especes', dateOperation: '2026-08-15' }),
    });
    expect(vente.status).toBe(500); // erreur métier remontée telle quelle (pas une 400 de validation Zod)
    expect((await vente.json<{ erreur: string }>()).erreur).toContain('clôturé');

    const depense = await SELF.fetch('http://localhost/api/depenses', {
      method: 'POST', headers,
      body: JSON.stringify({ categorie: 'transport', libelle: 'Transport', montant: 5000, modePaiement: 'especes', dateOperation: '2026-08-20' }),
    });
    expect(depense.status).toBe(500);
    expect((await depense.json<{ erreur: string }>()).erreur).toContain('clôturé');

    const produit = await SELF.fetch('http://localhost/api/produits', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Article', prixVente: 5000 }),
    });
    const { produitId } = await produit.json<{ produitId: string }>();
    const entree = await SELF.fetch(`http://localhost/api/produits/${produitId}/entree`, {
      method: 'POST', headers,
      body: JSON.stringify({ quantite: 1, coutUnitaire: 2000, modePaiement: 'especes', dateOperation: '2026-08-10' }),
    });
    expect(entree.status).toBe(500);
    expect((await entree.json<{ erreur: string }>()).erreur).toContain('clôturé');
  });

  it('une opération dans un mois NON clôturé passe normalement', async () => {
    const cookie = await inscrire('cloture-ok@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Clôture OK');
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    await SELF.fetch('http://localhost/api/etats/clotures', { method: 'POST', headers, body: JSON.stringify({ anneeMois: '2026-08' }) });

    const vente = await SELF.fetch('http://localhost/api/ventes', {
      method: 'POST', headers,
      body: JSON.stringify({ lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 10000 }], modePaiement: 'especes', dateOperation: '2026-09-05' }),
    });
    expect(vente.status).toBe(201);
  });

  it('rouvrir un mois permet à nouveau d\'y opérer', async () => {
    const cookie = await inscrire('cloture-reouverture@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Clôture Réouverture');
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    await SELF.fetch('http://localhost/api/etats/clotures', { method: 'POST', headers, body: JSON.stringify({ anneeMois: '2026-08' }) });
    const reouverture = await SELF.fetch('http://localhost/api/etats/clotures/2026-08', { method: 'DELETE', headers: { cookie, 'x-entreprise-id': entrepriseId } });
    expect(reouverture.status).toBe(200);

    const vente = await SELF.fetch('http://localhost/api/ventes', {
      method: 'POST', headers,
      body: JSON.stringify({ lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 10000 }], modePaiement: 'especes', dateOperation: '2026-08-15' }),
    });
    expect(vente.status).toBe(201);

    const clotures = await SELF.fetch('http://localhost/api/etats/clotures', { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    expect((await clotures.json<{ clotures: unknown[] }>()).clotures).toHaveLength(0);
  });

  it('clôturer deux fois le même mois ne casse rien (idempotent)', async () => {
    const cookie = await inscrire('cloture-idempotent@test.cm');
    const entrepriseId = await creerEntreprise(cookie, 'Boutique Clôture Idempotent');
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    await SELF.fetch('http://localhost/api/etats/clotures', { method: 'POST', headers, body: JSON.stringify({ anneeMois: '2026-08' }) });
    await SELF.fetch('http://localhost/api/etats/clotures', { method: 'POST', headers, body: JSON.stringify({ anneeMois: '2026-08' }) });

    const clotures = await SELF.fetch('http://localhost/api/etats/clotures', { headers: { cookie, 'x-entreprise-id': entrepriseId } });
    expect((await clotures.json<{ clotures: unknown[] }>()).clotures).toHaveLength(1);
  });
});
