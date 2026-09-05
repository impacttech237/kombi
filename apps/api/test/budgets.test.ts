import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Budgets mensuels — définir, lire, lister', () => {
  it('définit un budget puis le relit, et met à jour en rappelant définirBudget (upsert)', async () => {
    const e = doE('budget-1');
    await e.initialiser('budget-1', 'commerce', 2026);
    await e.definirBudget('2026-09', { caCible: 500000, plafondDepenses: 100000, margeCiblePct: 30 }, { utilisateurId: 'user-1', role: 'gerant' });

    const b = await e.getBudget('2026-09') as { ca_cible: number; plafond_depenses: number; marge_cible_pct: number } | null;
    expect(b).not.toBeNull();
    expect(b!.ca_cible).toBe(500000);
    expect(b!.plafond_depenses).toBe(100000);

    await e.definirBudget('2026-09', { caCible: 600000, plafondDepenses: 100000, margeCiblePct: 30 }, { utilisateurId: 'user-1', role: 'gerant' });
    const b2 = await e.getBudget('2026-09') as { ca_cible: number } | null;
    expect(b2!.ca_cible).toBe(600000); // mis à jour, pas dupliqué

    const liste = await e.listerBudgets();
    expect(liste).toHaveLength(1);
  });

  it('getBudget renvoie null quand aucun budget défini pour ce mois', async () => {
    const e = doE('budget-absent');
    await e.initialiser('budget-absent', 'commerce', 2026);
    expect(await e.getBudget('2026-09')).toBeNull();
  });
});

describe('Analyse des dépenses — comparaison au budget du mois', () => {
  it('signale le dépassement une fois le plafond franchi', async () => {
    const e = doE('budget-depassement');
    await e.initialiser('budget-depassement', 'commerce', 2026);
    await e.definirBudget('2026-09', { plafondDepenses: 20000 });
    await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 25000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const analyse = await e.analyseDepenses();
    expect(analyse.budget).not.toBeNull();
    expect(analyse.budget!.plafondDepenses).toBe(20000);
    expect(analyse.budget!.ecart).toBe(5000);
  });
});

describe('Prévision de trésorerie', () => {
  it('inclut aussi le restant dû des factures à échéance dans l’horizon', async () => {
    const e = doE('budget-prevision-facture');
    await e.initialiser('budget-prevision-facture', 'commerce', 2026);
    const client = await e.creerTiers({ type: 'client', nom: 'Client facturé' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId: client, dateEcheance: '2026-09-14',
      lignes: [{ designation: 'Mission', quantite: 1, prixUnitaire: 50000 }],
    });
    await e.emettreFacture(factureId, 'TEST');
    await e.payerFacture(factureId, 20000, 'orange_money');
    const prevision = await e.previsionTresorerie(30);
    expect(prevision.entreesAttendues).toBe(30000);
  });

  it('inclut les créances à échéance dans l\'horizon et exclut celles hors horizon', async () => {
    const e = doE('budget-prevision-1');
    await e.initialiser('budget-prevision-1', 'commerce', 2026);
    const client = await e.creerTiers({ type: 'client', nom: 'Client A' });
    // Échéance dans 10 jours (aujourd'hui = 2026-09-04 dans cet environnement de test)
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 30000 }],
      aCredit: true, tiersId: client, dateEcheance: '2026-09-14',
    });
    // Échéance dans 80 jours — hors horizon 30 jours
    await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 15000 }],
      aCredit: true, tiersId: client, dateEcheance: '2026-11-23',
    });

    const prevision = await e.previsionTresorerie(30);
    expect(prevision.entreesAttendues).toBe(30000);
  });

  it('projette un solde = solde actuel + entrées attendues − sorties attendues', async () => {
    const e = doE('budget-prevision-2');
    await e.initialiser('budget-prevision-2', 'commerce', 2026);
    const prevision = await e.previsionTresorerie(30);
    expect(prevision.soldeProjete).toBe(prevision.soldeActuel + prevision.entreesAttendues - prevision.sortiesAttendues);
  });
});

describe('Seuil de rentabilité', () => {
  it('calcule le point mort à partir du taux de marge et des charges fixes récurrentes', async () => {
    const e = doE('budget-seuil-1');
    await e.initialiser('budget-seuil-1', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 10000, modePaiement: 'especes' });
    // Marge de 5000/15000 = 33,3 %
    await e.enregistrerVente({ lignes: [{ designation: 'Sac de riz', quantite: 4, prixUnitaire: 15000, produitId }], modePaiement: 'especes' });
    for (const mois of ['06', '07', '08']) {
      await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: `Loyer ${mois}`, montant: 30000, modePaiement: 'especes', recurrente: true, dateOperation: `2026-${mois}-05` });
    }

    const seuil = await e.seuilRentabilite();
    expect(seuil.margeSurCoutsVariablesPct).toBeCloseTo(33.3, 0);
    expect(seuil.chargesFixesMensuelles).toBe(30000);
    expect(seuil.seuilCaMensuel).not.toBeNull();
    expect(seuil.seuilCaMensuel!).toBeGreaterThan(30000); // il faut plus de CA que les seules charges pour les couvrir vu la marge < 100%
  });

  it('renvoie un seuil nul quand aucune vente n\'a encore eu lieu', async () => {
    const e = doE('budget-seuil-2');
    await e.initialiser('budget-seuil-2', 'commerce', 2026);
    const seuil = await e.seuilRentabilite();
    expect(seuil.margeSurCoutsVariablesPct).toBeNull();
    expect(seuil.seuilCaMensuel).toBeNull();
  });
});

describe('Simulation de scénario', () => {
  it('simule une baisse de ventes en conservant le taux de marge', async () => {
    const e = doE('budget-sim-baisse');
    await e.initialiser('budget-sim-baisse', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 10000, modePaiement: 'especes' });
    await e.enregistrerVente({ lignes: [{ designation: 'Sac de riz', quantite: 4, prixUnitaire: 15000, produitId }], modePaiement: 'especes', dateOperation: '2026-09-04' });

    const sim = await e.simulerScenario('baisse_ventes', { pct: 20 }) as { caActuel: number; caProjete: number; impactMarge: number };
    expect(sim.caActuel).toBe(60000);
    expect(sim.caProjete).toBe(48000); // -20%
    expect(sim.impactMarge).toBeLessThan(0);
  });

  it('simule l\'impact d\'un recrutement (coût mensuel soustrait de la marge)', async () => {
    const e = doE('budget-sim-recrutement');
    await e.initialiser('budget-sim-recrutement', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 15000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 10000, modePaiement: 'especes' });
    await e.enregistrerVente({ lignes: [{ designation: 'Sac de riz', quantite: 4, prixUnitaire: 15000, produitId }], modePaiement: 'especes', dateOperation: '2026-09-04' });

    const sim = await e.simulerScenario('recrutement_investissement', { coutMensuel: 15000 }) as { margeActuelle: number; margeProjetee: number };
    expect(sim.margeProjetee).toBe(sim.margeActuelle - 15000);
  });
});
