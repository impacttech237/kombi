import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Sauvegarde / restauration des Durable Objects (audit infra 2026-09-03, point 1)', () => {
  it('export → import dans un DO neuf reproduit fidèlement écritures, tiers et trésorerie', async () => {
    const source = doE('sauvegarde-source-x1');
    await source.initialiser('sauvegarde-source-x1', 'commerce', 2026);
    await source.creerTiers({ nom: 'Client Fidèle', type: 'client' });
    await source.enregistrerVente({
      lignes: [{ designation: 'Sac de riz', quantite: 2, prixUnitaire: 15000 }], modePaiement: 'especes',
    });
    await source.creerDepense({
      categorie: 'loyer', compteNumero: '622', libelle: 'Loyer du mois', montant: 50000, modePaiement: 'especes',
    });

    const dump = await source.exporterDonnees();
    expect(dump.tables.length).toBeGreaterThan(0);
    const ecritureRows = dump.tables.find((t) => t.nom === 'ecriture')!.lignes;
    expect(ecritureRows.length).toBeGreaterThanOrEqual(2); // vente + dépense

    const cible = doE('sauvegarde-cible-x1');
    const resultat = await cible.importerDonnees(dump);
    expect(resultat.tablesRestaurees).toBe(dump.tables.length);
    expect(resultat.lignesRestaurees).toBeGreaterThan(0);

    // Les états financiers reconstruits dans le DO cible doivent être équilibrés et identiques.
    const [etatsSource, etatsCible] = await Promise.all([source.etatsFinanciers(), cible.etatsFinanciers()]);
    expect(etatsCible.bilan.equilibre).toBe(true);
    expect(etatsCible.bilan.actif).toEqual(etatsSource.bilan.actif);

    const [tresoSource, tresoCible] = await Promise.all([source.tresorerieDuJour(), cible.tresorerieDuJour()]);
    expect(tresoCible).toEqual(tresoSource);

    const tiersCible = await cible.listerTiers();
    expect(tiersCible).toHaveLength(1);
  });

  it('refuse de restaurer dans un DO qui contient déjà des données (garde-fou anti-écrasement)', async () => {
    const source = doE('sauvegarde-source-x2');
    await source.initialiser('sauvegarde-source-x2', 'commerce', 2026);
    const dump = await source.exporterDonnees();

    const cible = doE('sauvegarde-cible-x2');
    await cible.initialiser('sauvegarde-cible-x2', 'commerce', 2026); // déjà peuplé (module/compte/exercice)

    let erreur: unknown;
    try {
      await cible.importerDonnees(dump);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(Error);
    expect((erreur as Error).message).toMatch(/n'est pas vide/);
  });
});
