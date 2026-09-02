import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Ajustement d\'inventaire (casse, vol, écart)', () => {
  it('une perte diminue le stock et débite 6031 au CMP courant', async () => {
    const e = doE('ajust-1');
    await e.initialiser('ajust-1', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Savon', prixVente: 1000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 20, coutUnitaire: 400, modePaiement: 'especes' });

    const res = await e.ajusterStock({ produitId, delta: -3, motif: 'Casse' });
    expect(res.nouveauStock).toBe(17);

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
  });

  it('un surplus augmente le stock (débit 311 / crédit 6031)', async () => {
    const e = doE('ajust-2');
    await e.initialiser('ajust-2', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Savon', prixVente: 1000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 400, modePaiement: 'especes' });

    const res = await e.ajusterStock({ produitId, delta: 2, motif: 'Écart d\'inventaire' });
    expect(res.nouveauStock).toBe(12);

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
  });

  it('une perte est clampée à 0 si elle dépasse le stock disponible', async () => {
    const e = doE('ajust-3');
    await e.initialiser('ajust-3', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Savon', prixVente: 1000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 5, coutUnitaire: 400, modePaiement: 'especes' });

    const res = await e.ajusterStock({ produitId, delta: -100, motif: 'Vol' });
    expect(res.nouveauStock).toBe(0);
  });
});
