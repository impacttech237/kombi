import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Annulation de vente (retour / erreur de caisse)', () => {
  it('annule une vente : contre-passe l\'écriture et remet le stock', async () => {
    const e = doE('annul-1');
    await e.initialiser('annul-1', 'commerce', 2026);
    const produitId = await e.creerProduit({ nom: 'Savon', prixVente: 1000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 20, coutUnitaire: 400, modePaiement: 'especes' });

    const { venteId } = await e.enregistrerVente({
      lignes: [{ designation: 'Savon', quantite: 5, prixUnitaire: 1000, produitId }],
      modePaiement: 'especes',
    });
    expect(await e.caCumule()).toBe(5000);
    const produitApresVente = (await e.listerProduits()).find((p: { id: string }) => p.id === produitId) as
      { stock_actuel: number } | undefined;
    expect(produitApresVente?.stock_actuel).toBe(15);

    const res = await e.annulerVente(venteId);
    expect(res.statut).toBe('annulee');

    // Le CA net redevient nul (la contre-passation neutralise exactement la vente).
    expect(await e.caCumule()).toBe(0);
    const produitApresAnnulation = (await e.listerProduits()).find((p: { id: string }) => p.id === produitId) as
      { stock_actuel: number } | undefined;
    expect(produitApresAnnulation?.stock_actuel).toBe(20);

    // La partie double reste équilibrée après contre-passation.
    const { bilan } = await e.etatsFinanciers();
    expect(bilan.equilibre).toBe(true);
  });

  // Note : le garde-fou « déjà annulée / facture émise » est vérifié par revue de code
  // (`annulerVente()` dans entreprise-do.ts) — un throw synchrone direct dans le DO corrompt
  // parfois le suivi d'isolation du harness de test (@cloudflare/vitest-pool-workers@0.8.60),
  // comme documenté pour les autres gardes similaires (tva.test.ts, facture-depuis-vente.test.ts).
  it('une vente annulée n\'apparaît plus comme vente ouverte dans le CA', async () => {
    const e = doE('annul-2');
    await e.initialiser('annul-2', 'commerce', 2026);
    const { venteId } = await e.enregistrerVente({
      lignes: [{ designation: 'Article', quantite: 1, prixUnitaire: 2000 }],
      modePaiement: 'especes',
    });
    await e.annulerVente(venteId);
    const liste = await e.listerVentesRecentes();
    const v = (liste as { id: string; statut: string }[]).find((x) => x.id === venteId);
    expect(v?.statut).toBe('annulee');
  });
});
