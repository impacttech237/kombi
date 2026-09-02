import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Notifications actives (cloche in-app)', () => {
  it('signale une facture en retard et un produit en rupture', async () => {
    const e = doE('notif-1');
    await e.initialiser('notif-1', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Retard' });
    const factureId = await e.creerFacture({
      type: 'facture', tiersId, dateEcheance: '2024-01-01',
      lignes: [{ designation: 'Prestation', quantite: 1, prixUnitaire: 10000 }],
    });
    await e.emettreFacture(factureId, 'ENT');
    const produitId = await e.creerProduit({ nom: 'Savon', prixVente: 1000, seuilAlerte: 0 });
    await e.entrerStock({ produitId, quantite: 2, coutUnitaire: 300, modePaiement: 'especes' });
    await e.enregistrerVente({
      lignes: [{ designation: 'Savon', quantite: 2, prixUnitaire: 1000, produitId }], modePaiement: 'especes',
    });

    const notifs = await e.notificationsActives('reel_simplifie') as { type: string; gravite: string; libelle: string }[];
    expect(notifs.some((n) => n.type === 'facture' && n.gravite === 'critique')).toBe(true);
    expect(notifs.some((n) => n.type === 'stock' && n.gravite === 'critique')).toBe(true);
    // Régime réel : pas d'échéance IGS à signaler.
    expect(notifs.some((n) => n.type === 'fiscal')).toBe(false);
  });

  it('aucune notification quand tout est sous contrôle', async () => {
    const e = doE('notif-2');
    await e.initialiser('notif-2', 'commerce', 2026);
    const notifs = await e.notificationsActives('reel_simplifie');
    expect(notifs).toHaveLength(0);
  });
});
