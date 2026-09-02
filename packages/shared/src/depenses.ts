/**
 * Catégories de dépenses courantes (écran Dépenses) → compte de charge SYSCOHADA associé.
 * Voir docs/reference/05-plan-comptable-ohada.md pour la source des numéros de compte.
 */
export interface CategorieDepense {
  readonly code: string;
  readonly label: string;
  readonly compteNumero: string;
}

export const CATEGORIES_DEPENSE: readonly CategorieDepense[] = [
  { code: 'loyer', label: 'Loyer', compteNumero: '622' },
  { code: 'eau', label: 'Eau', compteNumero: '6051' },
  { code: 'electricite', label: 'Électricité', compteNumero: '6052' },
  { code: 'telecom', label: 'Téléphone / Internet', compteNumero: '628' },
  { code: 'fournitures', label: 'Fournitures de bureau', compteNumero: '6054' },
  { code: 'transport', label: 'Transport', compteNumero: '614' },
  { code: 'assurance', label: 'Assurance', compteNumero: '625' },
  { code: 'publicite', label: 'Publicité', compteNumero: '627' },
  { code: 'frais_bancaires', label: 'Frais bancaires', compteNumero: '631' },
  { code: 'salaires', label: 'Salaires', compteNumero: '661' },
  { code: 'charges_sociales', label: 'Charges sociales (CNPS)', compteNumero: '664' },
  { code: 'impots_taxes', label: 'Impôts & taxes', compteNumero: '641' },
  { code: 'autre', label: 'Autre dépense', compteNumero: '605' },
] as const;

export function compteDeCategorie(code: string): string {
  return CATEGORIES_DEPENSE.find((c) => c.code === code)?.compteNumero ?? '605';
}
