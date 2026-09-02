import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Avoir — correction d\'une facture sans suppression', () => {
  it('contre-passe intégralement la facture (débit produit / crédit 411), bilan équilibré', async () => {
    const e = doE('avoir-1');
    await e.initialiser('avoir-1', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Erreur' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId, lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 20000 }],
    });
    await e.emettreFacture(factureId, 'ENT');
    expect(await e.caCumule()).toBe(20000);

    const { numero } = await e.creerAvoir(factureId, 'ENT');
    expect(numero).toMatch(/-AVO-2026-0002$/); // partage la numérotation des factures (0001 = émission)

    // Le CA net redevient nul : l'avoir annule exactement la vente.
    expect(await e.caCumule()).toBe(0);
    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    // Plus de créance 411 : la facture originale est neutralisée par l'avoir.
    expect((bilan.actif as { numero: string }[]).find((l) => l.numero === '411')).toBeUndefined();
  });

  it('la facture avoirée sort de la liste des impayées', async () => {
    const e = doE('avoir-2');
    await e.initialiser('avoir-2', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Test' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId, dateEcheance: '2020-01-01',
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 15000 }],
    });
    await e.emettreFacture(factureId, 'ENT');
    expect((await e.listerFacturesImpayees()).length).toBe(1);

    await e.creerAvoir(factureId, 'ENT');
    expect((await e.listerFacturesImpayees()).length).toBe(0);
  });

  it('journalisé et immuable comme toute écriture', async () => {
    const e = doE('avoir-3');
    await e.initialiser('avoir-3', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Test' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId, lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 5000 }],
    });
    await e.emettreFacture(factureId, 'ENT');
    const acteur = { utilisateurId: 'u-gerant', role: 'gerant' };
    await e.creerAvoir(factureId, 'ENT', acteur);

    const journal = await e.listerAuditLog();
    expect((journal[0] as { action: string }).action).toBe('facture.avoir');
    const integrite = await e.verifierChaineAudit();
    expect(integrite.valide).toBe(true);
  });
});
