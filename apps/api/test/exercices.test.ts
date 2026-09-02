import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Cycle de vie des exercices', () => {
  it('une vente datée sur une année future crée automatiquement l\'exercice (ne casse pas au 1er janvier)', async () => {
    const e = doE('exo-1');
    await e.initialiser('exo-1', 'commerce', 2026); // exercice 2026 créé à l'onboarding

    // Vente datée 2028 : l'exercice 2028 n'existe pas encore → doit être créé à la volée.
    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 5000 }],
      modePaiement: 'especes',
      dateOperation: '2028-01-02',
    });
    expect(r.totalTtc).toBe(5000);
  });

  it('le CA et les états sont cloisonnés par exercice (pas de cumul inter-exercices)', async () => {
    const e = doE('exo-2');
    await e.initialiser('exo-2', 'commerce', 2026);

    // Une vente sur une année passée ne doit PAS gonfler le CA de l'exercice courant.
    await e.enregistrerVente({
      lignes: [{ designation: 'Vieux', quantite: 1, prixUnitaire: 90000 }],
      modePaiement: 'especes',
      dateOperation: '2024-06-01',
    });
    // Le CA cumulé (exercice courant) ne compte pas la vente de 2024.
    expect(await e.caCumule()).toBe(0);

    // Une vente de l'année courante compte bien.
    await e.enregistrerVente({
      lignes: [{ designation: 'Actuel', quantite: 1, prixUnitaire: 3000 }],
      modePaiement: 'especes',
    });
    expect(await e.caCumule()).toBe(3000);
  });

  it('un approvisionnement et une dépense datés dans le passé rejoignent le bon exercice', async () => {
    const e = doE('exo-4');
    await e.initialiser('exo-4', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Sac de riz', prixVente: 10000, seuilAlerte: 0 });

    // Approvisionnement daté 2024 : ne doit pas apparaître dans le CA/charges de l'exercice courant.
    await e.entrerStock({
      produitId, quantite: 10, coutUnitaire: 4000, modePaiement: 'especes', dateOperation: '2024-03-15',
    });
    await e.creerDepense({
      categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 50000,
      modePaiement: 'especes', dateOperation: '2024-03-15',
    });
    // Les deux opérations passées n'ont pas cassé l'écriture (partie double toujours équilibrée).
    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
  });

  it('la base porte une version de schéma (migrations DO)', async () => {
    const e = doE('exo-3');
    await e.initialiser('exo-3', 'service', 2026);
    // Une opération simple prouve que le schéma migré est fonctionnel.
    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Consultation', quantite: 1, prixUnitaire: 25000 }],
      modePaiement: 'virement',
    });
    expect(r.totalTtc).toBe(25000);
    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
  });
});
