import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Cockpit dirigeant — marge par produit', () => {
  it('calcule CA, coût, marge et % marge par produit, triés par marge décroissante', async () => {
    const e = doE('pilotage-marge-1');
    await e.initialiser('pilotage-marge-1', 'commerce', 2026);
    const riz = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000, seuilAlerte: 0 });
    const huile = await e.creerProduit({ nom: 'Huile 5L', prixVente: 6000, seuilAlerte: 0 });
    await e.entrerStock({ produitId: riz, quantite: 10, coutUnitaire: 8000, modePaiement: 'especes' });
    await e.entrerStock({ produitId: huile, quantite: 10, coutUnitaire: 5500, modePaiement: 'especes' });

    // Riz : CA 60000, coût 32000, marge 28000 (46,7 %)
    await e.enregistrerVente({
      lignes: [{ designation: 'Sac de riz', quantite: 4, prixUnitaire: 15000, produitId: riz }],
      modePaiement: 'especes',
    });
    // Huile : CA 24000, coût 22000, marge 2000 (8,3 %) — marge bien plus faible malgré un CA proche
    await e.enregistrerVente({
      lignes: [{ designation: 'Huile 5L', quantite: 4, prixUnitaire: 6000, produitId: huile }],
      modePaiement: 'especes',
    });

    const marges = await e.margeParProduit() as
      { designation: string; quantite: number; ca_ht: number; cogs: number; marge: number; margePct: number }[];
    expect(marges).toHaveLength(2);
    expect(marges[0]!.designation).toBe('Sac de riz'); // plus grosse marge en tête
    expect(marges[0]!.marge).toBe(28000);
    expect(marges[0]!.margePct).toBeCloseTo(46.7, 1);
    expect(marges[1]!.designation).toBe('Huile 5L');
    expect(marges[1]!.marge).toBe(2000);
  });
});

describe('Cockpit dirigeant — comparaison mensuelle', () => {
  it('compare le mois courant au mois précédent (CA, marge, dépenses) avec variation en %', async () => {
    const e = doE('pilotage-comparaison-1');
    await e.initialiser('pilotage-comparaison-1', 'commerce', 2026);

    // Mois précédent (août) : CA 50000, dépense 10000
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 50000 }],
      modePaiement: 'especes', dateOperation: '2026-08-15',
    });
    await e.creerDepense({
      categorie: 'transport', compteNumero: '614', libelle: 'Transport août', montant: 10000,
      modePaiement: 'especes', dateOperation: '2026-08-15',
    });

    // Mois courant (septembre) : CA 100000 (double), dépense 10000 (stable)
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 100000 }],
      modePaiement: 'especes', dateOperation: '2026-09-04',
    });
    await e.creerDepense({
      categorie: 'transport', compteNumero: '614', libelle: 'Transport septembre', montant: 10000,
      modePaiement: 'especes', dateOperation: '2026-09-04',
    });

    const c = await e.comparaisonMensuelle();
    expect(c.moisCourant.ca).toBe(100000);
    expect(c.moisPrecedent.ca).toBe(50000);
    expect(c.variationCaPct).toBe(100); // +100 %
    expect(c.moisCourant.depenses).toBe(10000);
    expect(c.moisPrecedent.depenses).toBe(10000);
    expect(c.variationDepensesPct).toBe(0);
  });

  it('un mois précédent à zéro donne une variation nulle (pas de division par zéro)', async () => {
    const e = doE('pilotage-comparaison-2');
    await e.initialiser('pilotage-comparaison-2', 'commerce', 2026);
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 50000 }],
      modePaiement: 'especes', dateOperation: '2026-09-04',
    });
    const c = await e.comparaisonMensuelle();
    expect(c.moisPrecedent.ca).toBe(0);
    expect(c.variationCaPct).toBeNull();
  });
});

describe('Cockpit dirigeant — alertes de pilotage', () => {
  it('signale une dépense anormalement élevée par rapport à la moyenne des 3 mois précédents', async () => {
    const e = doE('pilotage-alerte-depense');
    await e.initialiser('pilotage-alerte-depense', 'commerce', 2026);
    for (const mois of ['06', '07', '08']) {
      await e.creerDepense({
        categorie: 'transport', compteNumero: '614', libelle: `Transport ${mois}`, montant: 10000,
        modePaiement: 'especes', dateOperation: `2026-${mois}-10`,
      });
    }
    // Ce mois-ci : 40 000 (moyenne des 3 mois précédents = 10 000) → largement au-dessus du seuil
    await e.creerDepense({
      categorie: 'transport', compteNumero: '614', libelle: 'Transport septembre', montant: 40000,
      modePaiement: 'especes', dateOperation: '2026-09-04',
    });

    const alertes = await e.alertesPilotage();
    const alerte = alertes.find((a) => a.type === 'depense' && a.libelle.includes('Transport'));
    expect(alerte).toBeDefined();
    expect(alerte!.libelle).toContain('40000');
  });

  it('signale une vente conclue sous le coût de revient', async () => {
    const e = doE('pilotage-alerte-perte');
    await e.initialiser('pilotage-alerte-perte', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 10000, modePaiement: 'especes' });
    // Vendu à 8000 alors que le coût est 10000 → perte de 2000/unité
    await e.enregistrerVente({
      lignes: [{ designation: 'Sac de riz', quantite: 1, prixUnitaire: 8000, produitId }],
      modePaiement: 'especes', dateOperation: '2026-09-04',
    });

    const alertes = await e.alertesPilotage();
    const alerte = alertes.find((a) => a.type === 'marge');
    expect(alerte).toBeDefined();
    expect(alerte!.libelle).toContain('2000');
  });

  it('reprend les créances/dettes en retard déjà calculées ailleurs', async () => {
    const e = doE('pilotage-alerte-retard');
    await e.initialiser('pilotage-alerte-retard', 'commerce', 2026);
    const clientId = await e.creerTiers({ type: 'client', nom: 'Client Retard' });
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 20000 }],
      aCredit: true, tiersId: clientId, dateEcheance: '2020-01-01',
    });

    const alertes = await e.alertesPilotage();
    expect(alertes.some((a) => a.type === 'creance' && a.gravite === 'critique')).toBe(true);
  });
});

describe('Cockpit dirigeant — agrégateur', () => {
  it('cockpit() combine trésorerie, marge cumulée, comparaison mensuelle, alertes et top produits', async () => {
    const e = doE('pilotage-cockpit-1');
    await e.initialiser('pilotage-cockpit-1', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 8000, modePaiement: 'especes' });
    await e.enregistrerVente({
      lignes: [{ designation: 'Sac de riz', quantite: 2, prixUnitaire: 15000, produitId }],
      modePaiement: 'especes',
    });

    const cockpit = await e.cockpit();
    expect(cockpit.margeCumulee).toBe(14000); // 2×15000 − 2×8000
    // Trésorerie négative ici est normale : 80000 dépensés en stock, 30000 seulement encaissés en vente.
    expect(cockpit.tresorerie.especes).toBe(30000 - 80000);
    expect(cockpit.comparaisonMensuelle.moisCourant.ca).toBe(30000);
    expect(cockpit.topProduits.length).toBeGreaterThan(0);
    expect(Array.isArray(cockpit.alertes)).toBe(true);
  });
});
