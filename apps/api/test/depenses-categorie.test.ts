import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Détail des dépenses par catégorie (drill-down analyse)', () => {
  it('liste uniquement les dépenses de la catégorie demandée, sur la période, avec le contexte complet', async () => {
    const e = doE('depenses-categorie-1');
    await e.initialiser('depenses-categorie-1', 'commerce', 2026);
    const fournisseur = await e.creerTiers({ type: 'fournisseur', nom: 'Bureau Plus' });
    await e.creerDepense(
      { categorie: 'fournitures', compteNumero: '6054', libelle: 'Ramettes A4', montant: 15000, modePaiement: 'especes', tiersId: fournisseur, agence: 'Douala', dateOperation: '2026-09-04' },
      { utilisateurId: 'user-marie', role: 'gerant' },
    );
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Course', montant: 5000, modePaiement: 'especes', dateOperation: '2026-09-04' });
    await e.creerDepense({ categorie: 'fournitures', compteNumero: '6054', libelle: 'Ancienne commande', montant: 8000, modePaiement: 'especes', dateOperation: '2026-08-01' });

    const liste = await e.depensesParCategorie('fournitures', { debut: '2026-09-01', fin: '2026-10-01' }) as
      { libelle: string; montant: number; tiers_nom: string | null; agence: string | null; cree_par: string | null; ecriture_id: string | null }[];
    expect(liste).toHaveLength(1);
    expect(liste[0]!.libelle).toBe('Ramettes A4');
    expect(liste[0]!.tiers_nom).toBe('Bureau Plus');
    expect(liste[0]!.agence).toBe('Douala');
    expect(liste[0]!.cree_par).toBe('user-marie');
    expect(liste[0]!.ecriture_id).not.toBeNull();
  });

  it('respecte le filtre agence en plus de la catégorie', async () => {
    const e = doE('depenses-categorie-2');
    await e.initialiser('depenses-categorie-2', 'commerce', 2026);
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Douala', montant: 5000, modePaiement: 'especes', agence: 'Douala', dateOperation: '2026-09-04' });
    await e.creerDepense({ categorie: 'transport', compteNumero: '614', libelle: 'Yaoundé', montant: 3000, modePaiement: 'especes', agence: 'Yaoundé', dateOperation: '2026-09-04' });

    const liste = await e.depensesParCategorie('transport', { debut: '2026-09-01', fin: '2026-10-01' }, 'Douala') as { libelle: string }[];
    expect(liste).toHaveLength(1);
    expect(liste[0]!.libelle).toBe('Douala');
  });

  it('sans période explicite, retombe sur le mois courant', async () => {
    const e = doE('depenses-categorie-3');
    await e.initialiser('depenses-categorie-3', 'commerce', 2026);
    await e.creerDepense({ categorie: 'loyer', compteNumero: '622', libelle: 'Loyer', montant: 50000, modePaiement: 'especes', dateOperation: '2026-09-04' });
    const liste = await e.depensesParCategorie('loyer') as { libelle: string }[];
    expect(liste).toHaveLength(1);
  });
});
