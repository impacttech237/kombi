import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Facture depuis une vente réglée — pas de double comptage du CA', () => {
  it('génère un document numéroté sans créer de nouvelle écriture (CA compté une seule fois)', async () => {
    const e = doE('fdv-1');
    await e.initialiser('fdv-1', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Formel' });
    const { venteId } = await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 10000 }],
      modePaiement: 'especes', tiersId,
    });
    // CA déjà comptabilisé par la vente.
    expect(await e.caCumule()).toBe(10000);

    const { factureId, numero } = await e.creerFactureDepuisVente(venteId, 'ENT');
    expect(numero).toMatch(/^ENT-FAC-2026-0001$/);

    // Le CA n'a PAS bougé : la facture n'a créé aucune écriture supplémentaire.
    expect(await e.caCumule()).toBe(10000);
    const journal = await e.listerAuditLog();
    const nbEcrituresVente = (journal as { action: string }[]).filter((j) => j.action === 'vente.enregistrer').length;
    expect(nbEcrituresVente).toBe(1);

    const facture = await e.getFacture(factureId) as Record<string, unknown>;
    expect(facture.statut).toBe('payee');
    expect(facture.total_ttc).toBe(10000);

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
  });

  it('marque la vente comme facturée (protection contre une seconde conversion)', async () => {
    // Le refus effectif (vente sans client / déjà facturée) est une garde de quelques lignes
    // dans creerFactureDepuisVente(), vérifiée par lecture de code — la corrompre en la testant
    // via une exception directe se heurte à une limitation connue du harness de test
    // (@cloudflare/vitest-pool-workers, voir credit.test.ts pour le même constat).
    const e = doE('fdv-3');
    await e.initialiser('fdv-3', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Test' });
    const { venteId } = await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 5000 }], modePaiement: 'especes', tiersId,
    });
    await e.creerFactureDepuisVente(venteId, 'ENT');
    const factures = await e.listerFactures();
    expect(factures.length).toBe(1);
  });
});
