import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Fiche tiers — coordonnées, solde, historique', () => {
  it('calcule le solde dû par un client (vente à crédit + facture impayée)', async () => {
    const e = doE('fiche-1');
    await e.initialiser('fiche-1', 'commerce', 2026);
    const clientId = await e.creerTiers({
      type: 'client', nom: 'Client Awa', telephone: '699000000', email: 'awa@test.cm', adresse: 'Douala',
    });
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 20000 }],
      aCredit: true, tiersId: clientId,
    });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId: clientId, lignes: [{ designation: 'Prestation', quantite: 1, prixUnitaire: 10000 }],
    });
    await e.emettreFacture(factureId, 'ENT');

    const fiche = await e.getTiersDetail(clientId) as {
      nom: string; email: string; adresse: string; soldeDu: number; ventes: unknown[]; factures: unknown[];
    };
    expect(fiche.nom).toBe('Client Awa');
    expect(fiche.email).toBe('awa@test.cm');
    expect(fiche.adresse).toBe('Douala');
    expect(fiche.soldeDu).toBe(30000); // 20000 (vente à crédit) + 10000 (facture émise, TVA=0)
    expect(fiche.ventes).toHaveLength(1);
    expect(fiche.factures).toHaveLength(1);
  });

  it('calcule le solde à payer à un fournisseur (achat à crédit)', async () => {
    const e = doE('fiche-2');
    await e.initialiser('fiche-2', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000 });
    const fournisseurId = await e.creerTiers({ type: 'fournisseur', nom: 'Grossiste Test' });
    await e.entrerStock({ produitId, quantite: 5, coutUnitaire: 8000, aCredit: true, tiersId: fournisseurId });

    const fiche = await e.getTiersDetail(fournisseurId) as { soldeAPayer: number; achats: unknown[] };
    expect(fiche.soldeAPayer).toBe(40000);
    expect(fiche.achats).toHaveLength(1);
  });

  it('un tiers introuvable renvoie null', async () => {
    const e = doE('fiche-3');
    await e.initialiser('fiche-3', 'commerce', 2026);
    expect(await e.getTiersDetail('inexistant')).toBeNull();
  });
});
