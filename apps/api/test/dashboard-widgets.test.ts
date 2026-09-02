import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Widgets tableau de bord — marge, meilleures ventes, dépenses du jour', () => {
  it('marge brute = CA net − coût des marchandises vendues (6031)', async () => {
    const e = doE('dash-1');
    await e.initialiser('dash-1', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 8000, modePaiement: 'especes' });

    await e.enregistrerVente({
      lignes: [{ designation: 'Sac de riz', quantite: 4, prixUnitaire: 15000, produitId }],
      modePaiement: 'especes',
    });
    // CA = 60000, COGS = 4 × 8000 = 32000 → marge = 28000
    expect(await e.margeCumulee()).toBe(28000);
  });

  it('meilleures ventes classées par CA HT, ventes annulées exclues', async () => {
    const e = doE('dash-2');
    await e.initialiser('dash-2', 'commerce', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Article A', quantite: 1, prixUnitaire: 50000 }],
      modePaiement: 'especes',
    });
    const { venteId } = await e.enregistrerVente({
      lignes: [{ designation: 'Article B', quantite: 10, prixUnitaire: 100000 }],
      modePaiement: 'especes',
    });
    await e.annulerVente(venteId); // Article B annulé → doit disparaître du classement

    const top = (await e.meilleuresVentes(5)) as { designation: string; montant_ht: number }[];
    expect(top).toHaveLength(1);
    expect(top[0]!.designation).toBe('Article A');
  });

  it('dépenses du jour ne comptent que les dépenses datées aujourd\'hui', async () => {
    const e = doE('dash-3');
    await e.initialiser('dash-3', 'commerce', 2026);
    await e.creerDepense({
      categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 30000, modePaiement: 'especes',
    });
    await e.creerDepense({
      categorie: 'transport', compteNumero: '614', libelle: 'Vieux transport', montant: 5000,
      modePaiement: 'especes', dateOperation: '2024-01-01',
    });
    expect(await e.depensesDuJour()).toBe(30000);
  });
});
