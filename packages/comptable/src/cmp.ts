/**
 * Coût Moyen Pondéré (CMP) recalculé après chaque entrée — inventaire permanent.
 * Source : Guide SYSCOHADA §1.1.4.1. Voir docs/reference/08-stock-inventaire-permanent.md.
 */

import { arrondirFCFA, type FCFA } from '@kombi/shared';

export interface EtatStock {
  readonly quantite: number;
  readonly cmp: FCFA; // coût unitaire moyen pondéré courant
}

/**
 * Nouvelle valeur du CMP après une entrée (achat).
 * CMP = (valeur_stock_avant + valeur_entree) / (qte_avant + qte_entree)
 */
export function cmpApresEntree(
  avant: EtatStock,
  quantiteEntree: number,
  coutUnitaireEntree: FCFA,
): EtatStock {
  if (quantiteEntree <= 0) throw new Error('quantiteEntree doit être > 0');
  const valeurAvant = avant.quantite * avant.cmp;
  const valeurEntree = quantiteEntree * coutUnitaireEntree;
  const quantite = avant.quantite + quantiteEntree;
  const cmp = quantite === 0 ? 0 : arrondirFCFA((valeurAvant + valeurEntree) / quantite);
  return { quantite, cmp };
}

/**
 * Sortie (vente) : la quantité diminue, le CMP reste inchangé.
 * Retourne l'état après sortie et le coût des marchandises vendues (CMV) au CMP.
 */
export function sortieStock(
  avant: EtatStock,
  quantiteSortie: number,
): { etat: EtatStock; cmv: FCFA } {
  if (quantiteSortie <= 0) throw new Error('quantiteSortie doit être > 0');
  if (quantiteSortie > avant.quantite) throw new Error('Stock insuffisant');
  return {
    etat: { quantite: avant.quantite - quantiteSortie, cmp: avant.cmp },
    cmv: arrondirFCFA(quantiteSortie * avant.cmp),
  };
}
