import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Dépenses — contexte enrichi (agence, créé par)', () => {
  it('enregistre agence et créateur, et les expose dans la liste', async () => {
    const e = doE('depenses-contexte-1');
    await e.initialiser('depenses-contexte-1', 'commerce', 2026);
    await e.creerDepense(
      { categorie: 'transport', compteNumero: '614', libelle: 'Carburant', montant: 15000, modePaiement: 'especes', agence: 'Agence Bonanjo' },
      { utilisateurId: 'user-marie', role: 'gerant' },
    );
    const liste = await e.listerDepenses() as { agence: string | null; cree_par: string | null; libelle: string }[];
    const d = liste.find((x) => x.libelle === 'Carburant')!;
    expect(d.agence).toBe('Agence Bonanjo');
    expect(d.cree_par).toBe('user-marie');
  });

  it('agence est facultative (reste null si absente)', async () => {
    const e = doE('depenses-contexte-2');
    await e.initialiser('depenses-contexte-2', 'commerce', 2026);
    await e.creerDepense(
      { categorie: 'eau', compteNumero: '6051', libelle: 'Facture Eneo', montant: 8000, modePaiement: 'especes' },
      { utilisateurId: 'user-paul', role: 'admin' },
    );
    const liste = await e.listerDepenses() as { agence: string | null; cree_par: string | null }[];
    expect(liste[0]!.agence).toBeNull();
    expect(liste[0]!.cree_par).toBe('user-paul');
  });
});

describe('Dépenses — analyse (répartition, évolution, fournisseurs, anomalies)', () => {
  it('répartit par catégorie, calcule le total et signale les fournisseurs les plus coûteux', async () => {
    const e = doE('depenses-analyse-1');
    await e.initialiser('depenses-analyse-1', 'commerce', 2026);
    const fournisseur = await e.creerTiers({ type: 'fournisseur', nom: 'Total Énergies' });

    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Carburant 1', montant: 20000, modePaiement: 'especes', tiersId: fournisseur, dateOperation: '2026-09-04' });
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Carburant 2', montant: 15000, modePaiement: 'especes', tiersId: fournisseur, dateOperation: '2026-09-04' });
    await e.creerDepense({ categorie: 'eau', compteNumero: '6051', libelle: 'Eneo', montant: 8000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const analyse = await e.analyseDepenses();
    expect(analyse.total).toBe(43000);
    const transport = analyse.parCategorie.find((c: { categorie: string }) => c.categorie === 'transport')!;
    expect(transport.total).toBe(35000);
    expect(analyse.evolutionMensuelle).toHaveLength(6);
    expect(analyse.evolutionMensuelle[5]!.total).toBe(43000); // dernier mois = mois courant
    expect(analyse.topFournisseurs[0]!.nom).toBe('Total Énergies');
    expect(analyse.topFournisseurs[0]!.total).toBe(35000);
    expect(analyse.budget).toBeNull(); // aucun budget défini pour ce mois
  });

  it('signale les postes en hausse par rapport à la période équivalente précédente', async () => {
    const e = doE('depenses-analyse-hausse');
    await e.initialiser('depenses-analyse-hausse', 'commerce', 2026);
    await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: 'Loyer août', montant: 50000, modePaiement: 'especes', dateOperation: '2026-08-04' });
    await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: 'Loyer septembre', montant: 70000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const analyse = await e.analyseDepenses({ debut: '2026-09-01', fin: '2026-10-01' });
    const loyer = analyse.postesEnHausse.find((c: { categorie: string }) => c.categorie === 'loyer');
    expect(loyer).toBeDefined();
    expect(loyer!.deltaMontant).toBe(20000);
  });

  it('liste les dépenses récurrentes et celles sans justificatif', async () => {
    const e = doE('depenses-analyse-flags');
    await e.initialiser('depenses-analyse-flags', 'commerce', 2026);
    await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 50000, modePaiement: 'especes', recurrente: true, dateOperation: '2026-09-04' });
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Course', montant: 3000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const analyse = await e.analyseDepenses();
    expect(analyse.recurrentes).toHaveLength(1);
    expect((analyse.recurrentes[0] as { libelle: string }).libelle).toBe('Loyer');
    expect(analyse.sansJustificatif.length).toBeGreaterThanOrEqual(2); // aucune pièce attachée dans ce test
  });

  it('détecte une dépense inhabituelle (catégorie neuve, montant significatif)', async () => {
    const e = doE('depenses-analyse-inhabituelle');
    await e.initialiser('depenses-analyse-inhabituelle', 'commerce', 2026);
    await e.creerDepense({ categorie: 'publicite', compteNumero: '627', libelle: 'Campagne réseaux sociaux', montant: 25000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const analyse = await e.analyseDepenses();
    const inhab = analyse.inhabituelles.find((c: { categorie: string }) => c.categorie === 'publicite');
    expect(inhab).toBeDefined();
  });

  it('répartit par agence, avec un regroupement « Sans agence » par défaut', async () => {
    const e = doE('depenses-analyse-agence');
    await e.initialiser('depenses-analyse-agence', 'commerce', 2026);
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Course A', montant: 5000, modePaiement: 'especes', agence: 'Douala', dateOperation: '2026-09-04' });
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Course B', montant: 3000, modePaiement: 'especes', dateOperation: '2026-09-04' });

    const analyse = await e.analyseDepenses();
    const douala = analyse.parAgence.find((a: { agence: string }) => a.agence === 'Douala')!;
    expect(douala.total).toBe(5000);
    const sansAgence = analyse.parAgence.find((a: { agence: string }) => a.agence === 'Sans agence')!;
    expect(sansAgence.total).toBe(3000);
  });
});
