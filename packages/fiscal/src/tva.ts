/**
 * TVA — CGI 2026, Art. 142. Voir docs/reference/03-tva.md.
 * Taux général 17,5 % + 10 % CAC = 19,25 % effectif (taux figurant sur facture).
 */

import { arrondirFCFA, type FCFA } from '@kombi/shared';

export const TAUX_TVA_GENERAL_BASE = 0.175;
export const TAUX_CAC_TVA = 0.1;
/** Taux effectif = 0.175 * 1.10 = 0.1925. */
export const TAUX_TVA_EFFECTIF = 0.1925;
export const TAUX_TVA_ZERO = 0; // exportations de produits taxables (Art. 142 (5))

export type TauxTVA = 0 | 0.1925;

export interface ResultatTVA {
  readonly montantHT: FCFA;
  readonly tva: FCFA;
  readonly montantTTC: FCFA;
  readonly taux: TauxTVA;
}

/** Calcule la TVA à partir d'un montant HT. */
export function tvaDepuisHT(montantHT: FCFA, taux: TauxTVA = TAUX_TVA_EFFECTIF): ResultatTVA {
  const tva = arrondirFCFA(montantHT * taux);
  return { montantHT, tva, montantTTC: montantHT + tva, taux };
}

/** Reconstitue le HT et la TVA à partir d'un montant TTC. */
export function tvaDepuisTTC(montantTTC: FCFA, taux: TauxTVA = TAUX_TVA_EFFECTIF): ResultatTVA {
  const montantHT = arrondirFCFA(montantTTC / (1 + taux));
  return { montantHT, tva: montantTTC - montantHT, montantTTC, taux };
}
