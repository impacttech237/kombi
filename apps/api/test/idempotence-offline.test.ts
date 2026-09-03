import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Idempotence offline (spec §5.2 : dépense, encaissement, tiers, produit)', () => {
  it('creerTiers rejoué avec le même clientUuid ne crée pas de doublon', async () => {
    const e = doE('idem-tiers');
    await e.initialiser('idem-tiers', 'commerce', 2026);
    const uuid = 'client-uuid-tiers-1';
    const id1 = await e.creerTiers({ type: 'client', nom: 'Client Test', clientUuid: uuid });
    const id2 = await e.creerTiers({ type: 'client', nom: 'Client Test', clientUuid: uuid });
    expect(id2).toBe(id1);
    const liste = await e.listerTiers() as { id: string }[];
    expect(liste.filter((t) => t.id === id1)).toHaveLength(1);
  });

  it('entrerStock rejoué avec le même clientUuid ne double pas le stock', async () => {
    const e = doE('idem-stock');
    await e.initialiser('idem-stock', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Savon', prixVente: 1000, seuilAlerte: 0 });
    const uuid = 'client-uuid-stock-1';
    const r1 = await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 400, modePaiement: 'especes', clientUuid: uuid });
    const r2 = await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 400, modePaiement: 'especes', clientUuid: uuid });
    expect(r2.nouveauStock).toBe(r1.nouveauStock);
    expect(r1.nouveauStock).toBe(10); // pas 20
  });

  it('payerVente rejoué avec le même clientUuid n\'encaisse pas deux fois', async () => {
    const e = doE('idem-paiement-vente');
    await e.initialiser('idem-paiement-vente', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Crédit' });
    const { venteId } = await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 20000 }], aCredit: true, tiersId,
    });
    const uuid = 'client-uuid-paiement-1';
    const p1 = await e.payerVente(venteId, 20000, 'especes', undefined, uuid);
    const p2 = await e.payerVente(venteId, 20000, 'especes', undefined, uuid);
    expect(p2.regle).toBe(p1.regle);
    expect(p1.regle).toBe(20000); // pas 40000
    expect(p1.statut).toBe('payee');
  });

  it('payerFacture rejoué avec le même clientUuid n\'encaisse pas deux fois', async () => {
    const e = doE('idem-paiement-facture');
    await e.initialiser('idem-paiement-facture', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Facture' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId, lignes: [{ designation: 'Prestation', quantite: 1, prixUnitaire: 15000 }],
    });
    await e.emettreFacture(factureId, 'ENT');
    const uuid = 'client-uuid-paiement-facture-1';
    const p1 = await e.payerFacture(factureId, 15000, 'especes', undefined, uuid);
    const p2 = await e.payerFacture(factureId, 15000, 'especes', undefined, uuid);
    expect(p2.regle).toBe(p1.regle);
    expect(p1.regle).toBe(15000);
  });

  it('payerAchat rejoué avec le même clientUuid ne règle pas deux fois', async () => {
    const e = doE('idem-paiement-achat');
    await e.initialiser('idem-paiement-achat', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000 });
    const fournisseurId = await e.creerTiers({ type: 'fournisseur', nom: 'Grossiste Test' });
    await e.entrerStock({ produitId, quantite: 5, coutUnitaire: 8000, aCredit: true, tiersId: fournisseurId });
    const dettes = await e.listerDettesFournisseurs() as { id: string }[];
    const achatId = dettes[0]!.id;
    const uuid = 'client-uuid-paiement-achat-1';
    const p1 = await e.payerAchat(achatId, 40000, 'especes', undefined, uuid);
    const p2 = await e.payerAchat(achatId, 40000, 'especes', undefined, uuid);
    expect(p2.regle).toBe(p1.regle);
    expect(p1.regle).toBe(40000);
  });
});
