import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Rapport agrégé — période simple', () => {
  it('inclut une facture autonome émise, sans doubler une facture-document issue d’une vente', async () => {
    const e = doE('rapport-factures');
    await e.initialiser('rapport-factures', 'commerce', 2026);
    const client = await e.creerTiers({ type: 'client', nom: 'Client facturé' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId: client, dateEcheance: '2026-09-20',
      lignes: [{ designation: 'Prestation autonome', quantite: 1, prixUnitaire: 100000 }],
    });
    await e.emettreFacture(factureId, 'TEST');
    const { venteId } = await e.enregistrerVente({
      lignes: [{ designation: 'Vente caisse', quantite: 1, prixUnitaire: 25000 }],
      modePaiement: 'especes', tiersId: client, dateOperation: '2026-09-04',
    });
    await e.creerFactureDepuisVente(venteId, 'TEST');

    const rapport = await e.rapport({ type: 'mensuel', periode: { debut: '2026-09-01', fin: '2026-10-01' } }) as { stats: { ca: number } };
    expect(rapport.stats.ca).toBe(125000);
  });

  it('agrège CA/marge/dépenses, produits, clients sur la période demandée', async () => {
    const e = doE('rapport-1');
    await e.initialiser('rapport-1', 'commerce', 2026);
    const client = await e.creerTiers({ type: 'client', nom: 'Client Rapport' });
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 8000, modePaiement: 'especes' });
    await e.enregistrerVente({
      lignes: [{ designation: 'Sac de riz', quantite: 2, prixUnitaire: 15000, produitId }],
      modePaiement: 'especes', tiersId: client, dateOperation: '2026-09-04',
    });
    await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 10000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const rapport = await e.rapport({ type: 'mensuel', periode: { debut: '2026-09-01', fin: '2026-10-01' } }) as {
      stats: { ca: number; marge: number; depenses: number };
      produits: { designation: string }[];
      clients: { nom: string }[];
      comparaison: unknown;
    };
    expect(rapport.stats.ca).toBe(30000);
    expect(rapport.stats.marge).toBe(30000 - 16000);
    expect(rapport.stats.depenses).toBe(10000);
    expect(rapport.produits[0]!.designation).toBe('Sac de riz');
    expect(rapport.clients[0]!.nom).toBe('Client Rapport');
    expect(rapport.comparaison).toBeNull();
  });

  it('ne compte pas les opérations hors période', async () => {
    const e = doE('rapport-2');
    await e.initialiser('rapport-2', 'commerce', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 20000 }],
      modePaiement: 'especes', dateOperation: '2026-08-15',
    });
    const rapport = await e.rapport({ type: 'mensuel', periode: { debut: '2026-09-01', fin: '2026-10-01' } }) as { stats: { ca: number } };
    expect(rapport.stats.ca).toBe(0);
  });
});

describe('Rapport agrégé — période personnalisée et filtre agence', () => {
  it('accepte une plage de dates arbitraire (type personnalisé)', async () => {
    const e = doE('rapport-personnalise');
    await e.initialiser('rapport-personnalise', 'commerce', 2026);
    await e.enregistrerVente({ lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 20000 }], modePaiement: 'especes', dateOperation: '2026-09-15' });
    const rapport = await e.rapport({ type: 'personnalise', periode: { debut: '2026-09-10', fin: '2026-09-20' } }) as { stats: { ca: number } };
    expect(rapport.stats.ca).toBe(20000);
  });

  it('le filtre agence ne s\'applique qu\'aux dépenses du rapport, pas au CA', async () => {
    const e = doE('rapport-agence');
    await e.initialiser('rapport-agence', 'commerce', 2026);
    await e.enregistrerVente({ lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 20000 }], modePaiement: 'especes', dateOperation: '2026-09-04' });
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Douala', montant: 5000, modePaiement: 'especes', agence: 'Douala', dateOperation: '2026-09-04' });
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Yaoundé', montant: 3000, modePaiement: 'especes', agence: 'Yaoundé', dateOperation: '2026-09-04' });

    const rapport = await e.rapport({ type: 'mensuel', periode: { debut: '2026-09-01', fin: '2026-10-01' }, agence: 'Douala' }) as {
      stats: { ca: number; depenses: number }; depenses: { total: number };
    };
    expect(rapport.stats.ca).toBe(20000); // CA global, non filtré par agence
    expect(rapport.depenses.total).toBe(5000); // dépenses filtrées sur Douala uniquement
  });
});

describe('Rapport agrégé — évolution des dépenses selon le type', () => {
  it('un rapport mensuel donne 6 mois d\'évolution, un rapport annuel les 12 mois civils de l\'exercice', async () => {
    const e = doE('rapport-evolution');
    await e.initialiser('rapport-evolution', 'commerce', 2026);
    await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 10000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const mensuel = await e.rapport({ type: 'mensuel', periode: { debut: '2026-09-01', fin: '2026-10-01' } }) as {
      depenses: { evolutionMensuelle: { moisLabel: string }[] };
    };
    expect(mensuel.depenses.evolutionMensuelle).toHaveLength(6);

    const annuel = await e.rapport({ type: 'annuel', periode: { debut: '2026-01-01', fin: '2027-01-01' } }) as {
      depenses: { evolutionMensuelle: { moisLabel: string }[] };
    };
    expect(annuel.depenses.evolutionMensuelle).toHaveLength(12);
    expect(annuel.depenses.evolutionMensuelle[0]!.moisLabel).toBe('2026-01');
    expect(annuel.depenses.evolutionMensuelle[11]!.moisLabel).toBe('2026-12');
  });
});

describe('Rapport agrégé — comparaison de périodes', () => {
  it('calcule les variations entre deux périodes', async () => {
    const e = doE('rapport-comparaison');
    await e.initialiser('rapport-comparaison', 'commerce', 2026);
    await e.enregistrerVente({ lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 50000 }], modePaiement: 'especes', dateOperation: '2026-08-15' });
    await e.enregistrerVente({ lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 100000 }], modePaiement: 'especes', dateOperation: '2026-09-04' });

    const rapport = await e.rapport({
      type: 'comparaison',
      periode: { debut: '2026-09-01', fin: '2026-10-01' },
      periodeComparaison: { debut: '2026-08-01', fin: '2026-09-01' },
    }) as { comparaison: { variationCaPct: number | null; stats: { ca: number } } | null };
    expect(rapport.comparaison).not.toBeNull();
    expect(rapport.comparaison!.stats.ca).toBe(50000);
    expect(rapport.comparaison!.variationCaPct).toBe(100);
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

describe('Routes /api/rapports — JSON, PDF, CSV', () => {
  it('répond 200 en JSON, PDF et CSV, et 403 pour un rôle sans rapport:read', async () => {
    const cookieAdmin = await inscrire('admin-rapport@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Rapports');
    const qs = 'type=mensuel&debut=2026-09-01&fin=2026-10-01';

    const json = await SELF.fetch(`http://localhost/api/rapports?${qs}`, { headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId } });
    expect(json.status).toBe(200);
    expect(json.headers.get('content-type')).toContain('application/json');

    const pdf = await SELF.fetch(`http://localhost/api/rapports/pdf?${qs}`, { headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId } });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');

    const csv = await SELF.fetch(`http://localhost/api/rapports/csv?${qs}`, { headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId } });
    expect(csv.status).toBe(200);
    expect(csv.headers.get('content-type')).toContain('text/csv');

    const cookieCaissier = await inscrire('caissier-rapport@test.cm');
    await SELF.fetch(`http://localhost/api/entreprises/${entrepriseId}/membres`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieAdmin },
      body: JSON.stringify({ email: 'caissier-rapport@test.cm', role: 'caissier' }),
    });
    const refuse = await SELF.fetch(`http://localhost/api/rapports?${qs}`, { headers: { cookie: cookieCaissier, 'x-entreprise-id': entrepriseId } });
    expect(refuse.status).toBe(403);
  });

  it('rejette des paramètres de période manquants (400)', async () => {
    const cookieAdmin = await inscrire('admin-rapport-2@test.cm');
    const entrepriseId = await creerEntreprise(cookieAdmin, 'Boutique Rapports Format');
    const res = await SELF.fetch('http://localhost/api/rapports?type=mensuel', { headers: { cookie: cookieAdmin, 'x-entreprise-id': entrepriseId } });
    expect(res.status).toBe(400);
  });
});
