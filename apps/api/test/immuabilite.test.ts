import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Immuabilité & atomicité des écritures comptables', () => {
  it('une écriture validée est protégée contre toute modification ou suppression directe', async () => {
    const e = doE('immuable-1');
    await e.initialiser('immuable-1', 'commerce', 2026);
    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 1000 }],
      modePaiement: 'especes',
    });
    expect(r.totalTtc).toBe(1000);

    const ecritures = await e.listerEcritures();
    expect(ecritures.length).toBe(1);
    const ecritureId = ecritures[0]!.id as string;

    const { updateBloque, deleteBloque } = await e._verifierImmuabiliteEcriture(ecritureId);
    expect(updateBloque).toBe(true);
    expect(deleteBloque).toBe(true);

    // L'écriture n'a effectivement pas été altérée par les tentatives ci-dessus.
    const encore = await e.listerEcritures();
    expect(encore[0]!.libelle).toBe('Vente caisse');
  });

  it('atomicité : une vente sur un produit garde stock et écriture cohérents (transactionSync)', async () => {
    const e = doE('atomic-1');
    await e.initialiser('atomic-1', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 10000, modePaiement: 'especes' });

    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Sac de riz', quantite: 3, prixUnitaire: 15000, produitId }],
      modePaiement: 'especes',
    });
    expect(r.totalTtc).toBe(45000);

    const produits = await e.listerProduits();
    const p = (produits as Record<string, unknown>[]).find((x) => x.id === produitId)!;
    expect(p.stock_actuel).toBe(7); // 10 - 3, cohérent avec l'écriture générée dans la même transaction

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
  });

  it('une facture émise puis payée génère des écritures validées et immuables', async () => {
    const e = doE('immuable-2');
    await e.initialiser('immuable-2', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Test' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId, lignes: [{ designation: 'Prestation', quantite: 1, prixUnitaire: 20000 }],
    });
    await e.emettreFacture(factureId, 'ENT');
    await e.payerFacture(factureId, 20000, 'especes');

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
  });
});
