import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('États financiers', () => {
  it('compte de résultat et bilan équilibré après ventes et achats', async () => {
    const e = doE('etats-1');
    await e.initialiser('etats-1', 'commerce', 2026);
    const pid = await e.creerProduit({ nom: 'Article', prixVente: 1000, seuilAlerte: 2 });
    await e.entrerStock({ produitId: pid, quantite: 10, coutUnitaire: 600, modePaiement: 'especes' });
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 3, prixUnitaire: 1000, produitId: pid }],
      modePaiement: 'especes',
    });

    const { resultat, bilan } = await e.etatsFinanciers();

    // Produits = 3 000 (3 × 1000). Charges = achat 6000 (601) + variation stock (6031 net).
    expect(resultat.produits).toBe(3000);
    // Le bilan est TOUJOURS équilibré (écritures en partie double).
    expect(bilan.equilibre).toBe(true);
    expect(bilan.totalActif).toBe(bilan.totalPassif);
    // Le résultat figure au passif
    const ligneResultat = (bilan.passif as { libelle: string; montant: number }[]).find((l) => l.libelle.includes('Résultat'));
    expect(ligneResultat?.montant).toBe(resultat.resultat);
  });

  it('entreprise sans opération : états à zéro et équilibrés', async () => {
    const e = doE('etats-2');
    await e.initialiser('etats-2', 'service', 2026);
    const { resultat, bilan } = await e.etatsFinanciers();
    expect(resultat.produits).toBe(0);
    expect(resultat.charges).toBe(0);
    expect(resultat.resultat).toBe(0);
    expect(bilan.equilibre).toBe(true);
  });
});
