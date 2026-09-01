import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doEntreprise(id: string) {
  return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id));
}

describe('Ventes / caisse → comptabilité automatique', () => {
  it('une vente espèces génère une écriture équilibrée et alimente le CA', async () => {
    const e = doEntreprise('vente-1');
    await e.initialiser('vente-1', 'commerce', 2026);

    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Savon', quantite: 2, prixUnitaire: 500 }],
      modePaiement: 'especes',
    });
    expect(r.totalTtc).toBe(1000);

    // CA cumulé (crédits classe 7) reflète la vente
    expect(await e.caCumule()).toBe(1000);
    // Stats du jour
    const stats = await e.statsJour();
    expect(stats.nbVentes).toBe(1);
    expect(stats.totalJour).toBe(1000);
  });

  it('vente par mobile money (MTN MoMo)', async () => {
    const e = doEntreprise('vente-momo');
    await e.initialiser('vente-momo', 'commerce', 2026);
    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Boisson', quantite: 3, prixUnitaire: 700 }],
      modePaiement: 'mtn_momo',
    });
    expect(r.totalTtc).toBe(2100);
    expect(await e.caCumule()).toBe(2100);
  });

  it('idempotence : même clientUuid = une seule vente', async () => {
    const e = doEntreprise('vente-idem');
    await e.initialiser('vente-idem', 'commerce', 2026);
    const uuid = 'uuid-fixe-123';
    const a = await e.enregistrerVente({ lignes: [{ designation: 'X', quantite: 1, prixUnitaire: 300 }], modePaiement: 'especes', clientUuid: uuid });
    const b = await e.enregistrerVente({ lignes: [{ designation: 'X', quantite: 1, prixUnitaire: 300 }], modePaiement: 'especes', clientUuid: uuid });
    expect(b.deja).toBe(true);
    expect(b.venteId).toBe(a.venteId);
    expect(await e.caCumule()).toBe(300); // pas de doublon
  });

  it('vente de services : crédit sur le compte 706', async () => {
    const e = doEntreprise('vente-svc');
    await e.initialiser('vente-svc', 'service', 2026);
    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Consultation', quantite: 1, prixUnitaire: 25000 }],
      modePaiement: 'virement',
    });
    expect(r.totalTtc).toBe(25000);
    expect(await e.caCumule()).toBe(25000);
  });
});
