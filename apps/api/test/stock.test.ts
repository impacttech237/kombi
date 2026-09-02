import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Stock — inventaire permanent + CMP', () => {
  it('approvisionnement met à jour stock et CMP', async () => {
    const e = doE('stock-1');
    await e.initialiser('stock-1', 'commerce', 2026);
    const pid = await e.creerProduit({ nom: 'Riz 5kg', prixVente: 4000, seuilAlerte: 5 });

    let r = await e.entrerStock({ produitId: pid, quantite: 10, coutUnitaire: 3000, modePaiement: 'especes' });
    expect(r.nouveauStock).toBe(10);
    expect(r.nouveauCmp).toBe(3000);
    // 2e entrée à un coût différent → CMP pondéré
    r = await e.entrerStock({ produitId: pid, quantite: 10, coutUnitaire: 3400, modePaiement: 'especes' });
    expect(r.nouveauStock).toBe(20);
    expect(r.nouveauCmp).toBe(3200); // (30000+34000)/20
  });

  it('une vente de produit décrémente le stock et alimente le CA (COGS équilibré)', async () => {
    const e = doE('stock-2');
    await e.initialiser('stock-2', 'commerce', 2026);
    const pid = await e.creerProduit({ nom: 'Savon', prixVente: 500, seuilAlerte: 3 });
    await e.entrerStock({ produitId: pid, quantite: 20, coutUnitaire: 300, modePaiement: 'especes' });

    const r = await e.enregistrerVente({
      lignes: [{ designation: 'Savon', quantite: 4, prixUnitaire: 500, produitId: pid }],
      modePaiement: 'especes',
    });
    expect(r.totalTtc).toBe(2000);

    const prods = await e.listerProduits();
    const p = prods.find((x) => x.id === pid)!;
    expect(p.stock_actuel).toBe(16); // 20 - 4
    // CA = ventes (classe 7) = 2000 ; l'écriture inclut le COGS 6031/311 mais reste équilibrée
    expect(await e.caCumule()).toBe(2000);
  });

  it('alerte de rupture quand stock <= seuil', async () => {
    const e = doE('stock-3');
    await e.initialiser('stock-3', 'commerce', 2026);
    const pid = await e.creerProduit({ nom: 'Sucre', prixVente: 800, seuilAlerte: 5 });
    await e.entrerStock({ produitId: pid, quantite: 4, coutUnitaire: 600, modePaiement: 'especes' });
    const p = (await e.listerProduits()).find((x) => x.id === pid)!;
    expect(p.en_alerte).toBe(1); // 4 <= 5
  });

  it('distingue « stock bas » (≤ seuil, > 0) de « rupture » (= 0)', async () => {
    const e = doE('stock-4');
    await e.initialiser('stock-4', 'commerce', 2026);
    const pid = await e.creerProduit({ nom: 'Farine', prixVente: 1200, seuilAlerte: 5 });
    await e.entrerStock({ produitId: pid, quantite: 3, coutUnitaire: 700, modePaiement: 'especes' });

    let p = (await e.listerProduits()).find((x) => x.id === pid)!;
    expect(p.en_alerte).toBe(1);
    expect(p.en_rupture).toBe(0); // stock bas (3) mais pas en rupture

    await e.enregistrerVente({
      lignes: [{ designation: 'Farine', quantite: 3, prixUnitaire: 1500, produitId: pid }],
      modePaiement: 'especes',
    });
    p = (await e.listerProduits()).find((x) => x.id === pid)!;
    expect(p.en_alerte).toBe(1);
    expect(p.en_rupture).toBe(1); // stock = 0 → vraie rupture
  });
});
