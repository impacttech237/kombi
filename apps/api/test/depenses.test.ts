import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Dépenses — charges courantes → comptabilité automatique', () => {
  it('le module dépenses est actif par défaut (cœur)', async () => {
    const e = doE('depense-module');
    await e.initialiser('depense-module', 'commerce', 2026);
    expect(await e.moduleActif('depenses')).toBe(true);
  });

  it('une dépense de loyer génère une écriture équilibrée (622 débit / trésorerie crédit)', async () => {
    const e = doE('depense-1');
    await e.initialiser('depense-1', 'commerce', 2026);
    const r = await e.creerDepense({
      categorie: 'loyer', compteNumero: '622', libelle: 'Loyer boutique', montant: 50000,
      modePaiement: 'especes',
    });
    expect(r.deja).toBe(false);

    const liste = await e.listerDepenses();
    expect(liste.length).toBe(1);
    expect(liste[0]!.libelle).toBe('Loyer boutique');

    const { resultat, bilan } = await e.etatsFinanciers();
    expect(resultat.charges).toBe(50000);
    expect(bilan.equilibre).toBe(true);
  });

  it('idempotence : même clientUuid = une seule dépense', async () => {
    const e = doE('depense-idem');
    await e.initialiser('depense-idem', 'commerce', 2026);
    const uuid = 'depense-uuid-fixe';
    const a = await e.creerDepense({
      categorie: 'electricite', compteNumero: '6052', libelle: 'ENEO', montant: 15000,
      modePaiement: 'mtn_momo', clientUuid: uuid,
    });
    const b = await e.creerDepense({
      categorie: 'electricite', compteNumero: '6052', libelle: 'ENEO', montant: 15000,
      modePaiement: 'mtn_momo', clientUuid: uuid,
    });
    expect(b.deja).toBe(true);
    expect(b.depenseId).toBe(a.depenseId);
    const { resultat } = await e.etatsFinanciers();
    expect(resultat.charges).toBe(15000); // pas de doublon
  });

  it('l\'écriture générée par une dépense est immuable comme toute autre écriture', async () => {
    const e = doE('depense-immuable');
    await e.initialiser('depense-immuable', 'service', 2026);
    await e.creerDepense({
      categorie: 'salaires', compteNumero: '661', libelle: 'Salaire septembre', montant: 100000,
      modePaiement: 'virement',
    });
    const ecritures = await e.listerEcritures();
    expect(ecritures.length).toBe(1);
    const { updateBloque, deleteBloque } = await e._verifierImmuabiliteEcriture(ecritures[0]!.id as string);
    expect(updateBloque).toBe(true);
    expect(deleteBloque).toBe(true);
  });
});
