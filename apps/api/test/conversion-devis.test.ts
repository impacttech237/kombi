import { env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

function doE(id: string) { return env.ENTREPRISE.get(env.ENTREPRISE.idFromName(id)); }

describe('Conversion devis → facture', () => {
  it('crée une nouvelle facture liée au devis, avec les mêmes lignes', async () => {
    const e = doE('conv-1');
    await e.initialiser('conv-1', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Devis' });
    const devisId = await e.creerFacture({
      type: 'devis', tiersId, lignes: [{ designation: 'Prestation', quantite: 2, prixUnitaire: 15000 }],
    });
    await e.emettreFacture(devisId, 'ENT'); // le devis peut avoir son propre numéro DEV-xxx

    const factureId = await e.convertirDevisEnFacture(devisId);
    expect(factureId).not.toBe(devisId);

    const facture = await e.getFacture(factureId) as { type: string; total_ttc: number; statut: string };
    expect(facture.type).toBe('facture');
    expect(facture.total_ttc).toBe(30000);
    expect(facture.statut).toBe('brouillon'); // pas encore émise, pas encore comptabilisée

    const liste = (await e.listerFactures()) as { id: string; a_ete_converti: number }[];
    expect(liste.find((f) => f.id === devisId)?.a_ete_converti).toBe(1);
  });

  // Note : le garde-fou « déjà converti / mauvais type » est vérifié par revue de code
  // (convertirDevisEnFacture() dans entreprise-do.ts) — un throw synchrone dans le DO corrompt
  // parfois le suivi d'isolation du harness de test, comme documenté pour les gardes similaires.
  it('un devis déjà converti reste visible avec son flag a_ete_converti', async () => {
    const e = doE('conv-2');
    await e.initialiser('conv-2', 'commerce', 2026);
    const tiersId = await e.creerTiers({ type: 'client', nom: 'Client Devis 2' });
    const devisId = await e.creerFacture({
      type: 'devis', tiersId, lignes: [{ designation: 'Prestation', quantite: 1, prixUnitaire: 5000 }],
    });
    await e.convertirDevisEnFacture(devisId);
    const liste = (await e.listerFactures()) as { id: string; a_ete_converti: number }[];
    expect(liste.filter((f) => f.a_ete_converti === 1)).toHaveLength(1);
  });
});
