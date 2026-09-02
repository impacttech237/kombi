import { env, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

async function inscrire(email: string) {
  const res = await SELF.fetch('http://localhost/api/auth/sign-up/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'motdepasse123', name: 'Test' }),
  });
  const cookie = res.headers.get('set-cookie')!.split(';')[0]!;
  await SELF.fetch('http://localhost/api/entreprises', { headers: { cookie } }); // crée le profil utilisateur
  return cookie;
}

describe('Dettes fournisseurs (401) — symétrique de la vente à crédit', () => {
  it('un achat à crédit sans fournisseur est refusé (validation Zod, 400)', async () => {
    const cookie = await inscrire('dette-refus@test.cm');
    const create = await SELF.fetch('http://localhost/api/entreprises', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ raisonSociale: 'Boutique Refus Dette', secteur: 'commerce', natureActivite: 'negoce' }),
    });
    const { entrepriseId } = await create.json<{ entrepriseId: string }>();
    const headers = { 'content-type': 'application/json', cookie, 'x-entreprise-id': entrepriseId };

    const produit = await SELF.fetch('http://localhost/api/produits', {
      method: 'POST', headers, body: JSON.stringify({ nom: 'Sac de riz', prixVente: 15000 }),
    });
    const { produitId } = await produit.json<{ produitId: string }>();

    const res = await SELF.fetch(`http://localhost/api/produits/${produitId}/entree`, {
      method: 'POST', headers, body: JSON.stringify({ quantite: 10, coutUnitaire: 10000, aCredit: true }),
    });
    expect(res.status).toBe(400);
  });

  it('un achat à crédit débite 601 (charge) et crédite 401 (dette) — pas de trésorerie mouvementée', async () => {
    const e = doE('dette-1');
    await e.initialiser('dette-1', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000 });
    const fournisseurId = await e.creerTiers({ type: 'fournisseur', nom: 'Grossiste Test' });

    const r = await e.entrerStock({
      produitId, quantite: 10, coutUnitaire: 10000, aCredit: true, tiersId: fournisseurId,
    });
    expect(r.nouveauStock).toBe(10);

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    const dette = (bilan.passif as { numero: string; montant: number }[]).find((l) => l.numero === '401');
    expect(dette?.montant).toBe(100000); // 10 × 10000

    const dettes = await e.listerDettesFournisseurs();
    expect(dettes.length).toBe(1);
    expect((dettes[0] as { statut: string }).statut).toBe('a_credit');
  });

  it('un règlement partiel puis total solde la dette', async () => {
    const e = doE('dette-2');
    await e.initialiser('dette-2', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Article', prixVente: 5000 });
    const fournisseurId = await e.creerTiers({ type: 'fournisseur', nom: 'Fournisseur Partiel' });
    const { nouveauStock } = await e.entrerStock({
      produitId, quantite: 5, coutUnitaire: 4000, aCredit: true, tiersId: fournisseurId,
    });
    expect(nouveauStock).toBe(5);

    const dettes = await e.listerDettesFournisseurs();
    const achatId = (dettes[0] as { id: string }).id;

    const partiel = await e.payerAchat(achatId, 8000, 'especes');
    expect(partiel.statut).toBe('payee_partiellement');

    const solde = await e.payerAchat(achatId, 12000, 'especes');
    expect(solde.statut).toBe('regle');
    expect(solde.regle).toBe(20000); // 5 × 4000

    expect((await e.listerDettesFournisseurs()).length).toBe(0);
    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    expect((bilan.passif as { numero: string }[]).find((l) => l.numero === '401')).toBeUndefined();
  });

  it('un approvisionnement classique (comptant) ne crée toujours aucune dette', async () => {
    const e = doE('dette-3');
    await e.initialiser('dette-3', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Article', prixVente: 5000 });
    await e.entrerStock({ produitId, quantite: 3, coutUnitaire: 2000, modePaiement: 'especes' });
    expect(await e.listerDettesFournisseurs()).toEqual([]);
  });

  it('journalisé et immuable comme toute écriture', async () => {
    const e = doE('dette-4');
    await e.initialiser('dette-4', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Article', prixVente: 5000 });
    const fournisseurId = await e.creerTiers({ type: 'fournisseur', nom: 'Fournisseur Audit' });
    const acteur = { utilisateurId: 'u-gerant', role: 'gerant' };
    await e.entrerStock({ produitId, quantite: 2, coutUnitaire: 3000, aCredit: true, tiersId: fournisseurId }, acteur);

    const journal = await e.listerAuditLog();
    expect((journal[0] as { action: string }).action).toBe('achat.credit');
    const integrite = await e.verifierChaineAudit();
    expect(integrite.valide).toBe(true);
  });
});

describe('Factures impayées (« on me doit »)', () => {
  it('liste les factures émises non soldées avec montant dû et retard calculés', async () => {
    const e = doE('impayee-1');
    await e.initialiser('impayee-1', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Retard' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId, dateEcheance: '2020-01-01', // largement dans le passé
      lignes: [{ designation: 'Prestation', quantite: 1, prixUnitaire: 30000 }],
    });
    await e.emettreFacture(factureId, 'ENT');

    const impayees = await e.listerFacturesImpayees();
    expect(impayees.length).toBe(1);
    const f = impayees[0] as { montantDu: number; enRetard: boolean };
    expect(f.montantDu).toBe(30000);
    expect(f.enRetard).toBe(true);

    await e.payerFacture(factureId, 30000, 'especes');
    expect(await e.listerFacturesImpayees()).toEqual([]);
  });
});
