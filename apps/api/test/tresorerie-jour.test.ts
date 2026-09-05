import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Trésorerie du jour (espèces + MoMo/Orange)', () => {
  it('liste aussi les encaissements de facture et règlements, pas seulement ventes et dépenses', async () => {
    const e = doE('treso-mouvements');
    await e.initialiser('treso-mouvements', 'commerce', 2026);
    const client = await e.creerTiers({ type: 'client', nom: 'Client' });
    const f = await e.creerFacture({ type: 'facture', tiersId: client, lignes: [{ designation: 'Mission', quantite: 1, prixUnitaire: 10000 }] });
    await e.emettreFacture(f, 'TEST');
    await e.payerFacture(f, 4000, 'orange_money');
    const mouvements = await e.listerMouvementsTresorerie() as { source: string; compte_numero: string; montant_net: number }[];
    expect(mouvements).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'facture', compte_numero: '5521', montant_net: 4000 }),
    ]));
  });

  it('agrège le mouvement net par mode de paiement pour les opérations du jour', async () => {
    const e = doE('treso-1');
    await e.initialiser('treso-1', 'commerce', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 10000 }], modePaiement: 'especes',
    });
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 5000 }], modePaiement: 'mtn_momo',
    });
    await e.creerDepense({
      categorie: 'transport', compteNumero: '614', libelle: 'Transport', montant: 2000, modePaiement: 'especes',
    });

    const treso = await e.tresorerieDuJour();
    expect(treso.especes).toBe(8000); // +10000 (vente) − 2000 (dépense)
    expect(treso.mtnMomo).toBe(5000);
    expect(treso.orangeMoney).toBe(0);
    expect(treso.banque).toBe(0);
  });

  it('une opération datée dans le passé n\'apparaît pas dans la trésorerie du jour', async () => {
    const e = doE('treso-2');
    await e.initialiser('treso-2', 'commerce', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Vieux', quantite: 1, prixUnitaire: 9000 }],
      modePaiement: 'especes', dateOperation: '2024-01-01',
    });
    const treso = await e.tresorerieDuJour();
    expect(treso.especes).toBe(0);
  });
});
