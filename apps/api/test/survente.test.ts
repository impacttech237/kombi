import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Sur-vente non bloquante mais tracée (spec §4)', () => {
  it('vendre plus que le stock affiché n\'est pas bloqué, et enSurvente=true', async () => {
    const e = doE('survente-1');
    await e.initialiser('survente-1', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Savon', prixVente: 1000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 3, coutUnitaire: 400, modePaiement: 'especes' });

    const res = await e.enregistrerVente({
      lignes: [{ designation: 'Savon', quantite: 5, prixUnitaire: 1000, produitId }],
      modePaiement: 'especes',
    });
    expect(res.enSurvente).toBe(true);

    // Le stock affiché plafonne à 0 (jamais négatif), mais le CMV n'est PAS tronqué : il reflète
    // les 5 unités réellement sorties, pas seulement les 3 disponibles.
    const produits = (await e.listerProduits()) as { id: string; stock_actuel: number }[];
    expect(produits.find((p) => p.id === produitId)?.stock_actuel).toBe(0);

    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
    const marge = await e.margeCumulee();
    // CA = 5000, COGS = 5 × 400 = 2000 (pas 3 × 400 = 1200) → marge = 3000
    expect(marge).toBe(3000);
  });

  it('une vente dans la limite du stock n\'est pas signalée en survente', async () => {
    const e = doE('survente-2');
    await e.initialiser('survente-2', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Savon', prixVente: 1000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 10, coutUnitaire: 400, modePaiement: 'especes' });

    const res = await e.enregistrerVente({
      lignes: [{ designation: 'Savon', quantite: 4, prixUnitaire: 1000, produitId }],
      modePaiement: 'especes',
    });
    expect(res.enSurvente).toBe(false);
  });
});
