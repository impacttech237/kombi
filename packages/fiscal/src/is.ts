/**
 * Impôt sur les Sociétés (IS) — CGI 2026, Art. 17, 17 bis, 22.
 * Voir docs/reference/04-is.md et 09-validations-onecca.md §6 (minimum de perception et base
 * confirmés). Fondations pour V1 (DSF) — pas encore branché à une route/écran.
 */

import { arrondirFCFA, type FCFA } from '@kombi/shared';
import { TAUX_CAC } from './igs.js';

export const TAUX_IS_DROIT_COMMUN = 0.3; // Art. 17 (1)
export const TAUX_IS_REDUIT = 0.25; // Art. 17 bis : CA <= 3 milliards
export const SEUIL_IS_REDUIT: FCFA = 3_000_000_000;
/** Minimum de perception : 2 % de la base, majoré de 10 % CAC = 2,2 % effectif (Art. 22). */
export const TAUX_MINIMUM_PERCEPTION = 0.02;

/** Taux IS applicable selon le CA (hors CAC). */
export function tauxIS(caAnnuelHT: FCFA): number {
  return caAnnuelHT <= SEUIL_IS_REDUIT ? TAUX_IS_REDUIT : TAUX_IS_DROIT_COMMUN;
}

export interface ResultatIS {
  readonly tauxApplique: number;
  readonly isTheorique: FCFA;
  readonly minimumPerception: FCFA;
  readonly isDu: FCFA;
}

/**
 * Calcule l'IS dû = max(bénéfice * taux, minimum de perception), CAC inclus.
 * baseReference = CA HT de l'exercice précédent (confirmé, docs/reference/09-validations-
 * onecca.md §6) — à alimenter ainsi par l'appelant le jour où l'IS complet est câblé.
 */
export function calculerIS(
  beneficeNetFiscal: FCFA,
  caAnnuelHT: FCFA,
  baseReference: FCFA,
): ResultatIS {
  const taux = tauxIS(caAnnuelHT);
  const isTheorique = arrondirFCFA(Math.max(beneficeNetFiscal, 0) * taux * (1 + TAUX_CAC));
  const minimumPerception = arrondirFCFA(baseReference * TAUX_MINIMUM_PERCEPTION * (1 + TAUX_CAC));
  return {
    tauxApplique: taux,
    isTheorique,
    minimumPerception,
    isDu: Math.max(isTheorique, minimumPerception),
  };
}
