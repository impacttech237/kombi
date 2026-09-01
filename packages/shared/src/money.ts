/**
 * Le franc CFA (XAF) n'a pas de subdivision décimale en usage comptable courant.
 * On manipule des ENTIERS de FCFA partout (bigint côté logique, INTEGER en D1).
 * Jamais de nombre à virgule flottante sur de l'argent.
 */

export type FCFA = number; // entier de francs CFA

/** Arrondit un montant calculé au franc entier (arrondi commercial). */
export function arrondirFCFA(montant: number): FCFA {
  return Math.round(montant);
}

/** Formate un montant pour affichage : 1234567 -> "1 234 567 FCFA". */
export function formaterFCFA(montant: FCFA): string {
  const signe = montant < 0 ? '-' : '';
  const abs = Math.abs(montant).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${signe}${abs} FCFA`;
}

export function estEntierPositif(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}
